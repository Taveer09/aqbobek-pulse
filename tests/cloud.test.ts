import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Store, type StoreSnapshot } from "../server/db.ts";
import {
  PostgresSnapshots,
  type SnapshotPool,
} from "../server/cloud/postgres.ts";
import { handleCloudRequest, requestRoute } from "../api/handler.ts";

// Transactional test double: independent clients share only committed snapshots.
class MemoryPool implements SnapshotPool {
  snapshot?: StoreSnapshot;
  private queue = Promise.resolve();
  async connect() {
    let draft: StoreSnapshot | undefined;
    let unlock: (() => void) | undefined;
    return {
      query: async (sql: string, values: unknown[] = []) => {
        if (sql.includes("FOR UPDATE")) {
          const previous = this.queue;
          this.queue = new Promise<void>((resolve) => {
            unlock = resolve;
          });
          await previous;
          draft = structuredClone(this.snapshot);
        }
        if (sql.startsWith("SELECT"))
          return {
            rows: this.snapshot
              ? [{ snapshot: structuredClone(draft ?? this.snapshot) }]
              : [],
          };
        if (sql.startsWith("INSERT") && !this.snapshot)
          this.snapshot = JSON.parse(values[1] as string);
        if (sql.startsWith("UPDATE")) draft = JSON.parse(values[1] as string);
        if (sql === "COMMIT") {
          this.snapshot = draft;
          unlock?.();
          unlock = undefined;
        }
        if (sql === "ROLLBACK") {
          unlock?.();
          unlock = undefined;
        }
        return { rows: [] };
      },
      release: () => {
        unlock?.();
      },
    };
  }
}

test("snapshot round-trip preserves authentication, configuration and subscriptions; malformed restore rolls back", () => {
  const source = new Store(":memory:");
  const restored = new Store(":memory:", false);
  try {
    const token = source.session("s1");
    source.config("test-key", "persistent-value");
    source.subscribe("s1", {
      endpoint: "https://example.com/push",
      keys: { p256dh: "test", auth: "test" },
    });
    restored.restoreSnapshot(source.exportSnapshot());
    assert.equal(restored.user(token)?.id, "s1");
    assert(restored.checkPassword("s1", "Pulse2026!"));
    assert.equal(restored.config("test-key"), "persistent-value");
    assert.equal(restored.subscriptions("s1").length, 1);
    const invalid = source.exportSnapshot();
    invalid.state = [];
    assert.throws(() => restored.restoreSnapshot(invalid));
    assert.equal(restored.user(token)?.id, "s1");
    assert.equal(restored.config("test-key"), "persistent-value");
  } finally {
    source.close();
    restored.close();
  }
});

test("concurrent cloud instances serialize writes and a failed operation is rolled back", async () => {
  const pool = new MemoryPool();
  const first = new PostgresSnapshots(pool);
  const second = new PostgresSnapshots(pool);
  await first.initialize();
  await second.initialize();
  const before = await first.run(false, async (store) => store.read().revision);
  await Promise.all(
    [first, second].map((backend) =>
      backend.run(true, async (store) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        store.mutate((s) => {
          s.scheduleStatus = "current";
        });
      }),
    ),
  );
  assert.equal(
    await first.run(false, async (store) => store.read().revision),
    before + 2,
  );
  await assert.rejects(
    first.run(true, async (store) => {
      store.mutate((s) => {
        s.scheduleStatus = "needs_replan";
      });
      throw new Error("abort");
    }),
    /abort/,
  );
  await second.run(false, async (store) => {
    assert.equal(store.read().revision, before + 2);
    assert.equal(store.read().scheduleStatus, "current");
  });
});

test("cloud HTTP login and goal survive separate requests and a new backend instance", async () => {
  const pool = new MemoryPool();
  const server = createServer((req, res) => {
    void handleCloudRequest(req, res, new PostgresSnapshots(pool));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const login = await fetch(`${base}/api/handler?route=/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "student9@pulse.demo",
        password: "Pulse2026!",
      }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const complete = await fetch(`${base}/api/goals/goal-s1-1/complete`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(complete.status, 200);
    const dashboard = await fetch(`${base}/api/dashboard`, {
      headers: { cookie },
    });
    assert.equal(dashboard.status, 200);
    const data = await dashboard.json();
    assert(
      data.data.goals.find((g: { id: string }) => g.id === "goal-s1-1")
        .completedAt,
    );
    await fetch(`${base}/api/auth/logout`, {
      method: "POST",
      headers: { cookie },
    });
    assert.equal(
      (await fetch(`${base}/api/dashboard`, { headers: { cookie } })).status,
      401,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});

test("function routing retains API query filters", () => {
  assert.equal(
    requestRoute("/api/handler?route=/api/dashboard&studentId=s13"),
    "/api/dashboard?studentId=s13",
  );
  assert.equal(
    requestRoute("/mock/bilimclass/students/s1/grades"),
    "/mock/bilimclass/students/s1/grades",
  );
});

test("failed login counters persist when the application is rebuilt", async () => {
  const { buildApp } = await import("../server/app.ts");
  const store = new Store(":memory:");
  try {
    for (let attempt = 0; attempt < 22; attempt++) {
      const app = await buildApp({
        store,
        serveClient: false,
        logger: false,
        backgroundNotifications: false,
      });
      try {
        const response = await app.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: { email: "admin@pulse.demo", password: "incorrect" },
        });
        assert.equal(response.statusCode, attempt < 20 ? 401 : 429);
      } finally {
        await app.close();
      }
    }
    const app = await buildApp({
      store,
      serveClient: false,
      logger: false,
      backgroundNotifications: false,
    });
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "student9@pulse.demo", password: "Pulse2026!" },
      });
      assert.equal(response.statusCode, 200);
    } finally {
      await app.close();
    }
  } finally {
    store.close();
  }
});

test("bounded push flush resumes remaining devices without repeating completed sends", async (t) => {
  const webpush = (await import("web-push")).default;
  const { flushNotifications } =
    await import("../server/notifications/index.ts");
  const store = new Store(":memory:");
  let now = 0;
  const sent: string[] = [];
  t.mock.method(Date, "now", () => now);
  t.mock.method(
    webpush,
    "sendNotification",
    async (sub: { endpoint: string }) => {
      sent.push(sub.endpoint);
      now += 5;
      return { statusCode: 201, body: "", headers: {} };
    },
  );
  try {
    store.mutate((s) => {
      s.notifications.push({
        id: "bounded-test",
        userId: "s1",
        title: "Замена",
        body: "Кабинет",
        version: 1,
        createdAt: new Date().toISOString(),
        delivery: "pending",
        attempts: 0,
      });
    });
    for (let i = 0; i < 4; i++)
      store.subscribe("s1", {
        endpoint: `https://example.com/${i}`,
        keys: { p256dh: "test", auth: "test" },
      });
    await flushNotifications(store, 15);
    assert.equal(sent.length, 3);
    assert.equal(
      store.read().notifications.find((n) => n.id === "bounded-test")!.delivery,
      "pending",
    );
    await flushNotifications(store, 15);
    assert.deepEqual(
      sent,
      [0, 1, 2, 3].map((i) => `https://example.com/${i}`),
    );
    assert.equal(
      store.read().notifications.find((n) => n.id === "bounded-test")!.delivery,
      "sent",
    );
  } finally {
    store.close();
    t.mock.restoreAll();
  }
});
