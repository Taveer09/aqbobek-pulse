import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.PULSE_BASE_URL || "http://localhost:3002";
const executablePath = process.env.CHROMIUM_PATH || undefined;
mkdirSync("artifacts", { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath });
const contexts = [];
const errors = [];
const results = [];
async function login(name) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ["notifications"],
  });
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByLabel("Электронная почта").fill(name + "@pulse.demo");
  await page.getByLabel("Пароль", { exact: true }).fill("Pulse2026!");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page
    .getByRole("button", { name: "Выйти из аккаунта", exact: true })
    .waitFor();
  return { context, page };
}
async function nav(page, name) {
  await page
    .getByRole("navigation")
    .getByRole("button")
    .filter({ has: page.getByText(name, { exact: true }) })
    .click();
}
async function json(page, path, body) {
  return page.evaluate(
    async ({ path, body }) => {
      const r = await fetch(
        path,
        body === undefined
          ? {}
          : {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            },
      );
      return { status: r.status, ...(await r.json()) };
    },
    { path, body },
  );
}
try {
  const { page: student } = await login("student9");
  await student.screenshot({
    path: "artifacts/student-desktop.png",
    fullPage: true,
  });
  for (const width of [768, 390]) {
    await student.setViewportSize({
      width,
      height: width === 390 ? 844 : 1024,
    });
    await student.waitForTimeout(150);
    assert(
      await student.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `overflow at ${width}`,
    );
    await student.screenshot({
      path: `artifacts/student-${width}.png`,
      fullPage: true,
    });
  }
  await student.setViewportSize({ width: 1440, height: 900 });
  let snapshot = await student.content();
  const cssFile = readdirSync("dist/client/assets").find((x) =>
    x.endsWith(".css"),
  );
  const css = readFileSync("dist/client/assets/" + cssFile, "utf8");
  snapshot = snapshot
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")
    .replace(/<link[^>]*rel="stylesheet"[^>]*>/g, "")
    .replace("</head>", "<style>" + css + "</style></head>");
  writeFileSync("artifacts/student-snapshot.html", snapshot);
  await nav(student, "Цели и портфолио");
  await student
    .getByRole("button", { name: "Закрыть", exact: true })
    .first()
    .click();
  await student
    .getByText("Цель закрыта. Баллы начислены один раз.", { exact: true })
    .waitFor();
  let dashboard = await json(student, "/api/dashboard");
  assert(dashboard.data.goals.some((g) => g.completedAt));
  await student
    .getByLabel("Название", { exact: true })
    .fill("Сертификат браузерной проверки");
  await student
    .getByLabel("Ссылка на документ", { exact: true })
    .fill("https://a1s.kz/");
  await student
    .getByRole("button", { name: "На проверку", exact: true })
    .click();
  await student
    .getByText("Достижение отправлено на проверку учителю.", { exact: true })
    .waitFor();
  results.push(
    "Student: login, graph, goal completion, portfolio submission, responsive screens",
  );
  const { page: teacher } = await login("teacher");
  await teacher.screenshot({
    path: "artifacts/teacher-desktop.png",
    fullPage: true,
  });
  await nav(teacher, "Цели и портфолио");
  const article = teacher
    .locator("article")
    .filter({ hasText: "Сертификат браузерной проверки" });
  await article
    .getByRole("button", { name: "Подтвердить", exact: true })
    .click();
  await article.getByText("Подтверждено", { exact: true }).waitFor();
  results.push("Teacher: EWS and portfolio verification");
  const { page: parent } = await login("parent");
  await parent.screenshot({
    path: "artifacts/parent-desktop.png",
    fullPage: true,
  });
  const forbidden = await json(parent, "/mock/bilimclass/students/s13/grades");
  assert.equal(forbidden.status, 403);
  results.push("Parent: own-child dashboard, other child rejected");
  const { page: admin } = await login("admin");
  await admin.screenshot({
    path: "artifacts/admin-desktop.png",
    fullPage: true,
  });
  await nav(admin, "Расписание");
  await admin
    .getByRole("button", { name: "Сгенерировать расписание", exact: true })
    .click();
  await admin
    .getByText("Опубликована новая допустимая версия расписания.", {
      exact: true,
    })
    .waitFor();
  await admin
    .locator("section")
    .filter({
      has: admin.getByRole("heading", {
        name: "Учитель отсутствует",
        exact: true,
      }),
    })
    .getByRole("combobox")
    .first()
    .selectOption("t1");
  const absenceResponse = admin.waitForResponse(r => r.url().endsWith("/api/schedule/absence") && r.request().method() === "POST");
  await admin
    .getByRole("button", { name: "Отметить болезнь", exact: true })
    .click();
  assert.equal((await absenceResponse).status(), 200);
  await admin
    .getByText("Опубликована новая допустимая версия расписания.", {
      exact: true,
    })
    .waitFor();
  const after = await json(admin, "/api/dashboard");
  assert.equal(after.data.schedule.status, "current");
  assert(after.data.schedule.items.some((i) => i.changed));
  await admin.screenshot({
    path: "artifacts/schedule-desktop.png",
    fullPage: true,
  });
  const inbox = await json(student, "/api/notifications");
  assert(inbox.data.length > 0);
  results.push(
    "Admin: generation, teacher illness, real replacement, student inbox notification",
  );
  const { page: tenth } = await login("student10");
  await nav(tenth, "Лента лицея");
  assert(
    await tenth
      .getByText("Профильные консультации для 10-х классов", { exact: true })
      .isVisible(),
  );
  await nav(student, "Лента лицея");
  assert.equal(
    await student
      .getByText("Профильные консультации для 10-х классов", { exact: true })
      .count(),
    0,
  );
  results.push("Targeted feed: tenth grade visible, ninth grade hidden");
  const kiosk = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  });
  await kiosk.goto(base + "/kiosk", { waitUntil: "networkidle" });
  await kiosk.screenshot({ path: "artifacts/kiosk.png", fullPage: true });
  assert(
    await kiosk.getByText("Актуальные замены", { exact: true }).isVisible(),
  );
  const pub = await json(kiosk, "/api/kiosk");
  assert(pub.data.changes.length > 0);
  assert(pub.data.slots.length > 0);
  results.push("Kiosk: public access and current replacements with time");
  await nav(student, "Уведомления");
  let push;
  try {
    push = await student.evaluate(async () => {
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const r = await (await fetch("/api/push/public-key")).json();
      const text = r.data.publicKey;
      const padded = (text + "=".repeat((4 - (text.length % 4)) % 4))
        .replace(/-/g, "+")
        .replace(/_/g, "/");
      const key = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
      const sub = await Promise.race([
        registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        }),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("push subscription timed out")),
            8000,
          ),
        ),
      ]);
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub),
      });
      return { registered: response.ok };
    });
  } catch (e) {
    push = { registered: false, reason: e.message.split("\n")[0] };
  }
  results.push({ webPush: push });
  assert.equal(errors.length, 0, errors.join("\n"));
  writeFileSync(
    "artifacts/browser-results.json",
    JSON.stringify(
      { results, errors, checkedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ results, errors }, null, 2));
} catch (error) {
  writeFileSync("artifacts/browser-error.txt", String(error));
  throw error;
} finally {
  for (const c of contexts) await c.close();
  await browser.close();
}
