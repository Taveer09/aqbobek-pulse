import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import type { SchoolState, User, AIResult } from "../shared/contracts.ts";
import { stateSchema } from "../shared/contracts.ts";
import { seedState } from "./seed.ts";
export class ConflictError extends Error {
  constructor() {
    super("Данные изменились. Обновите страницу и повторите.");
  }
}
export interface SubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
const snapshotTables = {
  state: ["id", "revision", "payload"],
  credentials: ["user_id", "hash"],
  sessions: ["hash", "user_id", "expires_at"],
  subscriptions: ["endpoint", "user_id", "payload"],
  config: ["key", "value"],
  ai_cache: ["key", "payload"],
} as const;
export type StoreSnapshot = Record<
  keyof typeof snapshotTables,
  Record<string, string | number | null>[]
>;
export class Store {
  db: DatabaseSync;
  constructor(
    path = process.env.DATABASE_PATH || resolve("data/pulse.sqlite"),
    initialize = true,
  ) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      `PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS credentials(user_id TEXT PRIMARY KEY,hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS subscriptions(endpoint TEXT PRIMARY KEY,user_id TEXT NOT NULL,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS config(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS ai_cache(key TEXT PRIMARY KEY,payload TEXT NOT NULL);`,
    );
    if (
      initialize &&
      !this.db.prepare("SELECT id FROM state WHERE id=1").get()
    ) {
      const s = seedState();
      this.db
        .prepare("INSERT INTO state VALUES(1,?,?)")
        .run(s.revision, JSON.stringify(s));
      for (const u of s.users)
        this.db
          .prepare("INSERT INTO credentials VALUES(?,?)")
          .run(u.id, this.hashPassword("Pulse2026!"));
    }
  }
  hashPassword(password: string) {
    const salt = randomBytes(16).toString("hex");
    return `${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
  }
  checkPassword(userId: string, password: string) {
    const c = this.db
      .prepare("SELECT hash FROM credentials WHERE user_id=?")
      .get(userId) as { hash: string } | undefined;
    if (!c) return false;
    const [salt, hex] = c.hash.split(":");
    const actual = scryptSync(password, salt, 32);
    return timingSafeEqual(actual, Buffer.from(hex, "hex"));
  }
  read(): SchoolState {
    const r = this.db.prepare("SELECT payload FROM state WHERE id=1").get() as {
      payload: string;
    };
    const s = JSON.parse(r.payload);
    stateSchema.parse(s);
    return s as SchoolState;
  }
  mutate<T>(
    fn: (s: SchoolState) => T,
    expected?: number,
    bumpRevision = true,
  ): { result: T; state: SchoolState } {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const s = this.read();
      if (expected !== undefined && s.revision !== expected)
        throw new ConflictError();
      const result = fn(s);
      if (bumpRevision) s.revision++;
      stateSchema.parse(s);
      this.db
        .prepare("UPDATE state SET revision=?,payload=? WHERE id=1")
        .run(s.revision, JSON.stringify(s));
      this.db.exec("COMMIT");
      return { result, state: s };
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  session(userId: string) {
    const token = randomBytes(32).toString("hex");
    this.db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run(
        createHash("sha256").update(token).digest("hex"),
        userId,
        new Date(Date.now() + 12 * 3600000).toISOString(),
      );
    return token;
  }
  user(token?: string): User | undefined {
    if (!token) return;
    const row = this.db
      .prepare("SELECT user_id FROM sessions WHERE hash=? AND expires_at>?")
      .get(
        createHash("sha256").update(token).digest("hex"),
        new Date().toISOString(),
      ) as { user_id: string } | undefined;
    return row
      ? this.read().users.find((u) => u.id === row.user_id)
      : undefined;
  }
  logout(token: string) {
    this.db
      .prepare("DELETE FROM sessions WHERE hash=?")
      .run(createHash("sha256").update(token).digest("hex"));
  }
  config(key: string, value?: string) {
    if (value !== undefined)
      this.db
        .prepare(
          "INSERT INTO config VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .run(key, value);
    return (
      this.db.prepare("SELECT value FROM config WHERE key=?").get(key) as
        { value: string } | undefined
    )?.value;
  }
  subscribe(userId: string, sub: SubscriptionRecord) {
    const existing = this.db
      .prepare("SELECT user_id FROM subscriptions WHERE endpoint=?")
      .get(sub.endpoint) as { user_id: string } | undefined;
    if (existing && existing.user_id !== userId)
      throw new Error(
        "Подписка принадлежит другой сессии. Используйте отдельный профиль браузера.",
      );
    this.db
      .prepare(
        "INSERT INTO subscriptions VALUES(?,?,?) ON CONFLICT(endpoint) DO UPDATE SET payload=excluded.payload",
      )
      .run(sub.endpoint, userId, JSON.stringify(sub));
  }
  subscriptions(userId: string): SubscriptionRecord[] {
    return (
      this.db
        .prepare("SELECT payload FROM subscriptions WHERE user_id=?")
        .all(userId) as { payload: string }[]
    ).map((x) => JSON.parse(x.payload));
  }
  removeSubscription(endpoint: string) {
    this.db.prepare("DELETE FROM subscriptions WHERE endpoint=?").run(endpoint);
  }
  cache(key: string, value?: AIResult) {
    if (value)
      this.db
        .prepare(
          "INSERT INTO ai_cache VALUES(?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload",
        )
        .run(key, JSON.stringify(value));
    const row = this.db
      .prepare("SELECT payload FROM ai_cache WHERE key=?")
      .get(key) as { payload: string } | undefined;
    return row ? (JSON.parse(row.payload) as AIResult) : undefined;
  }
  exportSnapshot(): StoreSnapshot {
    const result = {} as StoreSnapshot;
    for (const name of Object.keys(snapshotTables) as (keyof StoreSnapshot)[])
      result[name] = this.db.prepare(`SELECT * FROM ${name}`).all() as Record<
        string,
        string | number | null
      >[];
    return result;
  }
  restoreSnapshot(snapshot: StoreSnapshot) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const name of Object.keys(
        snapshotTables,
      ) as (keyof StoreSnapshot)[]) {
        if (!Array.isArray(snapshot[name])) throw new Error("Invalid snapshot");
        this.db.exec(`DELETE FROM ${name}`);
        const columns = snapshotTables[name];
        const insert = this.db.prepare(
          `INSERT INTO ${name} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
        );
        for (const row of snapshot[name])
          insert.run(...columns.map((column) => row[column]));
      }
      this.read();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
