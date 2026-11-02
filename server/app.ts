import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { existsSync, statSync, createReadStream } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { z, ZodError } from "zod";
import type {
  SchoolState,
  User,
  SolveInput,
  DashboardDTO,
} from "../shared/contracts.ts";
import {
  loginInputSchema,
  gradeInputSchema,
  demandInputSchema,
  aiInputSchema,
  portfolioInputSchema,
  postInputSchema,
} from "../shared/contracts.ts";
import { Store, ConflictError } from "./db.ts";
import {
  requireRole,
  requireStudent,
  visibleStudents,
  HttpError,
} from "./auth.ts";
import { dashboard, kiosk } from "./projections.ts";
import { solveSchedule, validateSchedule } from "./schedule/index.ts";
import { aiConfigured, generateAI } from "./ai/index.ts";
import {
  configurePush,
  addScheduleNotifications,
  flushNotifications,
} from "./notifications/index.ts";
export const solveInput = (s: SchoolState): SolveInput => ({
  demands: s.demands,
  rooms: s.rooms,
  teachers: s.teacherAvailability,
  slots: s.slots,
  absentTeacherIds: s.absences
    .filter((a) => a.date === s.schoolDate)
    .map((a) => a.teacherId),
  previous: s.schedule.assignments,
  timeLimitMs: 1500,
  maxNodes: 150000,
});
export async function buildApp(
  options: { store?: Store; serveClient?: boolean; logger?: boolean } = {},
) {
  const app = Fastify({ logger: options.logger ?? true, bodyLimit: 200000 });
  const store = options.store || new Store();
  const initial = store.read();
  if (initial.schedule.id === 0) {
    const result = solveSchedule(solveInput(initial));
    if (
      result.status === "feasible" &&
      result.assignments &&
      !validateSchedule(solveInput(initial), result.assignments).length
    )
      store.mutate((s) => {
        s.schedule = {
          id: 1,
          createdAt: new Date().toISOString(),
          assignments: result.assignments!,
          changedDemandIds: [],
        };
        s.scheduleStatus = "current";
      });
  }
  const pushKey = configurePush(store);
  const localOrigins = [
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ];
  const origins = new Set(
    process.env.APP_ORIGIN
      ? [
          process.env.APP_ORIGIN,
          ...(process.env.NODE_ENV !== "production" ? localOrigins : []),
        ]
      : localOrigins,
  );
  await app.register(cookie);
  app.addHook("onRequest", async (req) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin &&
      !origins.has(req.headers.origin)
    )
      throw new HttpError(
        403,
        "Запрос с другого сайта запрещён",
        "ORIGIN_REJECTED",
      );
  });
  app.setErrorHandler((e, req, reply) => {
    if (e instanceof HttpError)
      return reply
        .code(e.status)
        .send({
          error: { code: e.code, message: e.message, details: e.details },
        });
    if (e instanceof ConflictError)
      return reply
        .code(409)
        .send({ error: { code: "REVISION_CONFLICT", message: e.message } });
    if (e instanceof ZodError)
      return reply
        .code(422)
        .send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Проверьте заполненные поля",
            details: e.issues.map((i) => ({
              path: i.path,
              message: i.message,
            })),
          },
        });
    req.log.error(
      { errorName: e instanceof Error ? e.name : "Error" },
      "Request failed",
    );
    return reply
      .code(500)
      .send({
        error: {
          code: "INTERNAL_ERROR",
          message: "Не удалось выполнить действие. Попробуйте снова.",
        },
      });
  });
  const user = (req: { cookies: Record<string, string | undefined> }): User => {
    const u = store.user(req.cookies.pulse_session);
    if (!u) throw new HttpError(401, "Войдите в портал", "UNAUTHORIZED");
    return u;
  };
  const data = (value: unknown) => ({
    data: value,
    revision: store.read().revision,
  });
  app.get("/api/health", () =>
    data({ ok: true, aiConfigured: aiConfigured(), pushConfigured: true }),
  );
  const logins = new Map<string, { attempts: number; until: number }>();
  app.post("/api/auth/login", async (req, reply) => {
    const ip = req.ip;
    const bucket = logins.get(ip);
    if (bucket && bucket.until > Date.now() && bucket.attempts >= 20)
      throw new HttpError(429, "Слишком много попыток. Подождите минуту.");
    const input = loginInputSchema.parse(req.body);
    const u = store
      .read()
      .users.find((u) => u.email === input.email.toLowerCase());
    if (!u || !store.checkPassword(u.id, input.password)) {
      const current =
        bucket && bucket.until > Date.now()
          ? bucket
          : { attempts: 0, until: Date.now() + 60000 };
      current.attempts++;
      logins.set(ip, current);
      throw new HttpError(401, "Неверный логин или пароль", "INVALID_LOGIN");
    }
    logins.delete(ip);
    const token = store.session(u.id);
    reply.setCookie("pulse_session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.APP_ORIGIN?.startsWith("https:") || false,
      path: "/",
      maxAge: 43200,
    });
    return data(u);
  });
  app.post("/api/auth/logout", (req, reply) => {
    if (req.cookies.pulse_session) store.logout(req.cookies.pulse_session);
    reply.clearCookie("pulse_session", { path: "/" });
    return data({ ok: true });
  });
  app.get("/api/me", (req) => data(user(req)));
  app.get("/api/dashboard", (req) =>
    data(dashboard(store.read(), user(req), aiConfigured(), true)),
  );
  app.get<{ Params: { id: string } }>(
    "/mock/bilimclass/students/:id/grades",
    (req) => {
      const s = store.read(),
        u = user(req);
      requireStudent(s, u, req.params.id);
      return data(
        s.grades.filter(
          (g) =>
            g.studentId === req.params.id &&
            (u.role !== "teacher" || u.subjectIds?.includes(g.subjectId)),
        ),
      );
    },
  );
  app.get<{ Params: { id: string } }>(
    "/mock/bilimclass/students/:id/attendance",
    (req) => {
      const s = store.read(),
        u = user(req);
      requireStudent(s, u, req.params.id);
      return data(
        s.attendance.filter(
          (g) =>
            g.studentId === req.params.id &&
            (u.role !== "teacher" || u.subjectIds?.includes(g.subjectId)),
        ),
      );
    },
  );
  app.post("/mock/bilimclass/grades", (req) => {
    requireRole(user(req), "admin");
    const body = gradeInputSchema.parse(req.body);
    const out = store.mutate((s) => {
      const student = s.users.find(
        (x) => x.id === body.studentId && x.role === "student",
      );
      const topic = s.topics.find(
        (t) => t.id === body.topicId && t.subjectId === body.subjectId,
      );
      if (!student || !topic)
        throw new HttpError(422, "Не найден ученик или тема работы");
      const grade = {
        ...body,
        id: randomUUID(),
        assessedAt: body.assessedAt || new Date().toISOString(),
      };
      s.grades.push(grade);
      return grade;
    });
    return data(out.result);
  });
  app.post("/api/ai", async (req) => {
    const u = user(req);
    const body = aiInputSchema.parse(req.body);
    return data(await generateAI(store, store.read(), u, body));
  });
  app.get("/api/portfolio", (req) => {
    const s = store.read(),
      u = user(req),
      ids = new Set(visibleStudents(s, u).map((st) => st.id));
    return data(s.achievements.filter((a) => ids.has(a.studentId)));
  });
  app.get("/api/portfolio/pending", (req) => {
    const s = store.read(),
      u = user(req);
    requireRole(u, "teacher", "admin");
    const ids = new Set(visibleStudents(s, u).map((st) => st.id));
    return data(
      s.achievements.filter(
        (a) => a.status === "pending" && ids.has(a.studentId),
      ),
    );
  });
  app.post("/api/portfolio", (req) => {
    const u = user(req);
    requireRole(u, "student");
    const body = portfolioInputSchema.parse(req.body);
    const a = {
      ...body,
      id: randomUUID(),
      studentId: u.id,
      status: "pending" as const,
      createdAt: new Date().toISOString(),
    };
    store.mutate((s) => {
      s.achievements.push(a);
    });
    return data(a);
  });
  app.post<{ Params: { id: string } }>("/api/portfolio/:id/verify", (req) => {
    const u = user(req);
    requireRole(u, "teacher", "admin");
    const out = store.mutate((s) => {
      const a = s.achievements.find((x) => x.id === req.params.id);
      if (!a) throw new HttpError(404, "Достижение не найдено");
      requireStudent(s, u, a.studentId);
      if (a.studentId === u.id)
        throw new HttpError(403, "Нельзя подтвердить собственное достижение");
      if (a.status === "pending") {
        a.status = "verified";
        a.verifiedBy = u.id;
        a.verifiedAt = new Date().toISOString();
      }
      return a;
    });
    return data(out.result);
  });
  app.post<{ Params: { id: string } }>("/api/goals/:id/complete", (req) => {
    const u = user(req);
    requireRole(u, "student");
    const out = store.mutate((s) => {
      const goal = s.goals.find((g) => g.id === req.params.id);
      if (!goal) throw new HttpError(404, "Цель не найдена");
      if (goal.studentId !== u.id)
        throw new HttpError(403, "Нельзя закрыть чужую цель");
      if (!goal.completedAt) goal.completedAt = new Date().toISOString();
      return goal;
    });
    return data(out.result);
  });
  app.get("/api/leaderboard", (req) => {
    const u = user(req);
    return data(dashboard(store.read(), u, aiConfigured(), true).leaderboard);
  });
  app.get("/api/posts", (req) => {
    const u = user(req);
    return data(dashboard(store.read(), u, aiConfigured(), true).posts);
  });
  app.post("/api/posts", (req) => {
    requireRole(user(req), "admin");
    const body = postInputSchema.parse(req.body);
    if (body.public && body.audience !== "all")
      throw new HttpError(422, "Публичный анонс должен быть доступен всем");
    const post = {
      ...body,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    store.mutate((s) => {
      s.posts.push(post);
    });
    return data(post);
  });
  app.get("/api/schedule", (req) =>
    data(dashboard(store.read(), user(req), aiConfigured(), true).schedule),
  );
  const baseSchema = z.object({ baseRevision: z.number().int().positive() });
  app.post("/api/schedule/generate", async (req) => {
    requireRole(user(req), "admin");
    const body = baseSchema.parse(req.body);
    const s = store.read();
    if (body.baseRevision !== s.revision) throw new ConflictError();
    const input = solveInput(s);
    const result = solveSchedule(input);
    if (result.status === "feasible" && result.assignments) {
      const violations = validateSchedule(input, result.assignments);
      if (violations.length)
        throw new HttpError(
          422,
          "Сгенерированное расписание не прошло проверку",
          "INVALID_SCHEDULE",
          violations,
        );
      store.mutate((current) => {
        current.schedule = {
          id: current.schedule.id + 1,
          createdAt: new Date().toISOString(),
          assignments: result.assignments!,
          changedDemandIds: result.changedDemandIds,
        };
        current.scheduleStatus = "current";
        addScheduleNotifications(current, current.schedule);
      }, s.revision);
      void flushNotifications(store);
    }
    return data(result);
  });
  app.post("/api/schedule/absence", async (req) => {
    requireRole(user(req), "admin");
    const body = baseSchema
      .extend({
        teacherId: z.string(),
        schoolDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(req.body);
    const saved = store.mutate((s) => {
      if (body.schoolDate !== s.schoolDate)
        throw new HttpError(
          422,
          "В прототипе доступна дата текущего учебного дня",
        );
      if (!s.users.some((t) => t.role === "teacher" && t.id === body.teacherId))
        throw new HttpError(422, "Учитель не найден");
      if (
        !s.absences.some(
          (a) => a.teacherId === body.teacherId && a.date === body.schoolDate,
        )
      )
        s.absences.push({ teacherId: body.teacherId, date: body.schoolDate });
      s.scheduleStatus = "needs_replan";
    }, body.baseRevision);
    const input = solveInput(saved.state),
      result = solveSchedule(input);
    if (result.status === "feasible" && result.assignments) {
      const errors = validateSchedule(input, result.assignments);
      if (errors.length)
        throw new HttpError(
          422,
          "Результат замены не прошёл проверку",
          "INVALID_SCHEDULE",
          errors,
        );
      try {
        store.mutate((s) => {
          s.schedule = {
            id: s.schedule.id + 1,
            createdAt: new Date().toISOString(),
            assignments: result.assignments!,
            changedDemandIds: result.changedDemandIds,
          };
          s.scheduleStatus = "current";
          addScheduleNotifications(s, s.schedule);
        }, saved.state.revision);
      } catch (e) {
        if (e instanceof ConflictError)
          throw new HttpError(
            409,
            "Отсутствие сохранено; данные изменились, повторите генерацию.",
            "REVISION_CONFLICT",
            { absenceSaved: true, scheduleStatus: "needs_replan" },
          );
        throw e;
      }
    } else {
      store.mutate((s) => {
        const affected = s.schedule.assignments
          .filter((a) => a.teacherId === body.teacherId)
          .map((a) => a.demandId);
        addScheduleNotifications(
          s,
          { ...s.schedule, changedDemandIds: affected },
          true,
        );
      }, saved.state.revision);
    }
    void flushNotifications(store);
    return data({
      ...result,
      absenceSaved: true,
      scheduleStatus: store.read().scheduleStatus,
    });
  });
  app.post("/api/schedule/demands", (req) => {
    requireRole(user(req), "admin");
    const revision = baseSchema.parse(req.body).baseRevision;
    const body = demandInputSchema.parse(req.body);
    const out = store.mutate((s) => {
      if (
        body.studentIds.some(
          (id) => !s.users.some((u) => u.id === id && u.role === "student"),
        ) ||
        new Set(body.studentIds).size !== body.studentIds.length
      )
        throw new HttpError(422, "Проверьте состав группы");
      if (body.subjectId && !s.subjects.some((x) => x.id === body.subjectId))
        throw new HttpError(422, "Предмет не найден");
      if (
        body.kind !== "event" &&
        (!body.subjectId || body.allowedTeacherIds.length === 0)
      )
        throw new HttpError(422, "Для урока нужен предмет и преподаватель");
      if (
        body.allowedTeacherIds.some(
          (id) =>
            !s.users.some(
              (t) =>
                t.id === id &&
                t.role === "teacher" &&
                (!body.subjectId || t.subjectIds?.includes(body.subjectId)),
            ),
        )
      )
        throw new HttpError(422, "Учитель не ведёт выбранный предмет");
      if (
        body.allowedRoomIds.some((id) => !s.rooms.some((r) => r.id === id)) ||
        body.allowedStartSlots.some((id) => !s.slots.some((t) => t.id === id))
      )
        throw new HttpError(422, "Не найден кабинет или интервал");
      if (body.kind === "pair" && body.durationSlots < 2)
        throw new HttpError(422, "Пара должна занимать минимум два интервала");
      const demand = { ...body, id: randomUUID() };
      s.demands.push(demand);
      s.scheduleStatus = "needs_replan";
      return demand;
    }, revision);
    return data(out.result);
  });
  app.post("/api/schedule/availability", (req) => {
    requireRole(user(req), "admin");
    const body = baseSchema
      .extend({
        teacherId: z.string().optional(),
        roomId: z.string().optional(),
        unavailableSlots: z.array(z.number().int().min(0)).max(8),
      })
      .refine(
        (x) => !!x.teacherId !== !!x.roomId,
        "Выберите учителя или кабинет",
      )
      .parse(req.body);
    store.mutate((s) => {
      if (body.unavailableSlots.some((id) => !s.slots.some((t) => t.id === id)))
        throw new HttpError(422, "Неизвестный интервал");
      if (body.teacherId) {
        const t = s.teacherAvailability.find(
          (t) => t.teacherId === body.teacherId,
        );
        if (!t) throw new HttpError(422, "Учитель не найден");
        t.unavailableSlots = [...new Set(body.unavailableSlots)];
      } else {
        const r = s.rooms.find((r) => r.id === body.roomId);
        if (!r) throw new HttpError(422, "Кабинет не найден");
        r.unavailableSlots = [...new Set(body.unavailableSlots)];
      }
      s.scheduleStatus = "needs_replan";
    }, body.baseRevision);
    return data({ ok: true });
  });
  app.get("/api/notifications", (req) => {
    const u = user(req);
    return data(store.read().notifications.filter((n) => n.userId === u.id));
  });
  app.get("/api/push/public-key", (req) => {
    user(req);
    return data({ publicKey: pushKey });
  });
  app.post("/api/push/subscribe", (req) => {
    const u = user(req);
    const sub = z
      .object({
        endpoint: z.url(),
        keys: z.object({
          p256dh: z.string().min(20).max(300),
          auth: z.string().min(10).max(300),
        }),
      })
      .parse(req.body);
    const endpoint = new URL(sub.endpoint);
    if (
      endpoint.protocol !== "https:" ||
      !(
        endpoint.hostname === "fcm.googleapis.com" ||
        endpoint.hostname.endsWith(".push.services.mozilla.com") ||
        endpoint.hostname === "updates.push.services.mozilla.com" ||
        endpoint.hostname.endsWith(".push.apple.com") ||
        endpoint.hostname.endsWith(".notify.windows.com")
      )
    )
      throw new HttpError(422, "Неизвестный сервис push-уведомлений");
    try {
      store.subscribe(u.id, sub);
    } catch {
      throw new HttpError(
        409,
        "Подписка уже связана с другим пользователем. Откройте отдельный профиль браузера.",
      );
    }
    return data({ ok: true });
  });
  app.get("/api/kiosk", () => data(kiosk(store.read())));
  app.setNotFoundHandler((req, reply) =>
    reply
      .code(404)
      .send({ error: { code: "NOT_FOUND", message: "Страница не найдена" } }),
  );
  if (options.serveClient !== false) {
    if (existsSync(resolve("dist/client/index.html"))) {
      const root = resolve("dist/client");
      const types: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".ico": "image/x-icon",
        ".woff2": "font/woff2",
        ".json": "application/json",
      };
      app.get("/*", (req, reply) => {
        if (req.url.startsWith("/api/") || req.url.startsWith("/mock/"))
          return reply
            .code(404)
            .send({
              error: { code: "NOT_FOUND", message: "Маршрут не найден" },
            });
        const pathname = decodeURIComponent(req.url.split("?")[0]);
        let file = resolve(root, "." + pathname);
        if (file !== root && !file.startsWith(root + sep))
          return reply
            .code(403)
            .send({ error: { code: "FORBIDDEN", message: "Нет доступа" } });
        if (!existsSync(file) || !statSync(file).isFile()) {
          if (extname(pathname))
            return reply
              .code(404)
              .send({
                error: { code: "NOT_FOUND", message: "Файл не найден" },
              });
          file = resolve(root, "index.html");
        }
        reply.header(
          "Cache-Control",
          file.endsWith("sw.js") || file.endsWith("index.html")
            ? "no-store"
            : "public, max-age=3600",
        );
        return reply
          .type(types[extname(file)] || "application/octet-stream")
          .send(createReadStream(file));
      });
    } else {
      const { createServer } = await import("vite");
      const vite = await createServer({
        server: { middlewareMode: true, hmr: false },
        appType: "spa",
      });
      app.all("/*", (req, reply) => {
        if (req.url.startsWith("/api/") || req.url.startsWith("/mock/"))
          return reply
            .code(404)
            .send({
              error: { code: "NOT_FOUND", message: "Маршрут не найден" },
            });
        reply.hijack();
        vite.middlewares(req.raw, reply.raw, () => {
          reply.raw.writeHead(404);
          reply.raw.end();
        });
      });
      app.addHook("onClose", () => vite.close());
    }
  }
  const timer = setInterval(() => {
    void flushNotifications(store);
  }, 10000);
  timer.unref();
  app.addHook("onClose", async () => {
    clearInterval(timer);
    if (!options.store) store.close();
  });
  return app;
}
