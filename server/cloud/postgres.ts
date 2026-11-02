import { Pool } from "pg";
import { Store, type StoreSnapshot } from "../db.ts";
import { buildApp } from "../app.ts";
export interface SnapshotClient {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
  release(): void;
}
export interface SnapshotPool {
  connect(): Promise<SnapshotClient>;
}
export class PostgresSnapshots {
  private ready?: Promise<void>;
  constructor(private pool: SnapshotPool) {}
  async initialize() {
    if (!this.ready)
      this.ready = this.create().catch((error) => {
        this.ready = undefined;
        throw error;
      });
    await this.ready;
  }
  private async create() {
    const client = await this.pool.connect();
    try {
      await client.query(
        "CREATE TABLE IF NOT EXISTS pulse_snapshot (id text PRIMARY KEY, snapshot jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())",
      );
      const found = await client.query(
        "SELECT snapshot FROM pulse_snapshot WHERE id=$1",
        ["school"],
      );
      if (found.rows.length) return;
      const store = new Store(":memory:");
      try {
        const app = await buildApp({
          store,
          serveClient: false,
          logger: false,
          backgroundNotifications: false,
        });
        try {
          await client.query(
            "INSERT INTO pulse_snapshot(id,snapshot) VALUES($1,$2::jsonb) ON CONFLICT(id) DO NOTHING",
            ["school", JSON.stringify(store.exportSnapshot())],
          );
        } finally {
          await app.close();
        }
      } finally {
        store.close();
      }
    } finally {
      client.release();
    }
  }
  async run<T>(
    write: boolean,
    operation: (store: Store) => Promise<T>,
  ): Promise<T> {
    await this.initialize();
    const client = await this.pool.connect();
    let transaction = false;
    let store: Store | undefined;
    try {
      if (write) {
        await client.query("BEGIN");
        transaction = true;
        await client.query("SET LOCAL statement_timeout = '45000ms'");
      }
      const row = await client.query(
        "SELECT snapshot FROM pulse_snapshot WHERE id=$1" +
          (write ? " FOR UPDATE" : ""),
        ["school"],
      );
      if (!row.rows[0]) throw new Error("Missing cloud snapshot");
      const payload = row.rows[0].snapshot as StoreSnapshot;
      store = new Store(":memory:", false);
      store.restoreSnapshot(payload);
      const result = await operation(store);
      if (write) {
        await client.query(
          "UPDATE pulse_snapshot SET snapshot=$2::jsonb,updated_at=now() WHERE id=$1",
          ["school", JSON.stringify(store.exportSnapshot())],
        );
        await client.query("COMMIT");
        transaction = false;
      }
      return result;
    } catch (error) {
      if (transaction) await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      store?.close();
      client.release();
    }
  }
}
let backend: PostgresSnapshots | undefined;
export function cloudBackend() {
  if (backend) return backend;
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) throw new Error("Cloud database is not configured");
  const pool = new Pool({
    connectionString,
    max: 4,
    connectionTimeoutMillis: 12000,
    idleTimeoutMillis: 10000,
    allowExitOnIdle: true,
  });
  pool.on("error", () => console.error("Cloud database connection failed"));
  backend = new PostgresSnapshots(pool);
  return backend;
}
