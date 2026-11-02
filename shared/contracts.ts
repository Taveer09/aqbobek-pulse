import { z } from "zod";
export type Role = "student" | "teacher" | "parent" | "admin";
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  classId?: string;
  childIds?: string[];
  classIds?: string[];
  subjectIds?: string[];
}
export interface SchoolClass {
  id: string;
  name: string;
  gradeLevel: number;
}
export interface Subject {
  id: string;
  name: string;
}
export interface Topic {
  id: string;
  subjectId: string;
  name: string;
  prerequisiteIds: string[];
}
export interface Grade {
  id: string;
  studentId: string;
  subjectId: string;
  topicId: string;
  earned: number;
  maximum: number;
  assessedAt: string;
}
export interface Attendance {
  id: string;
  studentId: string;
  subjectId: string;
  date: string;
  status: "present" | "absent";
}
export interface Assessment {
  id: string;
  name: string;
  subjectId: string;
  studentIds: string[];
  date: string;
  topics: { topicId: string; weight: number }[];
}
export interface Resource {
  id: string;
  title: string;
  topicIds: string[];
  url: string;
  provider: string;
  verified: boolean;
}
export interface Goal {
  id: string;
  studentId: string;
  title: string;
  points: number;
  completedAt?: string;
}
export interface Achievement {
  id: string;
  studentId: string;
  title: string;
  category: "olympiad" | "certificate" | "activity";
  url: string;
  status: "pending" | "verified";
  createdAt: string;
  verifiedBy?: string;
  verifiedAt?: string;
}
export interface Post {
  id: string;
  title: string;
  body: string;
  audience: "all" | number;
  public: boolean;
  createdAt: string;
}
export interface Room {
  id: string;
  name: string;
  unavailableSlots: number[];
}
export interface TeacherAvailability {
  teacherId: string;
  unavailableSlots: number[];
}
export interface Slot {
  id: number;
  start: string;
  end: string;
}
export interface Demand {
  id: string;
  title: string;
  kind: "lesson" | "pair" | "academic_hour" | "event";
  subjectId?: string;
  studentIds: string[];
  durationSlots: number;
  allowedTeacherIds: string[];
  allowedRoomIds: string[];
  allowedStartSlots: number[];
  laneId?: string;
}
export interface Assignment {
  demandId: string;
  startSlot: number;
  teacherId?: string;
  roomId: string;
}
export interface Absence {
  teacherId: string;
  date: string;
}
export interface ScheduleVersion {
  id: number;
  createdAt: string;
  assignments: Assignment[];
  changedDemandIds: string[];
}
export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  version: number;
  createdAt: string;
  delivery: "pending" | "sent" | "failed" | "not_subscribed";
  attempts: number;
}
export interface SchoolState {
  revision: number;
  schoolDate: string;
  users: User[];
  classes: SchoolClass[];
  subjects: Subject[];
  topics: Topic[];
  grades: Grade[];
  attendance: Attendance[];
  assessments: Assessment[];
  resources: Resource[];
  goals: Goal[];
  achievements: Achievement[];
  posts: Post[];
  rooms: Room[];
  teacherAvailability: TeacherAvailability[];
  slots: Slot[];
  demands: Demand[];
  absences: Absence[];
  schedule: ScheduleVersion;
  scheduleStatus: "current" | "needs_replan";
  notifications: Notification[];
}
export interface TopicMastery {
  topicId: string;
  name: string;
  prerequisiteIds: string[];
  mastery: number | null;
  observations: number;
}
export interface Risk {
  assessmentId: string;
  name: string;
  subjectId: string;
  score: number | null;
  level: "high" | "medium" | "low" | "insufficient_data";
  coverage: number;
  topicIds: string[];
  reasons: string[];
}
export interface SubjectTrend {
  subjectId: string;
  previous: number | null;
  recent: number | null;
  delta: number | null;
  warning: boolean;
}
export interface StudentAnalysis {
  studentId: string;
  average: number | null;
  topics: TopicMastery[];
  risks: Risk[];
  trends: SubjectTrend[];
  absences: number;
}
export interface SolveInput {
  demands: Demand[];
  rooms: Room[];
  teachers: TeacherAvailability[];
  slots: Slot[];
  absentTeacherIds: string[];
  previous?: Assignment[];
  timeLimitMs?: number;
  maxNodes?: number;
}
export interface SolveResult {
  status: "feasible" | "infeasible" | "timeout";
  assignments?: Assignment[];
  changedDemandIds: string[];
  elapsedMs: number;
  violations: string[];
  searchComplete: boolean;
  nodes: number;
}
export interface TimetableItem {
  demandId: string;
  title: string;
  kind: Demand["kind"];
  startSlot: number;
  durationSlots: number;
  teacherName: string;
  roomName: string;
  laneId?: string;
  changed: boolean;
  unresolved: boolean;
}
export interface LeaderboardEntry {
  studentId: string;
  name: string;
  className: string;
  points: number;
  rank: number;
}
export interface RadarRow {
  gradeLevel: number;
  subjectId: string;
  subjectName: string;
  average: number | null;
  studentCount: number;
  highRiskCount: number;
}
export interface DashboardDTO {
  user: User;
  revision: number;
  schoolDate: string;
  classes: SchoolClass[];
  subjects: Subject[];
  students: User[];
  teachers: User[];
  grades: Grade[];
  attendance: Attendance[];
  analyses: StudentAnalysis[];
  goals: Goal[];
  achievements: Achievement[];
  posts: Post[];
  resources: Resource[];
  leaderboard: LeaderboardEntry[];
  radar: RadarRow[];
  schedule: {
    version: number;
    status: SchoolState["scheduleStatus"];
    items: TimetableItem[];
  };
  slots: Slot[];
  rooms: Room[];
  demands: Demand[];
  teacherAvailability: TeacherAvailability[];
  notifications: Notification[];
  aiConfigured: boolean;
  pushConfigured: boolean;
}
export interface AIResult {
  source: "live" | "cache" | "fallback";
  kind: "tutor" | "class_report" | "parent_week";
  dataRevision: number;
  text: string;
  factIds: string[];
  resourceIds: string[];
  generatedAt: string;
  reason?: string;
  model?: string;
}
export interface KioskDTO {
  schoolDate: string;
  slots: Slot[];
  version: number;
  status: string;
  posts: Post[];
  leaderboard: LeaderboardEntry[];
  changes: TimetableItem[];
  updatedAt: string;
}
export const gradeInputSchema = z
  .object({
    studentId: z.string().min(1),
    subjectId: z.string().min(1),
    topicId: z.string().min(1),
    earned: z.number().min(0),
    maximum: z.number().positive(),
    assessedAt: z.iso.datetime().optional(),
  })
  .refine((x) => x.earned <= x.maximum, "Балл не может быть выше максимума");
