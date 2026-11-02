import assert from "node:assert/strict";
const base = process.env.PULSE_BASE_URL || "http://localhost:3001";
const health = await fetch(base + "/api/health");
assert(health.ok);
assert.equal((await health.json()).data.ok, true);
for (const [email, role] of [
  ["student9", "student"],
  ["student10", "student"],
  ["teacher", "teacher"],
  ["substitute", "teacher"],
  ["parent", "parent"],
  ["admin", "admin"],
]) {
  const login = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `${email}@pulse.demo`,
      password: "Pulse2026!",
    }),
  });
  assert(login.ok, `${email}: login`);
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const r = await fetch(base + "/api/dashboard", { headers: { cookie } });
  assert(r.ok);
  const { data } = await r.json();
  assert.equal(data.user.role, role);
  assert(Array.isArray(data.schedule.items));
  if (role === "student" || role === "parent")
    assert.equal(data.students.length, 1);
  console.log(
    `${email}: ${role}, dashboard OK, timetable v${data.schedule.version}`,
  );
  await fetch(base + "/api/auth/logout", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: "{}",
  });
}
const kiosk = await (await fetch(base + "/api/kiosk")).json();
assert(Array.isArray(kiosk.data.posts));
assert(Array.isArray(kiosk.data.slots));
console.log("Kiosk: public projection OK");
const page = await fetch(base);
assert(page.ok);
assert((await page.text()).includes("Aqbobek"));
console.log("HTML: OK");
