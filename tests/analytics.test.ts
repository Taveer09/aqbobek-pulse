import { test } from "node:test";
import assert from "node:assert/strict";
import cases from "../fixtures/risk-cases.json" with { type: "json" };
import type { SchoolState } from "../shared/contracts.js";
import { analyzeStudent } from "../server/analytics/index.js";

function state(): SchoolState {
  return {
    revision: 1,
    schoolDate: "2026-11-02",
    users: [],
    classes: [],
    subjects: [
      { id: "physics", name: "Физика" },
      { id: "history", name: "История" },
    ],
    topics: [
      {
        id: "root",
        subjectId: "physics",
        name: "Скорость",
        prerequisiteIds: [],
      },
      {
        id: "motion",
        subjectId: "physics",
        name: "Движение",
        prerequisiteIds: ["root"],
      },
      {
        id: "other",
        subjectId: "physics",
        name: "Давление",
        prerequisiteIds: [],
      },
      {
        id: "history-topic",
        subjectId: "history",
        name: "История",
        prerequisiteIds: [],
      },
    ],
    grades: [],
    attendance: [],
    assessments: [
      {
        id: "exam",
        name: "СОЧ",
        subjectId: "physics",
        studentIds: ["s1"],
        date: "2026-11-03",
        topics: [{ topicId: "root", weight: 1 }],
      },
    ],
    resources: [],
    goals: [],
    achievements: [],
    posts: [],
    rooms: [],
    teacherAvailability: [],
    slots: [],
    demands: [],
    absences: [],
    schedule: {
      id: 1,
      createdAt: "2026-11-02T00:00:00Z",
      assignments: [],
      changedDemandIds: [],
    },
    scheduleStatus: "current",
    notifications: [],
  };
}
function addGrades(
  data: SchoolState,
  topicId: string,
  values: number[],
  studentId = "s1",
  maximum = 10,
) {
  const subjectId = data.topics.find(
    (topic) => topic.id === topicId,
  )!.subjectId;
  values.forEach((value, index) =>
    data.grades.push({
      id: `${studentId}:${topicId}:${index}`,
      studentId,
      topicId,
      subjectId,
      earned: value * maximum,
      maximum,
      assessedAt: `2026-11-01T${String(index + 8).padStart(2, "0")}:00:00Z`,
    }),
  );
}
for (const example of cases) {
  test(`risk fixture: ${example.id} — ${example.description}`, () => {
    const data = state();
    for (const [topicId, values] of Object.entries(example.values))
      addGrades(data, topicId, values!);
    data.assessments[0].topics = example.targets;
    const risk = analyzeStudent(data, "s1").risks[0];
    assert.equal(risk.level, example.expectedLevel);
    assert.equal(risk.score, example.expectedScore);
    if (example.id === "partial-coverage") assert.equal(risk.coverage, 0.5);
    assert.ok(risk.reasons.length > 0);
  });
}
test("normalizes different maximum scores and never includes another student", () => {
  const data = state();
  addGrades(data, "root", [0.5, 0.5], "s1", 20);
  addGrades(data, "root", [1, 1], "s2", 100);
  const analysis = analyzeStudent(data, "s1");
  assert.equal(analysis.average, 50);
  assert.equal(
    analysis.topics.find((topic) => topic.topicId === "root")?.mastery,
    0.5,
  );
  assert.equal(analysis.risks[0].score, 50);
});
test("ignores invalid scores and future grades", () => {
  const data = state();
  addGrades(data, "root", [0.2, 0.2]);
  data.grades.push({
    ...data.grades[0],
    id: "future",
    earned: 10,
    assessedAt: "2026-11-04T00:00:00Z",
  });
  data.grades.push({ ...data.grades[0], id: "invalid", maximum: 0 });
  assert.equal(analyzeStudent(data, "s1").average, 20);
});
test("recent grades carry more weight without mutating input", () => {
  const data = state();
  addGrades(data, "root", [0.1, 0.9]);
  data.grades[0].assessedAt = "2026-08-01T10:00:00Z";
  const before = JSON.stringify(data);
  const result = analyzeStudent(data, "s1");
  assert.ok(result.topics[0].mastery! > 0.8);
  assert.equal(JSON.stringify(data), before);
});
test("EWS compares only a single subject and needs six observations", () => {
  const data = state();
  addGrades(data, "root", [0.9, 0.9, 0.9, 0.3, 0.3, 0.3]);
  addGrades(data, "history-topic", [0.2, 0.2, 0.2]);
  const analysis = analyzeStudent(data, "s1");
  const physics = analysis.trends.find(
    (trend) => trend.subjectId === "physics",
  )!;
  const history = analysis.trends.find(
    (trend) => trend.subjectId === "history",
  )!;
  assert.equal(physics.warning, true);
  assert.equal(physics.delta, -0.6);
  assert.equal(history.warning, false);
  assert.equal(history.previous, null);
});
test("an improving subject is not flagged", () => {
  const data = state();
  addGrades(data, "root", [0.2, 0.2, 0.2, 0.8, 0.8, 0.8]);
  assert.equal(analyzeStudent(data, "s1").trends[0].warning, false);
});
test("weekly attendance excludes older days, other students and future dates", () => {
  const data = state();
  data.attendance = [
    {
      id: "a",
      studentId: "s1",
      subjectId: "physics",
      date: "2026-11-02",
      status: "absent",
    },
    {
      id: "b",
      studentId: "s1",
      subjectId: "history",
      date: "2026-10-27",
      status: "absent",
    },
    {
      id: "old",
      studentId: "s1",
      subjectId: "physics",
      date: "2026-10-26",
      status: "absent",
    },
    {
      id: "future",
      studentId: "s1",
      subjectId: "physics",
      date: "2026-11-03",
      status: "absent",
    },
    {
      id: "other",
      studentId: "s2",
      subjectId: "physics",
      date: "2026-11-02",
      status: "absent",
    },
  ];
  assert.equal(analyzeStudent(data, "s1").absences, 2);
});
test("invalid thematic weights do not produce a numeric prediction", () => {
  const data = state();
  addGrades(data, "root", [0.3, 0.3]);
  data.assessments[0].topics = [{ topicId: "root", weight: 0.5 }];
  assert.equal(analyzeStudent(data, "s1").risks[0].score, null);
});
test("an explicit clock controls recent observations deterministically", () => {
  const data = state();
  addGrades(data, "root", [0.3, 0.3]);
  assert.equal(
    analyzeStudent(data, "s1", new Date("2026-10-31T10:00:00Z")).average,
    null,
  );
});
test("risk category agrees with the score displayed at a rounding boundary", () => {
  const data = state();
  addGrades(data, "root", [0.6001, 0.6001]);
  const risk = analyzeStudent(data, "s1").risks[0];
  assert.equal(risk.score, 40);
  assert.equal(risk.level, "medium");
});