export const demandInputSchema = z.object({
  title: z.string().min(2).max(100),
  kind: z.enum(["lesson", "pair", "academic_hour", "event"]),
  subjectId: z.string().optional(),
  studentIds: z.array(z.string()).min(1),
  durationSlots: z.number().int().min(1).max(8),
  allowedTeacherIds: z.array(z.string()),
  allowedRoomIds: z.array(z.string()).min(1),
  allowedStartSlots: z.array(z.number().int().min(0)).min(1),
  laneId: z.string().optional(),
});
export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(100),
});
export const aiInputSchema = z.object({
  kind: z.enum(["tutor", "class_report", "parent_week"]),
  studentId: z.string().optional(),
  subjectId: z.string().optional(),
  classId: z.string().optional(),
});
export const portfolioInputSchema = z.object({
  title: z.string().min(3).max(120),
  category: z.enum(["olympiad", "certificate", "activity"]),
  url: z.url().refine((u) => u.startsWith("https://"), "Нужна https-ссылка"),
});
export const postInputSchema = z.object({
  title: z.string().min(3).max(120),
  body: z.string().min(3).max(2000),
  audience: z.union([z.literal("all"), z.number().int().min(7).max(11)]),
  public: z.boolean().default(false),
});
export const stateSchema = z.object({
  revision: z.number().int(),
  schoolDate: z.string(),
  users: z.array(
    z
      .object({
        id: z.string(),
        role: z.enum(["student", "teacher", "parent", "admin"]),
        name: z.string(),
        email: z.string(),
      })
      .passthrough(),
  ),
  classes: z.array(z.unknown()),
  subjects: z.array(z.unknown()),
  topics: z.array(z.unknown()),
  grades: z.array(z.unknown()),
  attendance: z.array(z.unknown()),
  assessments: z.array(z.unknown()),
  resources: z.array(z.unknown()),
  goals: z.array(z.unknown()),
  achievements: z.array(z.unknown()),
  posts: z.array(z.unknown()),
  rooms: z.array(z.unknown()),
  teacherAvailability: z.array(z.unknown()),
  slots: z.array(z.unknown()),
  demands: z.array(z.unknown()),
  absences: z.array(z.unknown()),
  schedule: z.object({
    id: z.number(),
    createdAt: z.string(),
    assignments: z.array(z.unknown()),
    changedDemandIds: z.array(z.string()),
  }),
  scheduleStatus: z.enum(["current", "needs_replan"]),
  notifications: z.array(z.unknown()),
});
