import { performance } from "node:perf_hooks";
import type {
  Assignment,
  Demand,
  SolveInput,
  SolveResult,
} from "../../shared/contracts.js";

/** Structural checks only; the final validator independently checks every occupied resource. */
function checkProblem(input: SolveInput): string[] {
  const errors: string[] = [];
  const slotIds = new Set(input.slots.map((slot) => slot.id));
  const rooms = new Set(input.rooms.map((room) => room.id));
  const teachers = new Set(input.teachers.map((teacher) => teacher.teacherId));
  if (slotIds.size !== input.slots.length)
    errors.push("Повторяются номера учебных интервалов.");
  if (rooms.size !== input.rooms.length)
    errors.push("Повторяются идентификаторы кабинетов.");
  if (teachers.size !== input.teachers.length)
    errors.push("Повторяются идентификаторы учителей.");
  if (
    new Set(input.demands.map((demand) => demand.id)).size !==
    input.demands.length
  )
    errors.push("Повторяются идентификаторы занятий.");
  const orderedSlots = [...input.slots].sort((a, b) => a.id - b.id);
  let previousEnd = -1;
  for (const slot of orderedSlots) {
    const parseTime = (time: string) =>
      /^\d{2}:\d{2}$/.test(time)
        ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
        : NaN;
    const start = parseTime(slot.start);
    const end = parseTime(slot.end);
    if (
      !Number.isInteger(slot.id) ||
      slot.id < 0 ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end > 1440 ||
      Number(slot.start.slice(3)) > 59 ||
      Number(slot.end.slice(3)) > 59 ||
      end <= start ||
      start < previousEnd
    )
      errors.push(`Некорректный учебный интервал ${slot.id}.`);
    previousEnd = end;
  }
  for (const room of input.rooms) {
    if (room.unavailableSlots.some((slot) => !slotIds.has(slot)))
      errors.push(`Кабинет ${room.id}: неизвестный интервал недоступности.`);
  }
  for (const teacher of input.teachers) {
    if (teacher.unavailableSlots.some((slot) => !slotIds.has(slot)))
      errors.push(
        `Учитель ${teacher.teacherId}: неизвестный интервал недоступности.`,
      );
  }
  for (const demand of input.demands) {
    if (
      !demand.id ||
      !Number.isInteger(demand.durationSlots) ||
      demand.durationSlots < 1
    )
      errors.push(`Некорректная длительность занятия ${demand.id}.`);
    if (
      demand.studentIds.length === 0 ||
      new Set(demand.studentIds).size !== demand.studentIds.length
    )
      errors.push(`Некорректный состав учеников занятия ${demand.id}.`);
    if (demand.allowedRoomIds.some((id) => !rooms.has(id)))
      errors.push(`Занятие ${demand.id}: неизвестный кабинет.`);
    if (demand.allowedTeacherIds.some((id) => !teachers.has(id)))
      errors.push(`Занятие ${demand.id}: неизвестный учитель.`);
    if (demand.allowedStartSlots.some((slot) => !slotIds.has(slot)))
      errors.push(`Занятие ${demand.id}: неизвестный интервал начала.`);
    if (demand.kind === "pair" && demand.durationSlots < 2)
      errors.push(`Пара ${demand.id} должна занимать минимум два интервала.`);
  }
  return [...new Set(errors)];
}

