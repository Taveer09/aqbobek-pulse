import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../server/db.ts";
import { buildApp } from "../server/app.ts";
import { schoolToday } from "../server/seed.ts";
let store: Store, app: Awaited<ReturnType<typeof buildApp>>;
const cookies: Record<string, string> = {};
before(async () => {
  store = new Store(":memory:");
  app = await buildApp({ store, serveClient: false, logger: false });
  for (const name of [
    "student9",
    "student10",
    "parent",
    "teacher",
    "substitute",
    "admin",
  ]) {
    const r = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: `${name}@pulse.demo`, password: "Pulse2026!" },
    });
    assert.equal(r.statusCode, 200);
    cookies[name] = r.cookies.find((c) => c.name === "pulse_session")!.value;
  }
});
after(async () => {
  await app.close();
  store.close();
});
const request = (
  as: string,
  method: "GET" | "POST",
  url: string,
  payload?: Record<string, unknown>,
) =>
  app.inject({ method, url, payload, cookies: { pulse_session: cookies[as] } });
test("unauthenticated requests are rejected and login checks passwords", async () => {
  assert.equal((await app.inject("/api/dashboard")).statusCode, 401);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "admin@pulse.demo", password: "wrong" },
      })
    ).statusCode,
    401,
  );
});
test("parent is read-only and cannot fetch another child even by direct URL", async () => {
  const r = await request("parent", "GET", "/api/dashboard");
  assert.equal(r.statusCode, 200);
  assert.deepEqual(
    r.json().data.students.map((s: { id: string }) => s.id),
    ["s1"],
  );
  assert.equal(
    (await request("parent", "GET", "/mock/bilimclass/students/s13/grades"))
      .statusCode,
    403,
  );
  assert.equal(
    (await request("parent", "POST", "/api/goals/goal-s1-1/complete", {}))
      .statusCode,
    403,
  );
  assert.equal(
    (
      await request("student9", "POST", "/api/posts", {
        title: "Not allowed",
        body: "Should fail",
        audience: "all",
        public: false,
      })
    ).statusCode,
    403,
  );
});
test("targeted announcements are filtered server-side for ninth and tenth grade", async () => {
  const a = (await request("student9", "GET", "/api/posts")).json().data;
  const b = (await request("student10", "GET", "/api/posts")).json().data;
  assert(!a.some((p: { id: string }) => p.id === "post-2"));
  assert(b.some((p: { id: string }) => p.id === "post-2"));
  const r = await request("admin", "POST", "/api/posts", {
    title: "Private",
    body: "For tenth grade only",
    audience: 10,
    public: true,
  });
  assert.equal(r.statusCode, 422);
});
test("portfolio is an actual pending→verified transition with a scoped queue", async () => {
  const created = await request("student9", "POST", "/api/portfolio", {
    title: "Новый сертификат",
    category: "certificate",
    url: "https://a1s.kz/",
  });
  assert.equal(created.statusCode, 200);
  const id = created.json().data.id;
  assert.equal(
    (await request("student9", "POST", `/api/portfolio/${id}/verify`, {}))
      .statusCode,
    403,
  );
  assert.equal(
    (await request("student9", "GET", "/api/portfolio/pending")).statusCode,
    403,
  );
  const queue = (
    await request("teacher", "GET", "/api/portfolio/pending")
  ).json().data;
  assert(queue.some((a: { id: string }) => a.id === id));
  assert(!queue.some((a: { studentId: string }) => a.studentId === "s13"));
  const verified = (
    await request("teacher", "POST", `/api/portfolio/${id}/verify`, {})
  ).json().data;
  assert.equal(verified.status, "verified");
  assert.equal(verified.verifiedBy, "t1");
  assert(verified.verifiedAt);
});
test("goal awards only once over its lifetime, including a request after a day change", async () => {
  store.mutate((s) => {
    const g = s.goals.find((g) => g.id === "goal-s1-1")!;
    g.completedAt = new Date(Date.now() - 86400000).toISOString();
  });
  const before = store.read().goals.find((g) => g.id === "goal-s1-1")!;
  await request("student9", "POST", "/api/goals/goal-s1-1/complete", {});
  await request("student9", "POST", "/api/goals/goal-s1-1/complete", {});
  const after = store.read().goals.find((g) => g.id === "goal-s1-1")!;
  assert.equal(after.completedAt, before.completedAt);
  assert.equal(after.points, before.points);
  assert.equal(
    (await request("student10", "POST", "/api/goals/goal-s1-1/complete", {}))
      .statusCode,
    403,
  );
});
test("invalid grade and mismatched topic are rejected without revision changes", async () => {
  const revision = store.read().revision;
  assert.equal(
    (
      await request("admin", "POST", "/mock/bilimclass/grades", {
        studentId: "s1",
        subjectId: "physics",
        topicId: "newton",
        earned: 11,
        maximum: 10,
      })
    ).statusCode,
    422,
  );
  assert.equal(
    (
      await request("admin", "POST", "/mock/bilimclass/grades", {
        studentId: "s1",
        subjectId: "math",
        topicId: "newton",
        earned: 5,
        maximum: 10,
      })
    ).statusCode,
    422,
  );
  assert.equal(store.read().revision, revision);
});
test("schedule respects revision and sick teacher is removed from published assignments", async () => {
  let s = store.read();
  assert.equal(s.scheduleStatus, "current");
  assert.equal(s.schedule.assignments.length, s.demands.length);
  const stale = await request("admin", "POST", "/api/schedule/generate", {
    baseRevision: 1,
  });
  assert.equal(stale.statusCode, 409);
  const sick = await request("admin", "POST", "/api/schedule/absence", {
    teacherId: "t1",
    schoolDate: s.schoolDate,
    baseRevision: s.revision,
  });
  assert.equal(sick.statusCode, 200);
  assert.equal(sick.json().data.status, "feasible");
  s = store.read();
  assert(s.absences.some((a) => a.teacherId === "t1"));
  assert(!s.schedule.assignments.some((a) => a.teacherId === "t1"));
  assert.equal(s.scheduleStatus, "current");
  assert(s.notifications.some((n) => n.userId === "s1"));
  assert(s.notifications.some((n) => ["t2", "t5"].includes(n.userId)));
});
test("impossible replacement keeps sickness and visibly marks previous schedule unresolved", async () => {
  const s = store.read();
  const r = await request("admin", "POST", "/api/schedule/absence", {
    teacherId: "t5",
    schoolDate: s.schoolDate,
    baseRevision: s.revision,
  });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().data.absenceSaved, true);
  assert.equal(r.json().data.status, "infeasible");
  assert.equal(store.read().scheduleStatus, "needs_replan");
  assert(store.read().absences.some((a) => a.teacherId === "t5"));
  const view = (await request("student9", "GET", "/api/dashboard")).json().data;
  assert(
    view.schedule.items.some((i: { unresolved: boolean }) => i.unresolved),
  );
});
test("kiosk is public and excludes private posts, full student names and grades", async () => {
  const r = await app.inject("/api/kiosk");
  assert.equal(r.statusCode, 200);
  const d = r.json().data;
  assert(
    d.posts.every(
      (p: { public: boolean; audience: string }) =>
        p.public && p.audience === "all",
    ),
  );
  assert(!JSON.stringify(d).includes("Садыкова"));
  assert(!("grades" in d));
  assert(!("users" in d));
});
test("cross-origin writes and untrusted push endpoints are rejected", async () => {
  const r = await app.inject({
    method: "POST",
    url: "/api/goals/goal-s1-1/complete",
    headers: { origin: "https://other.example" },
    cookies: { pulse_session: cookies.student9 },
    payload: {},
  });
  assert.equal(r.statusCode, 403);
  const push = await request("student9", "POST", "/api/push/subscribe", {
    endpoint: "https://127.0.0.1/push",
    keys: { p256dh: "a".repeat(40), auth: "a".repeat(25) },
  });
  assert.equal(push.statusCode, 422);
});
test("logout invalidates the server session", async () => {
  await request("student10", "POST", "/api/auth/logout", {});
  assert.equal(
    (await request("student10", "GET", "/api/dashboard")).statusCode,
    401,
  );
});
test("history-only teacher receives no physics topics, risks or AI facts", async () => {
  const r = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: "history@pulse.demo", password: "Pulse2026!" },
  });
  const cookie = r.cookies.find((c) => c.name === "pulse_session")!.value;
  const dashboard = await app.inject({
    url: "/api/dashboard",
    cookies: { pulse_session: cookie },
  });
  const d = dashboard.json().data;
  assert(
    d.analyses.every(
      (a: { topics: { topicId: string }[]; risks: { subjectId: string }[] }) =>
        a.topics.every((t) => t.topicId === "kazakh") &&
        a.risks.every((r) => r.subjectId === "history"),
    ),
  );
});
test("weekly parent facts use only the selected seven-day grade window", async () => {
  const { generateAI } = await import("../server/ai/index.ts");
  const s = store.read();
  const old = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const result = await generateAI(
      store,
      s,
      s.users.find((u) => u.id === "p1")!,
      { kind: "parent_week", studentId: "s1" },
    );
    assert.equal(result.source, "fallback");
    assert(result.text.includes("за последние семь дней"));
    assert(result.text.includes("51.1"));
    assert(!result.text.includes("65.0"));
  } finally {
    if (old !== undefined) process.env.GEMINI_API_KEY = old;
  }
});
test("delivery bookkeeping does not invalidate a fresh domain revision", async () => {
  const local = new Store(":memory:");
  try {
    local.mutate((s) =>
      s.notifications.push({
        id: "n-test",
        userId: "s1",
        title: "Замена",
        body: "Новый кабинет",
        version: 1,
        createdAt: new Date().toISOString(),
        delivery: "pending",
        attempts: 0,
      }),
    );
    const revision = local.read().revision;
    const { flushNotifications } =
      await import("../server/notifications/index.ts");
    await flushNotifications(local);
    assert.equal(local.read().revision, revision);
    assert.equal(local.read().notifications[0].delivery, "not_subscribed");
    local.mutate((s) => {
      s.scheduleStatus = "current";
    }, revision);
  } finally {
    local.close();
  }
});
