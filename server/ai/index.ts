import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { User, SchoolState, AIResult } from "../../shared/contracts.ts";
import { analyzeStudent } from "../analytics/index.ts";
import {
  requireStudent,
  requireRole,
  visibleStudents,
  HttpError,
} from "../auth.ts";
import type { Store } from "../db.ts";
const output = z.object({
  text: z.string().min(20).max(5000),
  factIds: z.array(z.string()).min(1),
  resourceIds: z.array(z.string()).max(3),
});
const usage = new Map<string, { calls: number; until: number }>();
export const aiConfigured = () =>
  !!(process.env.GEMINI_API_KEY && process.env.GEMINI_MODEL);
export async function generateAI(
  store: Store,
  s: SchoolState,
  u: User,
  input: {
    kind: AIResult["kind"];
    studentId?: string;
    classId?: string;
    subjectId?: string;
  },
): Promise<AIResult> {
  if (
    input.subjectId &&
    u.role === "teacher" &&
    !u.subjectIds?.includes(input.subjectId)
  )
    throw new HttpError(403, "Нет доступа к предмету");
  let scoped =
    u.role === "teacher"
      ? {
          ...s,
          topics: s.topics.filter((t) => u.subjectIds?.includes(t.subjectId)),
          assessments: s.assessments.filter((a) =>
            u.subjectIds?.includes(a.subjectId),
          ),
          grades: s.grades.filter((g) => u.subjectIds?.includes(g.subjectId)),
          attendance: s.attendance.filter((a) =>
            u.subjectIds?.includes(a.subjectId),
          ),
        }
      : s;
  if (input.kind === "parent_week") {
    const end = new Date(`${s.schoolDate}T23:59:59.999+05:00`).getTime();
    const start = end - 7 * 86400000 + 1;
    scoped = {
      ...scoped,
      grades: scoped.grades.filter((g) => {
        const t = Date.parse(g.assessedAt);
        return t >= start && t <= end;
      }),
    };
  }
  const targets = visibleStudents(s, u);
  let selected = targets;
  if (input.kind === "class_report") {
    requireRole(u, "teacher", "admin");
    if (input.classId) {
      if (u.role === "teacher" && !u.classIds?.includes(input.classId))
        throw new HttpError(403, "Нет доступа к классу");
      selected = targets.filter((x) => x.classId === input.classId);
    }
  } else {
    const id =
      input.studentId || (u.role === "student" ? u.id : u.childIds?.[0]);
    if (!id) throw new HttpError(422, "Выберите ученика");
    requireStudent(s, u, id);
    selected = targets.filter((x) => x.id === id);
    if (input.kind === "parent_week") requireRole(u, "parent", "admin");
  }
  if (!selected.length) throw new HttpError(422, "Нет данных для отчёта");
  const factMap = new Map<string, string>();
  for (const student of selected) {
    const a = analyzeStudent(scoped, student.id);
    const pseudonym = `Ученик ${student.id}`;
    factMap.set(
      `${student.id}-avg`,
      `${pseudonym}: средний результат${input.kind === "parent_week" ? " за последние семь дней" : ""} ${a.average?.toFixed(1) || "нет данных"} из 100`,
    );
    factMap.set(
      `${student.id}-absence`,
      `${pseudonym}: пропущено уроков за 7 дней — ${a.absences}`,
    );
    for (const r of a.risks.filter(
      (r) => !input.subjectId || r.subjectId === input.subjectId,
    )) {
      factMap.set(
        `${student.id}-${r.assessmentId}`,
        `${pseudonym}: ${r.name}, эвристический индекс риска ${r.score === null ? "недостаточно данных" : r.score.toFixed(0) + "/100"}; темы: ${r.topicIds.map((id) => s.topics.find((t) => t.id === id)?.name || id).join(", ")}; ${r.reasons.join("; ")}`,
      );
    }
    for (const t of a.trends)
      if (t.warning)
        factMap.set(
          `${student.id}-trend-${t.subjectId}`,
          `${pseudonym}: спад по предмету ${s.subjects.find((x) => x.id === t.subjectId)?.name}; изменение нормализованного результата ${(100 * (t.delta || 0)).toFixed(1)} п.п.`,
        );
  }
  const resources =
    input.kind === "tutor" ? s.resources.filter((r) => r.verified) : [];
  const key = JSON.stringify({
    kind: input.kind,
    ids: selected.map((x) => x.id),
    role: u.role,
    user: u.id,
    subject: input.subjectId,
    revision: s.revision,
    model: process.env.GEMINI_MODEL,
  });
  const cached = store.cache(key);
  if (cached) return { ...cached, source: "cache" };
  const fallback = (reason: string): AIResult => ({
    source: "fallback",
    kind: input.kind,
    dataRevision: s.revision,
    text:
      [...factMap.values()].join("\n") +
      "\nРекомендация: разберите слабую тему с учителем, затем закрепите её практикой. Это фактический шаблон; новый AI-ответ не получен.",
    factIds: [...factMap.keys()],
    resourceIds: resources.slice(0, 3).map((x) => x.id),
    generatedAt: new Date().toISOString(),
    reason,
  });
  if (!aiConfigured())
    return fallback(
      "AI не подключён: настройте GEMINI_API_KEY и GEMINI_MODEL в локальном .env",
    );
  const now = Date.now();
  for (const [id, bucket] of usage) if (bucket.until < now) usage.delete(id);
  const bucket = usage.get(u.id) || { calls: 0, until: now + 3600000 };
  if (bucket.calls >= 30)
    return fallback(
      "Лимит AI-запросов для этой учётной записи временно исчерпан",
    );
  bucket.calls++;
  usage.set(u.id, bucket);
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const payload = {
      task: input.kind,
      facts: Object.fromEntries(factMap),
      resources: resources.map(({ id, title, topicIds }) => ({
        id,
        title,
        topicIds,
      })),
      instructions:
        "Пиши по-русски, коротко и доброжелательно. Ученические ID называй словами «ученик» без кода. Опиши конкретные наблюдения, слабую тему и действия. Индекс риска не является вероятностью провала. Не выдумывай факты, проценты, ссылки и диагнозы. Не повторяй числовые показатели в тексте: интерфейс покажет их из исходных фактов. Для tutor выбери ровно 3 разных ID материалов, если каталог содержит 3. Для других отчётов resourceIds пустой. factIds должны ссылаться на переданные факты. Возвращай только JSON text, factIds, resourceIds.",
    };
    const request = ai.models.generateContent({
      model: process.env.GEMINI_MODEL!,
      contents: JSON.stringify(payload),
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          properties: {
            text: { type: "string" },
            factIds: { type: "array", items: { type: "string" } },
            resourceIds: { type: "array", items: { type: "string" } },
          },
          required: ["text", "factIds", "resourceIds"],
        },
        maxOutputTokens: 1800,
        httpOptions: { timeout: 12000 },
      },
    });
    const response = await request;
    const answer = output.parse(JSON.parse(response.text || "{}"));
    if (
      answer.factIds.some((id) => !factMap.has(id)) ||
      answer.resourceIds.some((id) => !resources.some((r) => r.id === id)) ||
      new Set(answer.resourceIds).size !== answer.resourceIds.length
    )
      throw new Error("Неверные ссылки на факты");
    if (
      input.kind === "tutor" &&
      resources.length >= 3 &&
      answer.resourceIds.length !== 3
    )
      throw new Error("Нужны три материала");
    if (/\d/.test(answer.text) || /https?:\/\//i.test(answer.text))
      throw new Error("Непроверенные числовые утверждения или ссылки");
    const result: AIResult = {
      ...answer,
      source: "live",
      kind: input.kind,
      dataRevision: s.revision,
      generatedAt: new Date().toISOString(),
      model: process.env.GEMINI_MODEL,
    };
    store.cache(key, result);
    return result;
  } catch {
    return fallback(
      "AI временно недоступен или ответ не прошёл проверку фактов",
    );
  }
}
