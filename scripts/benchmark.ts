import { performance } from "node:perf_hooks";
import { mkdirSync, writeFileSync } from "node:fs";
import { seedState } from "../server/seed.ts";
import { analyzeStudent } from "../server/analytics/index.ts";
import { solveSchedule, validateSchedule } from "../server/schedule/index.ts";
import type { SolveInput } from "../shared/contracts.ts";
const state = seedState();
const input: SolveInput = {
  demands: state.demands,
  rooms: state.rooms,
  teachers: state.teacherAvailability,
  slots: state.slots,
  absentTeacherIds: [],
  timeLimitMs: 1500,
  maxNodes: 150000,
};
const base = solveSchedule(input);
if (
  base.status !== "feasible" ||
  !base.assignments ||
  validateSchedule(input, base.assignments).length
)
  throw new Error("Invalid baseline timetable");
const replacement: SolveInput = {
  ...input,
  previous: base.assignments,
  absentTeacherIds: ["t1"],
};
function measure<T>(run: () => T, verify: (result: T) => void) {
  for (let i = 0; i < 10; i++) verify(run());
  const values: number[] = [];
  for (let i = 0; i < 100; i++) {
    const start = performance.now();
    const result = run();
    values.push(performance.now() - start);
    verify(result);
  }
  values.sort((a, b) => a - b);
  return {
    runs: 100,
    p50_ms: Number(values[49].toFixed(3)),
    p95_ms: Number(values[94].toFixed(3)),
  };
}
const report = {
  measuredAt: new Date().toISOString(),
  node: process.version,
  dataset: {
    kind: "synthetic",
    students: state.users.filter((u) => u.role === "student").length,
    grades: state.grades.length,
    demands: state.demands.length,
    horizon_days: 1,
  },
  analytics: measure(
    () => analyzeStudent(state, "s1"),
    (a) => {
      if (a.studentId !== "s1" || !a.risks.length)
        throw new Error("Missing analysis");
    },
  ),
  schedule: measure(
    () => solveSchedule(input),
    (r) => {
      if (
        r.status !== "feasible" ||
        !r.assignments ||
        validateSchedule(input, r.assignments).length
      )
        throw new Error("Invalid timetable");
    },
  ),
  replacement: measure(
    () => solveSchedule(replacement),
    (r) => {
      if (
        r.status !== "feasible" ||
        !r.assignments ||
        validateSchedule(replacement, r.assignments).length ||
        r.assignments.some((a) => a.teacherId === "t1")
      )
        throw new Error("Invalid replacement");
    },
  ),
  external_llm_calls: 0,
};
mkdirSync("artifacts", { recursive: true });
writeFileSync("artifacts/benchmark.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