/** Validate an already produced timetable without calling the solver's candidate checks. */
export function validateSchedule(
  input: SolveInput,
  assignments: Assignment[],
): string[] {
  const errors = checkProblem(input);
  const demands = new Map(input.demands.map((demand) => [demand.id, demand]));
  const counts = new Map<string, number>();
  const slotIds = new Set(input.slots.map((slot) => slot.id));
  const rooms = new Map(input.rooms.map((room) => [room.id, room]));
  const teachers = new Map(
    input.teachers.map((teacher) => [teacher.teacherId, teacher]),
  );
  const absent = new Set(input.absentTeacherIds);
  const used = new Map<string, string>();
  const laneStarts = new Map<string, number>();
  for (const assignment of assignments) {
    counts.set(assignment.demandId, (counts.get(assignment.demandId) ?? 0) + 1);
    const demand = demands.get(assignment.demandId);
    if (!demand) {
      errors.push(`Назначено неизвестное занятие ${assignment.demandId}.`);
      continue;
    }
    if (
      !Number.isInteger(assignment.startSlot) ||
      !demand.allowedStartSlots.includes(assignment.startSlot)
    )
      errors.push(`Занятие ${demand.id}: недопустимое начало.`);
    const room = rooms.get(assignment.roomId);
    if (!room || !demand.allowedRoomIds.includes(assignment.roomId))
      errors.push(`Занятие ${demand.id}: недопустимый кабинет.`);
    const teacher = assignment.teacherId
      ? teachers.get(assignment.teacherId)
      : undefined;
    if (assignment.teacherId) {
      if (!teacher || !demand.allowedTeacherIds.includes(assignment.teacherId))
        errors.push(`Занятие ${demand.id}: недопустимый учитель.`);
      if (absent.has(assignment.teacherId))
        errors.push(`Занятие ${demand.id}: учитель отсутствует.`);
    } else if (demand.kind !== "event" || demand.allowedTeacherIds.length > 0) {
      errors.push(`Занятие ${demand.id}: не назначен учитель.`);
    }
    if (demand.laneId) {
      const start = laneStarts.get(demand.laneId);
      if (start != null && start !== assignment.startSlot)
        errors.push(
          `Лента ${demand.laneId}: группы начинаются в разное время.`,
        );
      laneStarts.set(demand.laneId, assignment.startSlot);
    }
    for (let offset = 0; offset < demand.durationSlots; offset++) {
      const slot = assignment.startSlot + offset;
      if (!slotIds.has(slot))
        errors.push(
          `Занятие ${demand.id}: длительность выходит за учебные интервалы.`,
        );
      if (room?.unavailableSlots.includes(slot))
        errors.push(
          `Занятие ${demand.id}: кабинет недоступен в интервале ${slot}.`,
        );
      if (teacher?.unavailableSlots.includes(slot))
        errors.push(
          `Занятие ${demand.id}: учитель недоступен в интервале ${slot}.`,
        );
      const keys = [
        `room:${assignment.roomId}:${slot}`,
        ...(assignment.teacherId
          ? [`teacher:${assignment.teacherId}:${slot}`]
          : []),
        ...demand.studentIds.map((id) => `student:${id}:${slot}`),
      ];
      for (const key of keys) {
        const other = used.get(key);
        if (other) errors.push(`Пересечение ${other} и ${demand.id}: ${key}.`);
        else used.set(key, demand.id);
      }
    }
  }
  for (const demand of input.demands) {
    if ((counts.get(demand.id) ?? 0) !== 1)
      errors.push(`Занятие ${demand.id} должно быть назначено ровно один раз.`);
  }
  return [...new Set(errors)];
}

interface Option {
  assignments: Assignment[];
  keys: string[];
  penalty: number;
}
interface Block {
  id: string;
  demands: Demand[];
  options: Option[];
}

