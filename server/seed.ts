import type { SchoolState, User, Demand, Grade } from "../shared/contracts.ts";
export function schoolToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Oral",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function seedState(): SchoolState {
  const schoolDate = schoolToday();
  const now = new Date(`${schoolDate}T07:00:00+05:00`);
  const stamp = now.toISOString();
  const names = [
    "Айша Садыкова",
    "Алихан Нурланов",
    "Дана Омарова",
    "Мирас Сериков",
    "Аружан Ахметова",
    "Тимур Беков",
    "София Ким",
    "Нурасыл Ермеков",
    "Мадина Касымова",
    "Санжар Исаев",
    "Амина Жумабаева",
    "Данияр Асанов",
    "Раяна Болатова",
    "Ерасыл Муратов",
    "Аяулым Тлегенова",
    "Бекзат Оспанов",
    "Сауле Турсунова",
    "Арсен Даулетов",
    "Индира Мусина",
    "Ислам Рахимов",
    "Томирис Есенова",
    "Никита Ли",
    "Зере Абилова",
    "Адиль Байжанов",
  ];
  const classes = [
    { id: "9a", name: "9A", gradeLevel: 9 },
    { id: "9b", name: "9B", gradeLevel: 9 },
    { id: "10a", name: "10A", gradeLevel: 10 },
    { id: "10b", name: "10B", gradeLevel: 10 },
  ];
  const students: User[] = names.map((name, i) => ({
    id: `s${i + 1}`,
    name,
    email:
      i === 0
        ? "student9@pulse.demo"
        : i === 12
          ? "student10@pulse.demo"
          : `student${i + 1}@school.demo`,
    role: "student",
    classId: classes[Math.floor(i / 6)].id,
  }));
  const teachers: User[] = [
    {
      id: "t1",
      name: "Алия Маратова",
      email: "teacher@pulse.demo",
      role: "teacher",
      classIds: ["9a", "9b"],
      subjectIds: ["physics", "math"],
    },
    {
      id: "t2",
      name: "Ерлан Сейтханов",
      email: "substitute@pulse.demo",
      role: "teacher",
      classIds: ["9a", "9b", "10a", "10b"],
      subjectIds: ["physics", "math"],
    },
    {
      id: "t3",
      name: "Асел Каримова",
      email: "math@pulse.demo",
      role: "teacher",
      classIds: ["10a", "10b"],
      subjectIds: ["math"],
    },
    {
      id: "t4",
      name: "Дамир Куанышев",
      email: "history@pulse.demo",
      role: "teacher",
      classIds: classes.map((c) => c.id),
      subjectIds: ["history"],
    },
    {
      id: "t5",
      name: "Жанна Темирова",
      email: "mentor@pulse.demo",
      role: "teacher",
      classIds: classes.map((c) => c.id),
      subjectIds: ["math", "physics"],
    },
    {
      id: "t6",
      name: "Руслан Алимов",
      email: "curator@pulse.demo",
      role: "teacher",
      classIds: classes.map((c) => c.id),
      subjectIds: ["history", "math"],
    },
  ];
  const subjects = [
    { id: "physics", name: "Физика" },
    { id: "math", name: "Алгебра" },
    { id: "history", name: "История" },
  ];
  const topics = [
    {
      id: "vectors",
      subjectId: "physics",
      name: "Векторы",
      prerequisiteIds: [],
    },
    {
      id: "motion",
      subjectId: "physics",
      name: "Кинематика",
      prerequisiteIds: ["vectors"],
    },
    {
      id: "newton",
      subjectId: "physics",
      name: "Законы Ньютона",
      prerequisiteIds: ["motion"],
    },
    {
      id: "force",
      subjectId: "physics",
      name: "Силы и равновесие",
      prerequisiteIds: ["newton"],
    },
    {
      id: "work",
      subjectId: "physics",
      name: "Работа и энергия",
      prerequisiteIds: ["force"],
    },
    {
      id: "power",
      subjectId: "physics",
      name: "Мощность",
      prerequisiteIds: ["work"],
    },
    {
      id: "equations",
      subjectId: "math",
      name: "Уравнения",
      prerequisiteIds: [],
    },
    {
      id: "functions",
      subjectId: "math",
      name: "Функции",
      prerequisiteIds: ["equations"],
    },
    {
      id: "kazakh",
      subjectId: "history",
      name: "Казахское ханство",
      prerequisiteIds: [],
    },
  ];
  const grades: Grade[] = [];
  for (let s = 0; s < students.length; s++)
    for (let t = 0; t < topics.length; t++)
      for (let k = 0; k < 6; k++) {
        const weak = s % 6 === 0 && topics[t].subjectId === "physics";
        const improving = s % 6 === 1;
        const base = weak
          ? k < 3
            ? 8
            : Math.max(2, 5 - (t % 3))
          : improving
            ? k < 3
              ? 5
              : 8
            : 6 + ((s + t + k) % 4);
        const date = new Date(now);
        date.setDate(date.getDate() - (6 - k) * 5);
        grades.push({
          id: `g-${s}-${t}-${k}`,
          studentId: students[s].id,
          subjectId: topics[t].subjectId,
          topicId: topics[t].id,
          earned: base,
          maximum: 10,
          assessedAt: date.toISOString(),
        });
      }
  const attendance = students.flatMap((s, i) =>
    Array.from({ length: 5 }, (_, k) => {
      const date = new Date(now);
      date.setDate(date.getDate() - k - 1);
      return {
        id: `at-${i}-${k}`,
        studentId: s.id,
        subjectId: k % 2 ? "physics" : "history",
        date: schoolToday(date),
        status: (i % 5 === 0 && k < 2 ? "absent" : "present") as
          "absent" | "present",
      };
    }),
  );
  const members = (classId: string) =>
    students.filter((s) => s.classId === classId).map((s) => s.id);
  const slots = Array.from({ length: 8 }, (_, i) => ({
    id: i,
    start: `${String(8 + Math.floor((i * 55) / 60)).padStart(2, "0")}:${String((i * 55) % 60).padStart(2, "0")}`,
    end: `${String(8 + Math.floor((i * 55 + 45) / 60)).padStart(2, "0")}:${String((i * 55 + 45) % 60).padStart(2, "0")}`,
  }));
  const starts = slots.map((s) => s.id);
  const roomIds = ["r1", "r2", "r3", "r4"];
  const demands: Demand[] = [];
  for (const [i, c] of classes.entries()) {
    demands.push({
      id: `physics-${c.id}`,
      title: `Физика · ${c.name}`,
      kind: "lesson",
      subjectId: "physics",
      studentIds: members(c.id),
      durationSlots: 1,
      allowedTeacherIds: ["t1", "t2", "t5"],
      allowedRoomIds: ["r1", "r2"],
      allowedStartSlots: i === 3 ? [2, 3] : [i],
    });
    demands.push({
      id: `math-${c.id}`,
      title: `Алгебра · ${c.name}`,
      kind: "pair",
      subjectId: "math",
      studentIds: members(c.id),
      durationSlots: 2,
      allowedTeacherIds: ["t1", "t2", "t3", "t5", "t6"],
      allowedRoomIds: roomIds,
      allowedStartSlots: [4, 5, 6],
    });
    demands.push({
      id: `history-${c.id}`,
      title: `История · ${c.name}`,
      kind: "academic_hour",
      subjectId: "history",
      studentIds: members(c.id),
      durationSlots: 1,
      allowedTeacherIds: ["t4", "t6"],
      allowedRoomIds: roomIds,
      allowedStartSlots: [0, 1, 2, 3],
    });
  }
  const laneStudents = [...members("9a"), ...members("9b")];
  demands.push({
    id: "lane-science",
    title: "Профильная лента · Физика",
    kind: "lesson",
    subjectId: "physics",
    studentIds: laneStudents.filter((_, i) => i % 2 === 0),
    durationSlots: 1,
    allowedTeacherIds: ["t1", "t2"],
    allowedRoomIds: ["r1"],
    allowedStartSlots: [3],
    laneId: "profile9",
  });
  demands.push({
    id: "lane-math",
    title: "Профильная лента · Алгебра",
    kind: "lesson",
    subjectId: "math",
    studentIds: laneStudents.filter((_, i) => i % 2 !== 0),
    durationSlots: 1,
    allowedTeacherIds: ["t5"],
    allowedRoomIds: ["r2"],
    allowedStartSlots: [3],
    laneId: "profile9",
  });
  demands.push({
    id: "event",
    title: "Олимпиадный клуб · встреча",
    kind: "event",
    studentIds: students.map((s) => s.id),
    durationSlots: 1,
    allowedTeacherIds: [],
    allowedRoomIds: ["r4"],
    allowedStartSlots: [7],
  });
  return {
    revision: 1,
    schoolDate,
    users: [
      ...students,
      ...teachers,
      {
        id: "p1",
        name: "Гульнара Садыкова",
        email: "parent@pulse.demo",
        role: "parent",
        childIds: ["s1"],
      },
      {
        id: "a1",
        name: "Администратор лицея",
        email: "admin@pulse.demo",
        role: "admin",
      },
    ],
    classes,
    subjects,
    topics,
    grades,
    attendance,
    assessments: [
      {
        id: "soch-physics",
        name: "СОЧ по физике",
        subjectId: "physics",
        studentIds: students.map((s) => s.id),
        date: schoolDate,
        topics: [
          { topicId: "newton", weight: 0.5 },
          { topicId: "force", weight: 0.5 },
        ],
      },
    ],
    resources: [
      {
        id: "v1",
        title: "Первый закон Ньютона · видео",
        topicIds: ["newton", "force"],
        url: "https://www.khanacademy.org/science/physics/mechanics/v/newton-s-1st-law-of-motion",
        provider: "Khan Academy",
        verified: true,
      },
      {
        id: "v2",
        title: "Второй закон Ньютона · видео",
        topicIds: ["force", "motion", "newton"],
        url: "https://www.khanacademy.org/science/physics/newton-s-laws-of-motion/newton-s-second-law-of-motion/v/newton-s-second-law-of-motion",
        provider: "Khan Academy",
        verified: true,
      },
      {
        id: "v3",
        title: "Третий закон Ньютона · видео",
        topicIds: ["force", "newton"],
        url: "https://en.khanacademy.org/science/physics/forces-newtons-laws/newtons-laws-of-motion/v/newton-s-third-law-of-motion",
        provider: "Khan Academy",
        verified: true,
      },
    ],
    goals: students.flatMap((s) => [
      {
        id: `goal-${s.id}-1`,
        studentId: s.id,
        title: "Повторить законы Ньютона",
        points: 30,
      },
      {
        id: `goal-${s.id}-2`,
        studentId: s.id,
        title: "Разобрать три задачи по физике",
        points: 50,
        ...(s.id === "s3" ? { completedAt: stamp } : {}),
      },
    ]),
    achievements: [
      {
        id: "ach-1",
        studentId: "s1",
        title: "Областная олимпиада по информатике",
        category: "olympiad",
        url: "https://a1s.kz/",
        status: "verified",
        createdAt: stamp,
        verifiedBy: "t1",
        verifiedAt: stamp,
      },
      {
        id: "ach-2",
        studentId: "s13",
        title: "Сертификат участника научного проекта",
        category: "certificate",
        url: "https://a1s.kz/",
        status: "pending",
        createdAt: stamp,
      },
    ],
    posts: [
      {
        id: "post-1",
        title: "Неделя науки в лицее",
        body: "Олимпиадный клуб приглашает на встречу сегодня. Приносите вопросы и идеи для исследования.",
        audience: "all",
        public: true,
        createdAt: stamp,
      },
      {
        id: "post-2",
        title: "Профильные консультации для 10-х классов",
        body: "Встреча с кураторами по выбору предметов и подготовке к олимпиадам.",
        audience: 10,
        public: false,
        createdAt: stamp,
      },
    ],
    rooms: roomIds.map((id, i) => ({
      id,
      name: i === 3 ? "Актовый зал" : `Кабинет ${201 + i}`,
      unavailableSlots: id === "r3" ? [0, 1] : [],
    })),
    teacherAvailability: teachers.map((t) => ({
      teacherId: t.id,
      unavailableSlots: t.id === "t2" ? [0] : [],
    })),
    slots,
    demands,
    absences: [],
    schedule: {
      id: 0,
      createdAt: stamp,
      assignments: [],
      changedDemandIds: [],
    },
    scheduleStatus: "needs_replan",
    notifications: [],
  };
}
