import { test } from "node:test";
import assert from "node:assert/strict";
import { solveSchedule, validateSchedule } from "../server/schedule/index.js";
import type { Assignment, Demand, SolveInput } from "../shared/contracts.js";

const demand = (id: string, changes: Partial<Demand> = {}): Demand => ({
  id,
  title: `Занятие ${id}`,
  kind: "lesson",
  subjectId: "physics",
  studentIds: [`student-${id}`],
  durationSlots: 1,
  allowedTeacherIds: ["t1"],
  allowedRoomIds: ["r1"],
  allowedStartSlots: [0, 1, 2, 3],
  ...changes,
});
function problem(demands: Demand[]): SolveInput {
  return {
    demands,
    slots: Array.from({ length: 4 }, (_, id) => ({
      id,
      start: `${String(8 + id).padStart(2, "0")}:00`,
      end: `${String(8 + id).padStart(2, "0")}:45`,
    })),
    rooms: ["r1", "r2", "r3"].map((id) => ({
      id,
      name: id,
      unavailableSlots: [],
    })),
    teachers: ["t1", "t2", "t3"].map((teacherId) => ({
      teacherId,
      unavailableSlots: [],
    })),
    absentTeacherIds: [],
  };
}
function feasible(input: SolveInput): Assignment[] {
  const result = solveSchedule(input);
  assert.equal(result.status, "feasible", JSON.stringify(result));
  assert.deepEqual(validateSchedule(input, result.assignments!), []);
  return result.assignments!;
}
test("all types and atomic lanes fit with no student, teacher or room overlap", () => {
  const input = problem([
    demand("lane-a", {
      studentIds: ["a", "b"],
      laneId: "profile",
      allowedTeacherIds: ["t1"],
      allowedRoomIds: ["r1"],
      allowedStartSlots: [0, 1],
    }),
    demand("lane-b", {
      studentIds: ["c", "d"],
      laneId: "profile",
      allowedTeacherIds: ["t2"],
      allowedRoomIds: ["r2"],
      allowedStartSlots: [0, 1],
    }),
    demand("pair", {
      kind: "pair",
      studentIds: ["a", "b", "c", "d"],
      durationSlots: 2,
      allowedTeacherIds: ["t3"],
      allowedRoomIds: ["r3"],
      allowedStartSlots: [2],
    }),
    demand("hour", {
      kind: "academic_hour",
      studentIds: ["e"],
      allowedTeacherIds: ["t3"],
      allowedRoomIds: ["r3"],
      allowedStartSlots: [1],
    }),
    demand("event", {
      kind: "event",
      studentIds: ["f"],
      allowedTeacherIds: [],
      allowedRoomIds: ["r3"],
      allowedStartSlots: [0],
    }),
  ]);
  const assignments = feasible(input);
  assert.equal(
    assignments.find((a) => a.demandId === "lane-a")!.startSlot,
    assignments.find((a) => a.demandId === "lane-b")!.startSlot,
  );
  assert.equal(
    assignments.find((a) => a.demandId === "event")!.teacherId,
    undefined,
  );
});
test("search backtracks from an early legal choice that blocks the remaining rooms", () => {
  const input = problem([
    demand("a", {
      allowedTeacherIds: ["t1"],
      allowedRoomIds: ["r1", "r2"],
      allowedStartSlots: [0],
    }),
    demand("b", {
      allowedTeacherIds: ["t2"],
      allowedRoomIds: ["r1", "r3"],
      allowedStartSlots: [0],
    }),
    demand("c", {
      allowedTeacherIds: ["t3"],
      allowedRoomIds: ["r1", "r3"],
      allowedStartSlots: [0],
    }),
  ]);
  const assignments = feasible(input);
  assert.equal(assignments.find((a) => a.demandId === "a")!.roomId, "r2");
});
test("a sickness replaces the teacher, reports the change and preserves unrelated bookings", () => {
  const input = problem([
    demand("a", { allowedTeacherIds: ["t1", "t2"], allowedStartSlots: [0] }),
    demand("b", {
      allowedTeacherIds: ["t3"],
      allowedRoomIds: ["r2"],
      allowedStartSlots: [1],
    }),
  ]);
  input.previous = [
    { demandId: "a", startSlot: 0, teacherId: "t1", roomId: "r1" },
    { demandId: "b", startSlot: 1, teacherId: "t3", roomId: "r2" },
  ];
  input.absentTeacherIds = ["t1"];
  const result = solveSchedule(input);
  assert.equal(result.status, "feasible");
  assert.equal(
    result.assignments!.find((a) => a.demandId === "a")!.teacherId,
    "t2",
  );
  assert.deepEqual(result.changedDemandIds, ["a"]);
});
test("teacher and room unavailability applies throughout a double block", () => {
  const input = problem([
    demand("pair", {
      kind: "pair",
      durationSlots: 2,
      allowedTeacherIds: ["t1", "t2"],
      allowedRoomIds: ["r1", "r2"],
      allowedStartSlots: [0],
    }),
  ]);
  input.teachers[0].unavailableSlots = [1];
  input.rooms[0].unavailableSlots = [1];
  const assignments = feasible(input);
  assert.equal(assignments[0].teacherId, "t2");
  assert.equal(assignments[0].roomId, "r2");
});
test("an absent teacher without a substitute is infeasible, not a partial solution", () => {
  const input = problem([demand("a")]);
  input.absentTeacherIds = ["t1"];
  const result = solveSchedule(input);
  assert.equal(result.status, "infeasible");
  assert.equal(result.assignments, undefined);
  assert.equal(result.searchComplete, true);
});
test("a bounded search reports timeout rather than claiming impossibility", () => {
  const result = solveSchedule({ ...problem([demand("a")]), maxNodes: 0 });
  assert.equal(result.status, "timeout");
  assert.equal(result.searchComplete, false);
  assert.equal(result.assignments, undefined);
});
test("an empty list is a complete feasible schedule", () => {
  const result = solveSchedule(problem([]));
  assert.equal(result.status, "feasible");
  assert.deepEqual(result.assignments, []);
});
test("parallel groups containing the same student cannot share a lane", () => {
  const input = problem([
    demand("a", {
      laneId: "x",
      studentIds: ["same"],
      allowedTeacherIds: ["t1"],
      allowedRoomIds: ["r1"],
    }),
    demand("b", {
      laneId: "x",
      studentIds: ["same"],
      allowedTeacherIds: ["t2"],
      allowedRoomIds: ["r2"],
    }),
  ]);
  assert.equal(solveSchedule(input).status, "infeasible");
});
test("independent validator rejects missing, duplicated and unknown demands", () => {
  const input = problem([demand("a")]);
  const assignment = {
    demandId: "a",
    startSlot: 0,
    teacherId: "t1",
    roomId: "r1",
  };
  assert.ok(validateSchedule(input, []).length > 0);
  assert.ok(
    validateSchedule(input, [assignment, assignment]).some((message) =>
      message.includes("ровно один"),
    ),
  );
  assert.ok(
    validateSchedule(input, [{ ...assignment, demandId: "unknown" }]).some(
      (message) => message.includes("неизвестное занятие"),
    ),
  );
});
test("independent validator catches collisions and a whole-class booking against its group", () => {
  const input = problem([
    demand("full", {
      studentIds: ["a", "b"],
      allowedTeacherIds: ["t1"],
      allowedRoomIds: ["r1"],
    }),
    demand("group", {
      studentIds: ["a"],
      allowedTeacherIds: ["t2"],
      allowedRoomIds: ["r2"],
    }),
  ]);
  assert.ok(
    validateSchedule(input, [
      { demandId: "full", startSlot: 0, teacherId: "t1", roomId: "r1" },
      { demandId: "group", startSlot: 0, teacherId: "t2", roomId: "r2" },
    ]).some((message) => message.includes("student:a")),
  );
});
test("independent validator catches asynchronous lane starts and out-of-bounds duration", () => {
  const input = problem([
    demand("a", {
      laneId: "x",
      allowedTeacherIds: ["t1"],
      allowedRoomIds: ["r1"],
    }),
    demand("b", {
      laneId: "x",
      allowedTeacherIds: ["t2"],
      allowedRoomIds: ["r2"],
    }),
  ]);
  assert.ok(
    validateSchedule(input, [
      { demandId: "a", startSlot: 0, teacherId: "t1", roomId: "r1" },
      { demandId: "b", startSlot: 1, teacherId: "t2", roomId: "r2" },
    ]).some((message) => message.includes("разное время")),
  );
  const pair = problem([
    demand("p", { kind: "pair", durationSlots: 2, allowedStartSlots: [3] }),
  ]);
  assert.equal(solveSchedule(pair).status, "infeasible");
  assert.ok(
    validateSchedule(pair, [
      { demandId: "p", startSlot: 3, teacherId: "t1", roomId: "r1" },
    ]).some((message) => message.includes("длительность")),
  );
});
test("unknown teachers are rejected rather than silently assigned", () => {
  const input = problem([demand("a", { allowedTeacherIds: ["ghost"] })]);
  assert.equal(solveSchedule(input).status, "infeasible");
  assert.ok(
    validateSchedule(input, [
      { demandId: "a", startSlot: 0, teacherId: "ghost", roomId: "r1" },
    ]).some((message) => message.includes("учитель")),
  );
});
test("malformed calendar and duplicate demand IDs are rejected", () => {
  const input = problem([demand("a"), demand("a")]);
  input.slots[1].start = "08:15";
  assert.equal(solveSchedule(input).status, "infeasible");
});
test("solver does not mutate the request or previous assignments", () => {
  const input = problem([demand("a")]);
  const before = JSON.stringify(input);
  feasible(input);
  assert.equal(JSON.stringify(input), before);
});
