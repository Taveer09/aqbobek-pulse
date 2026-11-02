import type { SchoolState, User } from "../shared/contracts.ts";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "REQUEST_ERROR",
    public details?: unknown,
  ) {
    super(message);
  }
}
export function requireRole(user: User, ...roles: User["role"][]) {
  if (!roles.includes(user.role))
    throw new HttpError(403, "Недостаточно прав", "FORBIDDEN");
}
export function visibleStudents(s: SchoolState, u: User): User[] {
  const students = s.users.filter((x) => x.role === "student");
  if (u.role === "admin") return students;
  if (u.role === "student") return students.filter((x) => x.id === u.id);
  if (u.role === "parent")
    return students.filter((x) => u.childIds?.includes(x.id));
  return students.filter((x) => x.classId && u.classIds?.includes(x.classId));
}
export function requireStudent(s: SchoolState, u: User, id: string) {
  if (!visibleStudents(s, u).some((x) => x.id === id))
    throw new HttpError(403, "Нет доступа к данным этого ученика", "FORBIDDEN");
}
