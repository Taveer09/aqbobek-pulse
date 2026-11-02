import type {
  SchoolState,
  User,
  DashboardDTO,
  TimetableItem,
  LeaderboardEntry,
  KioskDTO,
} from "../shared/contracts.ts";
import { visibleStudents } from "./auth.ts";
import { analyzeStudent } from "./analytics/index.ts";
import { schoolToday } from "./seed.ts";
export function leaderboard(s: SchoolState): LeaderboardEntry[] {
  return s.users
    .filter((u) => u.role === "student")
    .map((u) => ({
      studentId: u.id,
      name: u.name,
      className: s.classes.find((c) => c.id === u.classId)?.name || "",
      points: s.goals
        .filter(
          (g) =>
            g.studentId === u.id &&
            g.completedAt &&
            schoolToday(new Date(g.completedAt)) === schoolToday(),
        )
        .reduce((a, g) => a + g.points, 0),
      rank: 0,
    }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "ru"))
    .map((x, i) => ({ ...x, rank: i + 1 }));
}
export function scheduleItems(s: SchoolState, u?: User): TimetableItem[] {
  const ids = u ? new Set(visibleStudents(s, u).map((x) => x.id)) : undefined;
  return s.schedule.assignments
    .flatMap((a) => {
      const d = s.demands.find((d) => d.id === a.demandId);
      if (!d) return [];
      if (
        u &&
        u.role !== "admin" &&
        !d.studentIds.some((id) => ids?.has(id)) &&
        !(u.role === "teacher" && a.teacherId === u.id)
      )
        return [];
      return [
        {
          demandId: d.id,
          title: d.title,
          kind: d.kind,
          startSlot: a.startSlot,
          durationSlots: d.durationSlots,
          teacherName:
            s.users.find((t) => t.id === a.teacherId)?.name ||
            "Без преподавателя",
          roomName: s.rooms.find((r) => r.id === a.roomId)?.name || "—",
          laneId: d.laneId,
          changed: s.schedule.changedDemandIds.includes(d.id),
          unresolved: !!(
            a.teacherId &&
            s.absences.some(
              (x) => x.teacherId === a.teacherId && x.date === s.schoolDate,
            )
          ),
        },
      ];
    })
    .sort(
      (a, b) =>
        a.startSlot - b.startSlot || a.title.localeCompare(b.title, "ru"),
    );
}
export function dashboard(
  s: SchoolState,
  u: User,
  aiConfigured: boolean,
  pushConfigured: boolean,
): DashboardDTO {
  const students = visibleStudents(s, u);
  const ids = new Set(students.map((x) => x.id));
  const classIds = new Set(students.map((x) => x.classId));
  const gradeLevels = new Set(
    s.classes.filter((c) => classIds.has(c.id)).map((c) => c.gradeLevel),
  );
  const grades = s.grades.filter(
    (g) =>
      ids.has(g.studentId) &&
      (u.role !== "teacher" || u.subjectIds?.includes(g.subjectId)),
  );
  const view: SchoolState = {
    ...s,
    subjects: s.subjects.filter(
      (x) => u.role !== "teacher" || u.subjectIds?.includes(x.id),
    ),
    topics: s.topics.filter(
      (x) => u.role !== "teacher" || u.subjectIds?.includes(x.subjectId),
    ),
    assessments: s.assessments.filter(
      (x) => u.role !== "teacher" || u.subjectIds?.includes(x.subjectId),
    ),
    grades,
    attendance: s.attendance.filter(
      (a) =>
        ids.has(a.studentId) &&
        (u.role !== "teacher" || u.subjectIds?.includes(a.subjectId)),
    ),
  };
  const analyses = students.map((st) => analyzeStudent(view, st.id));
  const radar =
    u.role === "admin"
      ? s.classes
          .map((c) => c.gradeLevel)
          .filter((x, i, a) => a.indexOf(x) === i)
          .flatMap((gradeLevel) =>
            s.subjects.map((subject) => {
              const group = students.filter(
                (st) =>
                  s.classes.find((c) => c.id === st.classId)?.gradeLevel ===
                  gradeLevel,
              );
              const groupIds = new Set(group.map((x) => x.id));
              const gs = grades.filter(
                (g) => groupIds.has(g.studentId) && g.subjectId === subject.id,
              );
              return {
                gradeLevel,
                subjectId: subject.id,
                subjectName: subject.name,
                average: gs.length
                  ? gs.reduce((a, g) => a + (g.earned / g.maximum) * 100, 0) /
                    gs.length
                  : null,
                studentCount: group.length,
                highRiskCount: analyses.filter(
                  (a) =>
                    groupIds.has(a.studentId) &&
                    a.risks.some(
                      (r) => r.subjectId === subject.id && r.level === "high",
                    ),
                ).length,
              };
            }),
          )
      : [];
  return {
    user: u,
    revision: s.revision,
    schoolDate: s.schoolDate,
    classes: s.classes.filter((c) => u.role === "admin" || classIds.has(c.id)),
    subjects: s.subjects.filter(
      (x) => u.role !== "teacher" || u.subjectIds?.includes(x.id),
    ),
    students,
    teachers: s.users
      .filter((x) => x.role === "teacher")
      .map(({ id, name, role, subjectIds }) => ({
        id,
        name,
        role,
        email: "",
        subjectIds,
      })),
    grades,
    attendance: view.attendance,
    analyses,
    goals: s.goals.filter((g) => ids.has(g.studentId)),
    achievements: s.achievements.filter((a) => ids.has(a.studentId)),
    posts: s.posts.filter(
      (p) =>
        u.role === "admin" ||
        p.audience === "all" ||
        gradeLevels.has(p.audience),
    ),
    resources: s.resources,
    leaderboard: leaderboard(s).map((x) => ({
      ...x,
      name:
        ids.has(x.studentId) || u.role === "admin"
          ? x.name
          : `${x.name.split(" ")[0]} ${x.name.split(" ")[1]?.[0] || ""}.`,
    })),
    radar,
    schedule: {
      version: s.schedule.id,
      status: s.scheduleStatus,
      items: scheduleItems(s, u),
    },
    slots: s.slots,
    rooms: s.rooms,
    demands: u.role === "admin" ? s.demands : [],
    teacherAvailability: u.role === "admin" ? s.teacherAvailability : [],
    notifications: s.notifications.filter((n) => n.userId === u.id),
    aiConfigured,
    pushConfigured,
  };
}
export function kiosk(s: SchoolState): KioskDTO {
  return {
    schoolDate: s.schoolDate,
    slots: s.slots,
    version: s.schedule.id,
    status: s.scheduleStatus,
    posts: s.posts.filter((p) => p.public && p.audience === "all"),
    leaderboard: leaderboard(s)
      .filter((x) => x.points > 0)
      .slice(0, 5)
      .map((x) => ({
        ...x,
        name: `${x.name.split(" ")[0]} ${x.name.split(" ")[1]?.[0] || ""}.`,
      })),
    changes: scheduleItems(s).filter((x) => x.changed || x.unresolved),
    updatedAt: s.schedule.createdAt,
  };
}