export function solveSchedule(input: SolveInput): SolveResult {
  const began = performance.now();
  const timeLimit = Math.max(0, input.timeLimitMs ?? 3000);
  const maxNodes = Math.max(0, Math.floor(input.maxNodes ?? 100_000));
  let nodes = 0;
  let exhausted = false;
  const previous = new Map(
    (input.previous ?? []).map((assignment) => [
      assignment.demandId,
      assignment,
    ]),
  );
  const result = (
    status: SolveResult["status"],
    assignments?: Assignment[],
    violations: string[] = [],
  ): SolveResult => ({
    status,
    ...(assignments ? { assignments } : {}),
    changedDemandIds: assignments
      ? assignments
          .filter((assignment) => {
            const old = previous.get(assignment.demandId);
            return (
              !old ||
              old.startSlot !== assignment.startSlot ||
              old.teacherId !== assignment.teacherId ||
              old.roomId !== assignment.roomId
            );
          })
          .map((assignment) => assignment.demandId)
      : [],
    elapsedMs: Number((performance.now() - began).toFixed(2)),
    violations,
    searchComplete: !exhausted,
    nodes,
  });
  const structuralErrors = checkProblem(input);
  if (structuralErrors.length)
    return result("infeasible", undefined, structuralErrors);
  if (input.demands.length === 0) return result("feasible", []);
  const hasBudget = () => {
    if (nodes >= maxNodes || performance.now() - began >= timeLimit)
      exhausted = true;
    return !exhausted;
  };
  const roomById = new Map(input.rooms.map((room) => [room.id, room]));
  const teacherById = new Map(
    input.teachers.map((teacher) => [teacher.teacherId, teacher]),
  );
  const slotIds = new Set(input.slots.map((slot) => slot.id));
  const absent = new Set(input.absentTeacherIds);
  const blocksById = new Map<string, Block>();
  for (const demand of input.demands) {
    const key = demand.laneId ? `lane:${demand.laneId}` : `demand:${demand.id}`;
    const block = blocksById.get(key) ?? { id: key, demands: [], options: [] };
    block.demands.push(demand);
    blocksById.set(key, block);
  }
  const blocks = [...blocksById.values()];
  for (const block of blocks) {
    const starts = [...new Set(block.demands[0].allowedStartSlots)]
      .filter((start) =>
        block.demands.every((demand) =>
          demand.allowedStartSlots.includes(start),
        ),
      )
      .sort((a, b) => a - b);
    for (const start of starts) {
      const combine = (
        position: number,
        assignments: Assignment[],
        occupied: Set<string>,
        penalty: number,
      ) => {
        if (!hasBudget()) return;
        if (position === block.demands.length) {
          block.options.push({
            assignments: [...assignments],
            keys: [...occupied],
            penalty,
          });
          return;
        }
        const demand = block.demands[position];
        const occupiedSlots = Array.from(
          { length: demand.durationSlots },
          (_, offset) => start + offset,
        );
        if (occupiedSlots.some((slot) => !slotIds.has(slot))) return;
        const teachers: (string | undefined)[] =
          demand.kind === "event" && demand.allowedTeacherIds.length === 0
            ? [undefined]
            : [...new Set(demand.allowedTeacherIds)];
        for (const teacherId of teachers) {
          if (!hasBudget()) return;
          if (
            teacherId &&
            (absent.has(teacherId) ||
              !teacherById.has(teacherId) ||
              occupiedSlots.some((slot) =>
                teacherById.get(teacherId)!.unavailableSlots.includes(slot),
              ))
          )
            continue;
          for (const roomId of new Set(demand.allowedRoomIds)) {
            if (!hasBudget()) return;
            nodes++;
            const room = roomById.get(roomId);
            if (
              !room ||
              occupiedSlots.some((slot) => room.unavailableSlots.includes(slot))
            )
              continue;
            const keys = occupiedSlots.flatMap((slot) => [
              `room:${roomId}:${slot}`,
              ...(teacherId ? [`teacher:${teacherId}:${slot}`] : []),
              ...demand.studentIds.map(
                (studentId) => `student:${studentId}:${slot}`,
              ),
            ]);
            if (keys.some((key) => occupied.has(key))) continue;
            const old = previous.get(demand.id);
            const changed =
              old &&
              old.startSlot === start &&
              old.roomId === roomId &&
              old.teacherId === teacherId
                ? 0
                : 100;
            const assignment: Assignment = {
              demandId: demand.id,
              startSlot: start,
              roomId,
              ...(teacherId ? { teacherId } : {}),
            };
            assignments.push(assignment);
            for (const key of keys) occupied.add(key);
            combine(
              position + 1,
              assignments,
              occupied,
              penalty + changed + start,
            );
            assignments.pop();
            for (const key of keys) occupied.delete(key);
          }
        }
      };
      combine(0, [], new Set(), 0);
      if (exhausted)
        return result("timeout", undefined, [
          "Лимит поиска исчерпан при построении вариантов; невозможность не доказана.",
        ]);
    }
    if (block.options.length === 0)
      return result("infeasible", undefined, [
        `Нет допустимых вариантов для ${block.demands.map((demand) => demand.title).join(", ")}.`,
      ]);
    block.options.sort((a, b) => a.penalty - b.penalty);
  }
  const occupied = new Set<string>();
  const selected: Assignment[] = [];
  let solution: Assignment[] | undefined;
  const search = (remaining: Block[]): boolean => {
    if (remaining.length === 0) {
      solution = selected.map((assignment) => ({ ...assignment }));
      return true;
    }
    if (!hasBudget()) return false;
    let chosen: Block | undefined;
    let choices: Option[] = [];
    for (const block of remaining) {
      if (!hasBudget()) return false;
      const compatible = block.options.filter(
        (option) => !option.keys.some((key) => occupied.has(key)),
      );
      if (compatible.length === 0) return false;
      if (!chosen || compatible.length < choices.length) {
        chosen = block;
        choices = compatible;
      }
    }
    for (const option of choices) {
      if (!hasBudget()) return false;
      nodes++;
      for (const key of option.keys) occupied.add(key);
      selected.push(...option.assignments);
      if (search(remaining.filter((block) => block !== chosen))) return true;
      selected.length -= option.assignments.length;
      for (const key of option.keys) occupied.delete(key);
    }
    return false;
  };
  search(blocks);
  if (solution) {
    const violations = validateSchedule(input, solution);
    return violations.length
      ? result("infeasible", undefined, violations)
      : result("feasible", solution);
  }
  return exhausted
    ? result("timeout", undefined, [
        "Решение за лимит поиска не найдено; невозможность не доказана.",
      ])
    : result("infeasible", undefined, [
        "Все допустимые варианты проверены: полного расписания без конфликтов нет.",
      ]);
}
