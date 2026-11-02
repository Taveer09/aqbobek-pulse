import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Award,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  ExternalLink,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Network,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  X,
} from "lucide-react";
import type {
  AIResult,
  DashboardDTO,
  Demand,
  Goal,
  KioskDTO,
  LeaderboardEntry,
  Post,
  Role,
  SolveResult,
  StudentAnalysis,
  TimetableItem,
  TopicMastery,
  User,
} from "../shared/contracts";
import { api, APIError, messageOf } from "./api";

type View =
  | "overview"
  | "learning"
  | "schedule"
  | "community"
  | "announcements"
  | "notifications";
const roleNames: Record<Role, string> = {
  student: "Ученик",
  teacher: "Учитель",
  parent: "Родитель",
  admin: "Администрация",
};
const kindNames: Record<Demand["kind"], string> = {
  lesson: "Урок",
  pair: "Пара",
  academic_hour: "Академический час",
  event: "Мероприятие",
};
const demos = [
  ["student9@pulse.demo", "Ученик · 9 класс"],
  ["student10@pulse.demo", "Ученик · 10 класс"],
  ["teacher@pulse.demo", "Учитель"],
  ["parent@pulse.demo", "Родитель"],
  ["admin@pulse.demo", "Администрация"],
  ["substitute@pulse.demo", "Учитель на замену"],
];
const fmt = (value: number | null | undefined, digits = 0) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("ru-RU", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      }).format(value);
const percent = (value: number | null | undefined) =>
  value == null ? "—" : `${fmt(value <= 1 ? value * 100 : value)}%`;
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Oral",
  }).format(new Date(date.length === 10 ? `${date}T07:00:00Z` : date));
const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join("");
function Mark({ large = false }: { large?: boolean }) {
  return (
    <div className={`brand ${large ? "brand-large" : ""}`}>
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4 24 14 5h4l10 19M9 18h14M12 25l4-8 4 8"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="16" cy="12" r="2" fill="currentColor" />
      </svg>
      <span>
        Aqbobek <strong>Pulse</strong>
      </span>
    </div>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
function Status({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`status ${tone}`}>{children}</span>;
}
function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function Avatar({ user }: { user: Pick<User, "name" | "id"> }) {
  const hue = [166, 42, 214, 108, 340, 280][
    [...user.id].reduce((n, c) => n + c.charCodeAt(0), 0) % 6
  ];
  return (
    <span
      className="avatar"
      style={{
        backgroundColor: `hsl(${hue} 32% 93%)`,
        color: `hsl(${hue} 28% 28%)`,
      }}
      aria-hidden="true"
    >
      {initials(user.name)}
    </span>
  );
}

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState(demos[0][0]);
  const [password, setPassword] = useState("Pulse2026!");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLogin(await api<User>("/api/auth/login", { email, password }));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-story">
        <Mark large />
        <div className="login-message">
          <div className="login-mini-map" aria-hidden="true">
            <span>Знания</span>
            <span>Цели</span>
            <span>Следующий шаг</span>
            <svg viewBox="0 0 300 150">
              <path
                d="M32 96C88 96 63 30 122 30S190 116 268 74"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
              <circle cx="32" cy="96" r="7" />
              <circle cx="122" cy="30" r="7" />
              <circle cx="268" cy="74" r="7" />
            </svg>
          </div>
          <h1>
            Школьный день.
            <br />
            Всё связано.
          </h1>
          <p>
            Оценки, учебные цели и расписание — в общем пространстве Aqbobek
            Lyceum.
          </p>
        </div>
        <div className="login-foot">
          <span>Учиться осознанно.</span>
          <a href="/kiosk">
            Стенгазета <ArrowUpRight size={16} />
          </a>
        </div>
      </div>
      <div className="login-form-wrap">
        <div className="login-form">
          <h2>Вход в портал</h2>
          <p className="muted">Продолжите с учётной записью лицея.</p>
          <form onSubmit={submit}>
            <label>
              Электронная почта
              <input
                type="email"
                name="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Пароль
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy ? "Входим…" : "Войти"}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="demo-accounts">
            <h3>Попробовать портал</h3>
            <p>Демонстрационные аккаунты · синтетические данные</p>
            <div className="demo-grid">
              {demos.map(([mail, label]) => (
                <button
                  key={mail}
                  className={email === mail ? "selected" : ""}
                  onClick={() => setEmail(mail)}
                  type="button"
                >
                  {label}
                  <ChevronRight size={14} />
                </button>
              ))}
            </div>
            <p className="demo-password">
              Пароль для демо: <strong>Pulse2026!</strong>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

function KnowledgeMap({
  topics,
  compact = false,
}: {
  topics: TopicMastery[];
  compact?: boolean;
}) {
  const [small, setSmall] = useState(() => window.innerWidth < 760);
  useEffect(() => {
    const resize = () => setSmall(window.innerWidth < 760);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const columns = small ? 2 : 3;
  const nodes = topics.slice(0, 6);
  const positions = nodes.map((_, i) => ({
    x: small ? 10 + (i % columns) * 208 : 30 + (i % columns) * 208,
    y: 28 + Math.floor(i / columns) * 116,
  }));
  return (
    <div className={`knowledge-map ${compact ? "compact" : ""}`}>
      <svg
        viewBox={small ? "0 0 420 380" : "0 0 650 260"}
        role="img"
        aria-label="Граф знаний: темы, освоение и связи между ними"
      >
        <defs>
          <marker
            id="arrow"
            markerWidth="6"
            markerHeight="6"
            refX="5"
            refY="3"
            orient="auto"
          >
            <path d="M0 0 6 3 0 6" fill="#b5c5c4" />
          </marker>
        </defs>
        {nodes.flatMap((node, i) =>
          node.prerequisiteIds.map((id) => {
            const from = nodes.findIndex((n) => n.topicId === id);
            if (from < 0) return null;
            const a = positions[from],
              b = positions[i];
            return (
              <path
                key={`${id}-${node.topicId}`}
                d={
                  Math.floor(from / columns) === Math.floor(i / columns)
                    ? `M${a.x + 180} ${a.y + 37} C${a.x + 202} ${a.y + 37} ${b.x - 20} ${b.y + 37} ${b.x} ${b.y + 37}`
                    : `M${a.x + 90} ${a.y + 74} C${a.x + 90} ${a.y + 100} ${b.x + 90} ${b.y - 26} ${b.x + 90} ${b.y}`
                }
                stroke="#c6d4d2"
                strokeWidth="1.5"
                fill="none"
                markerEnd="url(#arrow)"
              />
            );
          }),
        )}
        {nodes.map((node, i) => {
          const p = positions[i],
            value =
              node.mastery == null
                ? null
                : node.mastery <= 1
                  ? node.mastery * 100
                  : node.mastery;
          const weak = value !== null && value < 50;
          return (
            <g key={node.topicId}>
              <title>
                {node.name}:{" "}
                {value === null
                  ? "недостаточно данных"
                  : `${fmt(value)}% освоения`}
                , работ: {node.observations}
              </title>
              <rect
                x={p.x}
                y={p.y}
                width="180"
                height="74"
                rx="12"
                fill={weak ? "#fbefeb" : value === null ? "#f2f4f4" : "#fff"}
                stroke={weak ? "#e8c8bf" : "#dce5e3"}
              />
              <text
                x={p.x + 14}
                y={p.y + 24}
                fill="#293d3a"
                fontSize="12"
                fontWeight="500"
              >
                {node.name.length > 22
                  ? `${node.name.slice(0, 21)}…`
                  : node.name}
              </text>
              <text
                x={p.x + 14}
                y={p.y + 54}
                fill={weak ? "#a34932" : value === null ? "#686e6c" : "#256e64"}
                fontSize="19"
              >
                {value === null ? "—" : `${fmt(value)}%`}
              </text>
              <text
                x={p.x + 166}
                y={p.y + 53}
                textAnchor="end"
                fill="#66726e"
                fontSize="11"
              >
                {node.observations} работ
              </text>
            </g>
          );
        })}
      </svg>
      <div className="map-legend">
        <span>
          <i className="legend-dot" />
          Освоение темы
        </span>
        <span>
          <i className="legend-dot warm" />
          Нужна практика
        </span>
        <span className="legend-text">Связь — необходимая основа</span>
      </div>
    </div>
  );
}

function ScheduleList({
  items,
  slots,
  limit,
}: {
  items: TimetableItem[];
  slots: DashboardDTO["slots"];
  limit?: number;
}) {
  const rows = [...items]
    .sort((a, b) => a.startSlot - b.startSlot)
    .slice(0, limit);
  return rows.length ? (
    <div className="schedule-list">
      {rows.map((item) => (
        <div
          className={`schedule-item ${item.unresolved ? "unresolved" : item.changed ? "changed" : ""}`}
          key={item.demandId}
        >
          <div className="lesson-time">
            <strong>
              {slots.find((s) => s.id === item.startSlot)?.start ||
                `Слот ${item.startSlot + 1}`}
            </strong>
            <span>
              {slots.find(
                (s) => s.id === item.startSlot + item.durationSlots - 1,
              )?.end || ""}
            </span>
          </div>
          <div className="lesson-info">
            <div>
              <strong>{item.title}</strong>
              {item.changed && !item.unresolved && (
                <Status tone="positive">Замена</Status>
              )}
              {item.unresolved && (
                <Status tone="negative">Требует замены</Status>
              )}
            </div>
            <p>
              {item.roomName} · {item.teacherName || "Без учителя"}
            </p>
            {item.laneId && (
              <span className="small muted">Профильная лента</span>
            )}
          </div>
          <span className="lesson-kind">{kindNames[item.kind]}</span>
        </div>
      ))}
    </div>
  ) : (
    <Empty>Занятий пока нет. После публикации расписание появится здесь.</Empty>
  );
}

function AIBox({
  result,
  loading,
  resources,
  onGenerate,
  label,
}: {
  result: AIResult | null;
  loading: boolean;
  resources: DashboardDTO["resources"];
  onGenerate: () => void;
  label: string;
}) {
  return (
    <div className="ai-box">
      <div className="ai-box-heading">
        <span>
          <Sparkles size={17} />
          <strong>{label}</strong>
        </span>
        <button className="text-button" onClick={onGenerate} disabled={loading}>
          {loading ? "Готовим…" : result ? "Обновить" : "Получить"}
          <ArrowRight size={15} />
        </button>
      </div>
      {loading ? (
        <p className="muted" role="status">
          Собираем факты и рекомендации…
        </p>
      ) : result ? (
        <>
          <div className="ai-source">
            <Status tone={result.source === "live" ? "positive" : "neutral"}>
              {result.source === "live"
                ? "AI · свежий ответ"
                : result.source === "cache"
                  ? "AI · сохранённый ответ"
                  : "Фактический шаблон · без нового AI-ответа"}
            </Status>
          </div>
          <p className="ai-text">{result.text}</p>
          {result.reason && <p className="small muted">{result.reason}</p>}
          {result.resourceIds.length > 0 && (
            <div className="resource-list">
              {result.resourceIds.map((id) => {
                const resource = resources.find((r) => r.id === id);
                return resource ? (
                  <a
                    key={id}
                    href={resource.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <BookOpen size={15} />
                    <span>
                      {resource.title}
                      <small>{resource.provider}</small>
                    </span>
                    <ArrowUpRight size={15} />
                  </a>
                ) : null;
              })}
            </div>
          )}
          <p className="small muted">
            {new Intl.DateTimeFormat("ru-RU", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Asia/Oral",
            }).format(new Date(result.generatedAt))}{" "}
            · данные версии {result.dataRevision}
          </p>
        </>
      ) : (
        <p className="muted">
          Рекомендации будут опираться на оценки и темы. Числовые показатели
          рассчитываются отдельно от модели.
        </p>
      )}
    </div>
  );
}

function GoalList({
  goals,
  canComplete,
  onComplete,
  busy,
}: {
  goals: Goal[];
  canComplete: boolean;
  onComplete: (id: string) => void;
  busy: boolean;
}) {
  return goals.length ? (
    <div className="goal-list">
      {goals.map((goal) => (
        <div className="goal-row" key={goal.id}>
          <span className={`goal-check ${goal.completedAt ? "done" : ""}`}>
            {goal.completedAt ? <Check size={14} /> : <Target size={14} />}
          </span>
          <div>
            <strong>{goal.title}</strong>
            <p>
              {goal.completedAt
                ? "Цель закрыта"
                : `+${goal.points} баллов за выполнение`}
            </p>
          </div>
          {goal.completedAt ? (
            <Status tone="positive">Готово</Status>
          ) : canComplete ? (
            <button
              className="text-button"
              onClick={() => onComplete(goal.id)}
              disabled={busy}
            >
              Закрыть
              <Check size={14} />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  ) : (
    <Empty>Учебных целей пока нет.</Empty>
  );
}
function Leaderboard({
  entries,
  compact = false,
}: {
  entries: LeaderboardEntry[];
  compact?: boolean;
}) {
  return entries.length ? (
    <div className="leaderboard">
      {entries.slice(0, compact ? 3 : 10).map((item) => (
        <div className="leader-row" key={item.studentId}>
          <span className="rank">{item.rank}</span>
          <Avatar user={{ id: item.studentId, name: item.name }} />
          <div>
            <strong>{item.name}</strong>
            <p>{item.className}</p>
          </div>
          <span className="leader-points">
            {item.points}
            <small> баллов</small>
          </span>
        </div>
      ))}
    </div>
  ) : (
    <Empty>
      Сегодня ещё никто не закрыл цель. Первый результат появится здесь.
    </Empty>
  );
}
function PostList({
  posts,
  compact = false,
}: {
  posts: Post[];
  compact?: boolean;
}) {
  return posts.length ? (
    <div className="post-list">
      {posts.slice(0, compact ? 2 : undefined).map((post) => (
        <article className="post" key={post.id}>
          <div className="post-meta">
            <span>
              {post.audience === "all"
                ? "Для всех"
                : `${post.audience}-е классы`}
            </span>
            <time>{dateLabel(post.createdAt)}</time>
          </div>
          <h3>{post.title}</h3>
          <p>{post.body}</p>
        </article>
      ))}
    </div>
  ) : (
    <Empty>Объявлений для вашей аудитории пока нет.</Empty>
  );
}

export default function App() {
  if (window.location.pathname.startsWith("/kiosk")) return <Kiosk />;
  return <Portal />;
}
function Portal() {
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<DashboardDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [aiResult, setAIResult] = useState<AIResult | null>(null);
  const [aiLoading, setAILoading] = useState(false);
  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await api<DashboardDTO>("/api/dashboard");
      setData(result);
      setUser(result.user);
      setError("");
    } catch (e) {
      if (e instanceof APIError && e.status === 401) {
        setUser(null);
        setData(null);
      } else setError(messageOf(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      reload();
    }, 20000);
    return () => clearInterval(interval);
  }, [user?.id, reload]);
  useEffect(() => {
    if (!data) return;
    if (!data.students.some((s) => s.id === selectedStudent))
      setSelectedStudent(
        data.students.find((s) => s.id === data.user.id)?.id ||
          data.students[0]?.id ||
          "",
      );
  }, [data, selectedStudent]);
  useEffect(() => {
    setAIResult(null);
  }, [selectedStudent, view, data?.revision]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function mutate(path: string, body: unknown, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<unknown>(path, body);
      const solve = result as Partial<SolveResult> | null;
      if (
        path === "/api/schedule/generate" ||
        path === "/api/schedule/absence"
      ) {
        if (solve?.status === "infeasible")
          setNotice(
            path.endsWith("/absence")
              ? "Отсутствие сохранено. Допустимая замена не найдена: ограничения несовместимы."
              : "Допустимое расписание не найдено: ограничения несовместимы.",
          );
        else if (solve?.status === "timeout")
          setNotice(
            "За лимит времени решение не найдено. Неудачный результат не опубликован.",
          );
        else if (solve?.status === "feasible")
          setNotice("Опубликована новая допустимая версия расписания.");
        else setNotice("Расчёт завершён. Проверьте статус расписания.");
      } else setNotice(success);
      await reload();
    } catch (e) {
      setError(messageOf(e));
      if (e instanceof APIError && e.status === 409) await reload();
    } finally {
      setBusy(false);
    }
  }
  async function generateAI(kind: AIResult["kind"]) {
    if (!data) return;
    setAILoading(true);
    setError("");
    try {
      setAIResult(
        await api<AIResult>("/api/ai", {
          kind,
          ...(kind === "class_report"
            ? {
                classId:
                  data.students.find((s) => s.id === selectedStudent)
                    ?.classId ||
                  data.classes.find((c) =>
                    data.students.some((s) => s.classId === c.id),
                  )?.id,
              }
            : { studentId: selectedStudent }),
        }),
      );
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setAILoading(false);
    }
  }
  async function logout() {
    try {
      await api("/api/auth/logout", {});
      setData(null);
      setUser(null);
      setView("overview");
    } catch (e) {
      setError(messageOf(e));
    }
  }
  async function enablePush() {
    setBusy(true);
    setError("");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window))
        throw new Error(
          "Этот браузер не поддерживает Web Push. Откройте портал в совместимом браузере.",
        );
      const permission = await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error(
          "Разрешите уведомления в настройках браузера, чтобы получать замены.",
        );
      const { publicKey } = await api<{ publicKey: string }>(
        "/api/push/public-key",
      );
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const padding = "=".repeat((4 - (publicKey.length % 4)) % 4);
      const base64 = (publicKey + padding)
        .replace(/-/g, "+")
        .replace(/_/g, "/");
      const key = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        }));
      await api("/api/push/subscribe", subscription.toJSON());
      setNotice("Уведомления о заменах включены для этого браузера.");
      await reload();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <main className="startup">
        <Mark />
        <p role="status">Открываем школьный день…</p>
      </main>
    );
  if (!user)
    return (
      <>
        <Login
          onLogin={(u) => {
            setUser(u);
            setLoading(true);
            reload();
          }}
        />
        {error && (
          <div className="floating-error" role="alert">
            {error}
            <button
              onClick={() => {
                setLoading(true);
                reload();
              }}
            >
              Повторить
            </button>
          </div>
        )}
      </>
    );
  if (!data)
    return (
      <main className="startup">
        <Mark />
        <p role="alert">{error || "Не удалось загрузить школьные данные."}</p>
        <button className="button" onClick={reload}>
          Повторить
        </button>
        <button className="text-button" onClick={logout}>
          Выйти
        </button>
      </main>
    );
  const student = data.students.find((s) => s.id === selectedStudent);
  const analysis = data.analyses.find((a) => a.studentId === selectedStudent);
  const className = data.classes.find(
    (c) => c.id === (student?.classId || user.classId),
  )?.name;
  const personal = user.role === "student" || user.role === "parent";
  const nav: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
    { id: "overview", label: "Главная", icon: LayoutDashboard },
    {
      id: "learning",
      label: personal ? "Учёба и знания" : "Ученики и риски",
      icon: Network,
    },
    { id: "schedule", label: "Расписание", icon: CalendarDays },
    { id: "community", label: "Цели и портфолио", icon: Award },
    { id: "announcements", label: "Лента лицея", icon: MessageSquare },
    { id: "notifications", label: "Уведомления", icon: Bell },
  ];
  const viewNames: Record<View, string> = {
    overview: personal
      ? user.role === "parent"
        ? "Учебный день ребёнка"
        : "Твой учебный день"
      : user.role === "admin"
        ? "Пульс лицея"
        : "Учебный день класса",
    learning: personal ? "Карта знаний" : "Ученики и риски",
    schedule: "Расписание",
    community: "Цели и портфолио",
    announcements: "Лента лицея",
    notifications: "Уведомления",
  };
  function navigate(next: View) {
    setView(next);
    setMenu(false);
    setError("");
    window.scrollTo(0, 0);
  }
  return (
    <div className="app-shell">
      <header className="mobile-bar">
        <Mark />
        <button
          className="icon-button"
          onClick={() => setMenu(!menu)}
          aria-label={menu ? "Закрыть меню" : "Открыть меню"}
        >
          {menu ? <X /> : <Menu />}
        </button>
      </header>
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <a className="brand-link" href="/" aria-label="Aqbobek Pulse — главная">
          <Mark />
        </a>
        <div className="workspace">
          <GraduationCap size={17} />
          <span>
            Aqbobek Lyceum<small>Учебное пространство</small>
          </span>
        </div>
        <nav aria-label="Основная навигация">
          {nav.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={view === item.id ? "active" : ""}
              aria-current={view === item.id ? "page" : undefined}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.id === "notifications" && data.notifications.length > 0 && (
                <span className="nav-count">{data.notifications.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a
            href="/kiosk"
            target="_blank"
            rel="noreferrer"
            className="kiosk-link"
          >
            Стенгазета
            <ArrowUpRight size={16} />
          </a>
          <div className="sidebar-user">
            <Avatar user={user} />
            <div>
              <strong>{user.name}</strong>
              <small>{roleNames[user.role]}</small>
            </div>
            <button
              className="icon-button"
              aria-label="Выйти из аккаунта"
              title="Выйти"
              onClick={logout}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <main className="canvas">
        <div className="scope-row">
          <span>
            Aqbobek Lyceum <ChevronRight size={13} /> {roleNames[user.role]}
            {className && (
              <>
                {" "}
                <ChevronRight size={13} /> {className}
              </>
            )}
          </span>
          <div>
            <span className="freshness">{dateLabel(data.schoolDate)}</span>
            <button
              className="icon-button"
              onClick={reload}
              disabled={refreshing}
              aria-label="Обновить данные"
            >
              <RefreshCw size={16} className={refreshing ? "spinning" : ""} />
            </button>
          </div>
        </div>
        <header className="page-heading">
          <div>
            <h1>{viewNames[view]}</h1>
            <p>
              {view === "overview"
                ? personal
                  ? `${student?.name || user.name}, у каждого следующего шага есть основа.`
                  : user.role === "admin"
                    ? "Учебные сигналы и расписание в одном ритме."
                    : "Кому сейчас нужна поддержка и что изменилось сегодня."
                : view === "learning"
                  ? "От оценок к темам — и к понятному плану подготовки."
                  : view === "schedule"
                    ? `Один учебный день · версия ${data.schedule.version}`
                    : view === "community"
                      ? "Маленькие шаги в учёбе. Подтверждённые достижения."
                      : view === "announcements"
                        ? "События и новости вашей школьной аудитории."
                        : "Изменения расписания и адресные сообщения."}
            </p>
          </div>
          {view === "overview" && (
            <button
              className="button primary"
              onClick={() =>
                generateAI(
                  user.role === "teacher" || user.role === "admin"
                    ? "class_report"
                    : user.role === "parent"
                      ? "parent_week"
                      : "tutor",
                )
              }
              disabled={aiLoading}
            >
              <Sparkles size={16} />
              {personal
                ? user.role === "parent"
                  ? "Выжимка за неделю"
                  : "План подготовки"
                : "Отчёт класса"}
            </button>
          )}
        </header>
        <div className="demo-line">
          <span className="demo-dot" />
          Демонстрационные данные
          {!data.aiConfigured && <span>· AI не подключён</span>}
          <span className="revision">Обновление {data.revision}</span>
        </div>
        {error && (
          <div className="notice error" role="alert">
            <span>{error}</span>
            <button
              className="icon-button"
              aria-label="Скрыть ошибку"
              onClick={() => setError("")}
            >
              <X size={15} />
            </button>
          </div>
        )}
        {notice && (
          <div className="notice success" role="status">
            <Check size={17} />
            {notice}
          </div>
        )}
        {data.schedule.status === "needs_replan" && (
          <div className="notice warning">
            <Clock3 size={17} />
            <span>
              Есть занятия без решённой замены. Предыдущее расписание требует
              проверки.
            </span>
            <button
              className="text-button"
              onClick={() => navigate("schedule")}
            >
              Посмотреть
            </button>
          </div>
        )}
        {view === "overview" && (
          <Overview
            data={data}
            student={student}
            analysis={analysis}
            aiResult={aiResult}
            aiLoading={aiLoading}
            onAI={() =>
              generateAI(
                user.role === "teacher" || user.role === "admin"
                  ? "class_report"
                  : user.role === "parent"
                    ? "parent_week"
                    : "tutor",
              )
            }
            navigate={navigate}
            busy={busy}
            complete={(id) =>
              mutate(
                `/api/goals/${id}/complete`,
                {},
                "Цель закрыта. Рейтинг обновлён.",
              )
            }
          />
        )}
        {view === "learning" && (
          <Learning
            data={data}
            studentId={selectedStudent}
            setStudentId={setSelectedStudent}
            analysis={analysis}
            aiResult={aiResult}
            aiLoading={aiLoading}
            onAI={() =>
              generateAI(
                user.role === "teacher" || user.role === "admin"
                  ? "class_report"
                  : user.role === "parent"
                    ? "parent_week"
                    : "tutor",
              )
            }
            busy={busy}
            mutate={mutate}
          />
        )}
        {view === "schedule" && (
          <Schedule data={data} busy={busy} mutate={mutate} />
        )}
        {view === "community" && (
          <Community data={data} busy={busy} mutate={mutate} />
        )}
        {view === "announcements" && (
          <Announcements data={data} busy={busy} mutate={mutate} />
        )}
        {view === "notifications" && (
          <Notifications data={data} busy={busy} enablePush={enablePush} />
        )}
        <footer className="app-footer">
          <span>Aqbobek Pulse</span>
          <span>Asia/Oral · синтетический набор для демонстрации</span>
        </footer>
      </main>
    </div>
  );
}

type Mutate = (path: string, body: unknown, success: string) => Promise<void>;
function Overview({
  data,
  student,
  analysis,
  aiResult,
  aiLoading,
  onAI,
  navigate,
  busy,
  complete,
}: {
  data: DashboardDTO;
  student?: User;
  analysis?: StudentAnalysis;
  aiResult: AIResult | null;
  aiLoading: boolean;
  onAI: () => void;
  navigate: (view: View) => void;
  busy: boolean;
  complete: (id: string) => void;
}) {
  const personal = data.user.role === "student" || data.user.role === "parent";
  const risk = analysis?.risks
    .filter((r) => r.score !== null)
    .sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  const high = data.analyses.filter(
    (a) =>
      a.risks.some((r) => r.level === "high") ||
      a.trends.some((t) => t.warning),
  );
  if (!personal)
    return (
      <div className="dashboard-grid">
        <Panel
          title={
            data.user.role === "admin" ? "Качество обучения" : "Ранние сигналы"
          }
          subtitle={
            data.user.role === "admin"
              ? "Параллели и предметы по общим данным"
              : "Изменения относительно предыдущих работ"
          }
          className="span-8"
          action={
            <button
              className="text-button"
              onClick={() => navigate("learning")}
            >
              Все ученики
              <ArrowRight size={15} />
            </button>
          }
        >
          {data.user.role === "admin" ? (
            <Radar data={data} />
          ) : (
            <StudentTable data={data} limit={5} />
          )}
          <div className="finding">
            <span className="finding-dot" />
            <p>
              {high.length
                ? `${high.length} из ${data.students.length} учеников требуют внимания по тематическому риску или динамике.`
                : "В доступных данных нет выраженных сигналов риска."}
            </p>
          </div>
        </Panel>
        <Panel
          title="Учебный день"
          subtitle={`${dateLabel(data.schoolDate)} · версия ${data.schedule.version}`}
          className="span-4"
          action={
            <button
              className="text-button"
              onClick={() => navigate("schedule")}
              aria-label="Открыть расписание"
            >
              <ArrowUpRight size={17} />
            </button>
          }
        >
          <ScheduleList
            items={data.schedule.items}
            slots={data.slots}
            limit={4}
          />
        </Panel>
        <Panel
          title="Отчёт класса"
          subtitle="Из вычисленных фактов — в понятный текст"
          className="span-8"
        >
          <AIBox
            result={aiResult}
            loading={aiLoading}
            resources={data.resources}
            onGenerate={onAI}
            label="Итоги и следующие действия"
          />
        </Panel>
        <Panel
          title="На подтверждение"
          subtitle="Достижения учеников ваших классов"
          className="span-4"
          action={
            <button
              className="text-button"
              onClick={() => navigate("community")}
            >
              Открыть
              <ArrowRight size={15} />
            </button>
          }
        >
          <div className="pending-summary">
            <span>
              {data.achievements.filter((a) => a.status === "pending").length}
            </span>
            <p>достижений ожидают проверки</p>
            <ShieldCheck size={32} />
          </div>
          <PostList posts={data.posts} compact />
        </Panel>
      </div>
    );
  return (
    <>
      <div className="metric-strip">
        <div>
          <span>Средний результат</span>
          <strong>
            {analysis?.average == null ? "—" : `${fmt(analysis.average)}%`}
          </strong>
          <small>по доступным работам</small>
        </div>
        <div>
          <span>Учебные цели</span>
          <strong>
            {
              data.goals.filter(
                (g) => g.studentId === student?.id && g.completedAt,
              ).length
            }
            <em>
              {" "}
              / {data.goals.filter((g) => g.studentId === student?.id).length}
            </em>
          </strong>
          <small>закрыто</small>
        </div>
        <div>
          <span>Достижения</span>
          <strong>
            {
              data.achievements.filter(
                (a) => a.studentId === student?.id && a.status === "verified",
              ).length
            }
          </strong>
          <small>подтверждено</small>
        </div>
        <div>
          <span>Посещаемость</span>
          <strong>
            {analysis?.absences ?? 0}
            <em> проп.</em>
          </strong>
          <small>в доступной истории</small>
        </div>
      </div>
      <div className="dashboard-grid">
        <Panel
          title="Карта твоих знаний"
          subtitle="Темы связаны. Пробелы становятся понятнее."
          className="span-8 knowledge-panel"
          action={
            <button
              className="text-button"
              onClick={() => navigate("learning")}
            >
              Подробнее
              <ArrowUpRight size={16} />
            </button>
          }
        >
          {analysis?.topics.length ? (
            <KnowledgeMap topics={analysis.topics} />
          ) : (
            <Empty>Для карты нужны оценки с привязкой к темам.</Empty>
          )}
          {risk ? (
            <div
              className={`risk-insight ${risk.level === "high" ? "at-risk" : ""}`}
            >
              <div className="risk-score">
                <strong>{fmt(risk.score)}</strong>
                <span>/ 100</span>
              </div>
              <div>
                <h3>{risk.name}</h3>
                <p>
                  {risk.reasons[0] ||
                    "Посмотри темы, на которые стоит обратить внимание."}
                </p>
                <small>Индекс риска · эвристическая оценка</small>
              </div>
              <button
                className="icon-button"
                onClick={() => navigate("learning")}
                aria-label="Посмотреть объяснение риска"
              >
                <ArrowRight size={19} />
              </button>
            </div>
          ) : (
            <div className="finding">
              <p>
                Для расчёта риска следующей работы пока недостаточно
                тематических данных.
              </p>
            </div>
          )}
        </Panel>
        <Panel
          title="Сегодня по плану"
          subtitle={dateLabel(data.schoolDate)}
          className="span-4"
          action={
            <button
              className="text-button"
              onClick={() => navigate("schedule")}
              aria-label="Полное расписание"
            >
              <ArrowUpRight size={17} />
            </button>
          }
        >
          <ScheduleList
            items={data.schedule.items}
            slots={data.slots}
            limit={4}
          />
        </Panel>
        <Panel
          title={
            data.user.role === "parent"
              ? "Неделя ребёнка"
              : "Твой следующий шаг"
          }
          subtitle={
            data.aiConfigured
              ? "Персональная рекомендация по текущим данным"
              : "Фактическая выжимка доступна без AI"
          }
          className="span-8"
        >
          <AIBox
            result={aiResult}
            loading={aiLoading}
            resources={data.resources}
            onGenerate={onAI}
            label={
              data.user.role === "parent"
                ? "Выжимка за неделю"
                : "План подготовки"
            }
          />
        </Panel>
        <Panel
          title="Цели на пути"
          className="span-4"
          action={
            <button
              className="text-button"
              onClick={() => navigate("community")}
            >
              Все
              <ArrowRight size={15} />
            </button>
          }
        >
          <GoalList
            goals={data.goals
              .filter((g) => g.studentId === student?.id)
              .slice(0, 2)}
            canComplete={data.user.role === "student"}
            onComplete={complete}
            busy={busy}
          />
        </Panel>
        <Panel
          title="В лицее"
          className="span-8"
          action={
            <button
              className="text-button"
              onClick={() => navigate("announcements")}
            >
              Вся лента
              <ArrowRight size={15} />
            </button>
          }
        >
          <PostList posts={data.posts} compact />
        </Panel>
        <Panel
          title="Топ дня"
          subtitle="За закрытые учебные цели"
          className="span-4"
        >
          <Leaderboard entries={data.leaderboard} compact />
        </Panel>
      </div>
    </>
  );
}
function StudentTable({ data, limit }: { data: DashboardDTO; limit?: number }) {
  const rows = data.students
    .map((student) => ({
      student,
      analysis: data.analyses.find((a) => a.studentId === student.id),
    }))
    .sort(
      (a, b) =>
        Math.max(0, ...(b.analysis?.risks.map((r) => r.score || 0) || [])) -
        Math.max(0, ...(a.analysis?.risks.map((r) => r.score || 0) || [])),
    );
  return rows.length ? (
    <div className="table-wrap">
      <table className="student-table">
        <thead>
          <tr>
            <th>Ученик</th>
            <th className="number">Результат</th>
            <th className="number">Риск</th>
            <th>Сигнал</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, limit).map(({ student, analysis }) => {
            const risk = analysis?.risks
              .filter((r) => r.score !== null)
              .sort((a, b) => (b.score || 0) - (a.score || 0))[0];
            const trend = analysis?.trends.find((t) => t.warning);
            return (
              <tr key={student.id}>
                <td>
                  <div className="person-cell">
                    <Avatar user={student} />
                    <span>
                      <strong>{student.name}</strong>
                      <small>
                        {
                          data.classes.find((c) => c.id === student.classId)
                            ?.name
                        }
                      </small>
                    </span>
                  </div>
                </td>
                <td className="number">
                  {analysis?.average == null
                    ? "—"
                    : `${fmt(analysis.average)}%`}
                </td>
                <td className="number">
                  <span
                    className={risk?.level === "high" ? "negative-text" : ""}
                  >
                    {risk ? `${fmt(risk.score)} / 100` : "—"}
                  </span>
                </td>
                <td>
                  {trend ? (
                    <span className="trend-signal">
                      <ArrowDownRight size={16} />
                      {fmt((trend.delta || 0) * 100)} п.п.
                    </span>
                  ) : risk?.level === "high" ? (
                    <Status tone="warning">Пробелы в темах</Status>
                  ) : (
                    <span className="muted">Без спада</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty>У вас пока нет доступных учеников.</Empty>
  );
}
function Radar({ data }: { data: DashboardDTO }) {
  const [level, setLevel] = useState("all");
  const [subject, setSubject] = useState("all");
  const rows = data.radar.filter(
    (r) =>
      (level === "all" || r.gradeLevel === Number(level)) &&
      (subject === "all" || r.subjectId === subject),
  );
  return (
    <>
      <div className="filter-row">
        <label className="inline-label">
          Параллель
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="all">Все параллели</option>
            {[...new Set(data.classes.map((c) => c.gradeLevel))].map(
              (grade) => (
                <option key={grade} value={grade}>
                  {grade}-е классы
                </option>
              ),
            )}
          </select>
        </label>
        <label className="inline-label">
          Предмет
          <select value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="all">Все предметы</option>
            {data.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {rows.length ? (
        <div className="radar-list">
          {rows.map((row) => (
            <div
              className="radar-row"
              key={`${row.gradeLevel}-${row.subjectId}`}
            >
              <div>
                <strong>{row.subjectName}</strong>
                <small>
                  {row.gradeLevel}-е классы · {row.studentCount} учеников
                </small>
              </div>
              <div className="radar-track">
                <span style={{ width: `${row.average || 0}%` }} />
              </div>
              <span className="number">
                {row.average == null ? "—" : `${fmt(row.average)}%`}
              </span>
              <span className={row.highRiskCount ? "warning-text" : "muted"}>
                {row.highRiskCount} в риске
              </span>
            </div>
          ))}
        </div>
      ) : (
        <Empty>Нет данных для выбранной параллели и предмета.</Empty>
      )}
    </>
  );
}

function Learning({
  data,
  studentId,
  setStudentId,
  analysis,
  aiResult,
  aiLoading,
  onAI,
  busy,
  mutate,
}: {
  data: DashboardDTO;
  studentId: string;
  setStudentId: (id: string) => void;
  analysis?: StudentAnalysis;
  aiResult: AIResult | null;
  aiLoading: boolean;
  onAI: () => void;
  busy: boolean;
  mutate: Mutate;
}) {
  const [subject, setSubject] = useState("all");
  const topics =
    analysis?.topics.filter(
      (topic) =>
        subject === "all" ||
        data.grades.some(
          (g) => g.topicId === topic.topicId && g.subjectId === subject,
        ),
    ) || [];
  const grades = data.grades
    .filter(
      (g) =>
        g.studentId === studentId &&
        (subject === "all" || g.subjectId === subject),
    )
    .sort((a, b) => b.assessedAt.localeCompare(a.assessedAt));
  return (
    <>
      <div className="filter-row learning-filters">
        {data.students.length > 1 && (
          <label className="inline-label">
            Ученик
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            >
              {data.students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ·{" "}
                  {data.classes.find((c) => c.id === s.classId)?.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="inline-label">
          Предмет
          <select value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="all">Все предметы</option>
            {data.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="dashboard-grid">
        {(data.user.role === "teacher" || data.user.role === "admin") && (
          <Panel
            title="Раннее предупреждение"
            subtitle="Риск по темам и спад внутри одного предмета"
            className="span-12"
          >
            <StudentTable data={data} />
          </Panel>
        )}
        <Panel
          title="Темы и необходимые основы"
          subtitle="Освоение рассчитано по тематическим работам"
          className="span-8"
        >
          {topics.length ? (
            <KnowledgeMap topics={topics} />
          ) : (
            <Empty>Нет тематических оценок для этого предмета.</Empty>
          )}
          <div className="topic-details">
            {topics.map((topic) => (
              <div key={topic.topicId}>
                <span>{topic.name}</span>
                <div className="mastery-track">
                  <i
                    style={{
                      width:
                        topic.mastery == null
                          ? "0%"
                          : `${topic.mastery * 100}%`,
                    }}
                  />
                </div>
                <strong className="number">{percent(topic.mastery)}</strong>
              </div>
            ))}
          </div>
        </Panel>
        <Panel
          title="Следующие работы"
          subtitle="Индекс риска не является вероятностью провала"
          className="span-4"
        >
          {analysis?.risks.length ? (
            analysis.risks
              .filter((r) => subject === "all" || r.subjectId === subject)
              .map((risk) => (
                <article className="assessment" key={risk.assessmentId}>
                  <div>
                    <h3>{risk.name}</h3>
                    <span
                      className={
                        risk.level === "high" ? "negative-text" : "teal-text"
                      }
                    >
                      {risk.score === null ? "—" : fmt(risk.score)}
                      <small> / 100</small>
                    </span>
                  </div>
                  <Status tone={risk.level === "high" ? "warning" : "neutral"}>
                    {risk.level === "insufficient_data"
                      ? "Недостаточно данных"
                      : risk.level === "high"
                        ? "Нужна подготовка"
                        : risk.level === "medium"
                          ? "Есть слабые темы"
                          : "Низкий риск"}
                  </Status>
                  <ul>
                    {risk.reasons.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                  <p className="small muted">
                    Покрытие тем: {percent(risk.coverage)}
                  </p>
                </article>
              ))
          ) : (
            <Empty>Предстоящие работы пока не добавлены.</Empty>
          )}
        </Panel>
        <Panel
          title={
            data.user.role === "parent"
              ? "Итоги недели"
              : "Подготовка и поддержка"
          }
          className="span-8"
        >
          <AIBox
            result={aiResult}
            loading={aiLoading}
            resources={data.resources}
            onGenerate={onAI}
            label={
              data.user.role === "teacher" || data.user.role === "admin"
                ? "Отчёт класса"
                : data.user.role === "parent"
                  ? "Выжимка родителю"
                  : "Тьютор по темам"
            }
          />
        </Panel>
        <Panel
          title="Последние оценки"
          subtitle="Баллы нормализуются по максимуму работы"
          className="span-4"
        >
          {grades.length ? (
            <div className="grade-list">
              {grades.slice(0, 8).map((grade) => (
                <div key={grade.id}>
                  <span>
                    <strong>
                      {data.subjects.find((s) => s.id === grade.subjectId)
                        ?.name || "Предмет"}
                    </strong>
                    <small>{dateLabel(grade.assessedAt)}</small>
                  </span>
                  <span className="number">
                    {grade.earned}
                    <em> / {grade.maximum}</em>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty>Оценок в выбранной выборке пока нет.</Empty>
          )}
        </Panel>
        {data.user.role === "admin" && (
          <Panel
            title="Добавить оценку в mock BilimClass"
            subtitle="Новая работа обновит аналитику во всех связанных ролях"
            className="span-12"
          >
            <GradeForm
              data={data}
              studentId={studentId}
              mutate={mutate}
              busy={busy}
            />
          </Panel>
        )}
      </div>
    </>
  );
}
function GradeForm({
  data,
  studentId,
  mutate,
  busy,
}: {
  data: DashboardDTO;
  studentId: string;
  mutate: Mutate;
  busy: boolean;
}) {
  const [topic, setTopic] = useState("");
  const [earned, setEarned] = useState("4");
  const [maximum, setMaximum] = useState("10");
  const allTopics = data.analyses
    .flatMap((a) => a.topics)
    .filter((t, i, arr) => arr.findIndex((n) => n.topicId === t.topicId) === i);
  const topicId = topic || allTopics[0]?.topicId || "";
  const subjectId =
    data.grades.find((g) => g.topicId === topicId)?.subjectId ||
    data.subjects[0]?.id;
  return (
    <form
      className="compact-form"
      onSubmit={(e) => {
        e.preventDefault();
        mutate(
          "/mock/bilimclass/grades",
          {
            studentId,
            subjectId,
            topicId,
            earned: Number(earned),
            maximum: Number(maximum),
          },
          "Оценка сохранена. Аналитика пересчитана.",
        );
      }}
    >
      <label>
        Тема
        <select
          value={topicId}
          onChange={(e) => setTopic(e.target.value)}
          required
        >
          {allTopics.map((t) => (
            <option key={t.topicId} value={t.topicId}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Балл
        <input
          type="number"
          min="0"
          step="0.1"
          value={earned}
          onChange={(e) => setEarned(e.target.value)}
          required
        />
      </label>
      <label>
        Максимум
        <input
          type="number"
          min="0.1"
          step="0.1"
          value={maximum}
          onChange={(e) => setMaximum(e.target.value)}
          required
        />
      </label>
      <button className="button" disabled={busy || !studentId || !topicId}>
        <Plus size={15} />
        Добавить оценку
      </button>
    </form>
  );
}

function Schedule({
  data,
  busy,
  mutate,
}: {
  data: DashboardDTO;
  busy: boolean;
  mutate: Mutate;
}) {
  const [teacherId, setTeacherId] = useState("");
  const [result, setResult] = useState<string>("");
  const admin = data.user.role === "admin";
  async function generate() {
    setResult("");
    await mutate(
      "/api/schedule/generate",
      { baseRevision: data.revision },
      "Расчёт завершён.",
    );
    setResult(
      "Только допустимое решение становится новой опубликованной версией.",
    );
  }
  return (
    <>
      <div className="schedule-toolbar">
        <div className="schedule-date">
          <CalendarDays size={20} />
          <span>{dateLabel(data.schoolDate)}</span>
          <Status
            tone={data.schedule.status === "current" ? "positive" : "warning"}
          >
            {data.schedule.status === "current"
              ? "Опубликовано"
              : "Нужна замена"}
          </Status>
        </div>
        {admin && (
          <button className="button primary" onClick={generate} disabled={busy}>
            <RefreshCw size={16} />
            {busy ? "Ищем решение…" : "Сгенерировать расписание"}
          </button>
        )}
      </div>
      <div className="dashboard-grid">
        <Panel
          title="Занятия и профильные ленты"
          subtitle={`Версия ${data.schedule.version} · ${data.schedule.items.length} назначений`}
          className={admin ? "span-8" : "span-12"}
        >
          <ScheduleList items={data.schedule.items} slots={data.slots} />
          {result && <p className="small muted">{result}</p>}
        </Panel>
        {admin && (
          <Panel
            title="Учитель отсутствует"
            subtitle="Перестроим расписание с учётом доступных замен"
            className="span-4"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                mutate(
                  "/api/schedule/absence",
                  {
                    teacherId,
                    schoolDate: data.schoolDate,
                    baseRevision: data.revision,
                  },
                  "Отсутствие сохранено. Результат перестроения отражён в расписании.",
                );
              }}
            >
              <label>
                Учитель
                <select
                  value={teacherId}
                  onChange={(e) => setTeacherId(e.target.value)}
                  required
                >
                  <option value="">Выберите учителя</option>
                  {data.teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="button full" disabled={busy || !teacherId}>
                Отметить болезнь
                <ArrowRight size={16} />
              </button>
            </form>
            <div className="schedule-note">
              <ShieldCheck size={18} />
              <p>
                Учителя, кабинеты и ученики проверяются на пересечения.
                Неразрешённая замена остаётся видимой.
              </p>
            </div>
            <AvailabilityForm data={data} busy={busy} mutate={mutate} />
            <h3 className="section-subtitle">Доступность учителей</h3>
            <div className="availability-list">
              {data.teacherAvailability.map((item) => (
                <div key={item.teacherId}>
                  <span>
                    {data.teachers.find((t) => t.id === item.teacherId)?.name ||
                      item.teacherId}
                  </span>
                  <small>
                    {item.unavailableSlots.length
                      ? `Занят: ${item.unavailableSlots.map((s) => data.slots.find((slot) => slot.id === s)?.start || s + 1).join(", ")}`
                      : "Свободен в доступных слотах"}
                  </small>
                </div>
              ))}
            </div>
          </Panel>
        )}
        {admin && (
          <Panel
            title="Новое занятие"
            subtitle="Урок, пара, академический час, мероприятие или часть профильной ленты"
            className="span-12"
          >
            <DemandForm data={data} busy={busy} mutate={mutate} />
          </Panel>
        )}
      </div>
    </>
  );
}
function DemandForm({
  data,
  busy,
  mutate,
}: {
  data: DashboardDTO;
  busy: boolean;
  mutate: Mutate;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<Demand["kind"]>("lesson");
  const [classId, setClassId] = useState(data.classes[0]?.id || "");
  const [subjectId, setSubjectId] = useState(data.subjects[0]?.id || "");
  const [teacherId, setTeacherId] = useState("");
  const [roomId, setRoomId] = useState(data.rooms[0]?.id || "");
  const [start, setStart] = useState("any");
  const [duration, setDuration] = useState("1");
  const [laneId, setLaneId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const classStudents = data.students.filter((s) => s.classId === classId);
  const students = selected.length ? selected : classStudents.map((s) => s.id);
  const teachers = data.teachers.filter(
    (t) => kind === "event" || t.subjectIds?.includes(subjectId),
  );
  return (
    <form
      className="demand-form"
      onSubmit={(e) => {
        e.preventDefault();
        mutate(
          "/api/schedule/demands",
          {
            title,
            kind,
            ...(kind === "event" ? {} : { subjectId }),
            studentIds: students,
            durationSlots: kind === "pair" ? 2 : Number(duration),
            allowedTeacherIds:
              kind === "event" && !teacherId
                ? []
                : teacherId
                  ? [teacherId]
                  : teachers.map((t) => t.id),
            allowedRoomIds: roomId ? [roomId] : data.rooms.map((r) => r.id),
            allowedStartSlots:
              start === "any" ? data.slots.map((s) => s.id) : [Number(start)],
            ...(laneId.trim() ? { laneId: laneId.trim() } : {}),
            baseRevision: data.revision,
          },
          "Занятие добавлено и проверено.",
        );
      }}
    >
      <div className="form-grid">
        <label className="wide-field">
          Название
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            minLength={2}
            maxLength={100}
            placeholder="Например, профильная физика"
            required
          />
        </label>
        <label>
          Тип
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as Demand["kind"]);
              if (e.target.value === "pair") setDuration("2");
            }}
          >
            {Object.entries(kindNames).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Предмет
          <select
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setTeacherId("");
            }}
            disabled={kind === "event"}
          >
            {data.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Класс
          <select
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setSelected([]);
            }}
          >
            {data.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Учитель
          <select
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
          >
            <option value="">Любой подходящий</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Кабинет
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">Любой доступный</option>
            {data.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Начало
          <select value={start} onChange={(e) => setStart(e.target.value)}>
            <option value="any">Подберёт алгоритм</option>
            {data.slots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.start}
              </option>
            ))}
          </select>
        </label>
        <label>
          Длительность, слотов
          <input
            type="number"
            min="1"
            max="8"
            value={kind === "pair" ? "2" : duration}
            onChange={(e) => setDuration(e.target.value)}
            disabled={kind === "pair"}
            required
          />
        </label>
        <label>
          Общая лента
          <input
            value={laneId}
            onChange={(e) => setLaneId(e.target.value)}
            placeholder="ID для синхронных групп"
          />
        </label>
      </div>
      <details className="group-picker">
        <summary>Состав группы · {students.length} учеников</summary>
        <p className="small muted">
          Без выбора используется весь класс. Для смешанной группы можно
          отметить учеников разных классов.
        </p>
        <div className="student-checkboxes">
          {data.students.map((s) => (
            <label key={s.id}>
              <input
                type="checkbox"
                checked={selected.includes(s.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, s.id]
                      : selected.filter((id) => id !== s.id),
                  )
                }
              />
              <span>
                {s.name}
                <small>
                  {data.classes.find((c) => c.id === s.classId)?.name}
                </small>
              </span>
            </label>
          ))}
        </div>
      </details>
      <button className="button" disabled={busy || students.length === 0}>
        <Plus size={16} />
        Добавить и проверить
      </button>
    </form>
  );
}

function Community({
  data,
  busy,
  mutate,
}: {
  data: DashboardDTO;
  busy: boolean;
  mutate: Mutate;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("certificate");
  const canVerify = data.user.role === "teacher" || data.user.role === "admin";
  const [tab, setTab] = useState<"all" | "pending">("all");
  const achievements = data.achievements.filter(
    (a) => tab === "all" || a.status === "pending",
  );
  return (
    <div className="dashboard-grid">
      <Panel
        title="Цифровое портфолио"
        subtitle="Сертификаты, олимпиады и участие в жизни лицея"
        className="span-8"
        action={
          canVerify ? (
            <div className="segmented">
              <button
                className={tab === "all" ? "active" : ""}
                onClick={() => setTab("all")}
              >
                Все
              </button>
              <button
                className={tab === "pending" ? "active" : ""}
                onClick={() => setTab("pending")}
              >
                На проверку
              </button>
            </div>
          ) : undefined
        }
      >
        {achievements.length ? (
          <div className="achievement-list">
            {achievements.map((item) => (
              <article key={item.id} className="achievement">
                <div className="achievement-mark">
                  <Award size={24} />
                </div>
                <div>
                  <div className="achievement-title">
                    <h3>{item.title}</h3>
                    <Status
                      tone={item.status === "verified" ? "positive" : "neutral"}
                    >
                      {item.status === "verified"
                        ? "Подтверждено"
                        : "На проверке"}
                    </Status>
                  </div>
                  <p>
                    {data.students.find((s) => s.id === item.studentId)?.name ||
                      "Ученик"}{" "}
                    ·{" "}
                    {item.category === "olympiad"
                      ? "Олимпиада"
                      : item.category === "activity"
                        ? "Участие"
                        : "Сертификат"}
                  </p>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-link"
                  >
                    Документ
                    <ExternalLink size={13} />
                  </a>
                  {item.verifiedAt && (
                    <small className="verification">
                      Проверено {dateLabel(item.verifiedAt)}
                    </small>
                  )}
                  {canVerify && item.status === "pending" && (
                    <button
                      className="text-button verify-button"
                      disabled={busy}
                      onClick={() =>
                        mutate(
                          `/api/portfolio/${item.id}/verify`,
                          {},
                          "Достижение подтверждено. Профиль обновлён.",
                        )
                      }
                    >
                      <ShieldCheck size={15} />
                      Подтвердить
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty>
            {tab === "pending"
              ? "Все достижения проверены."
              : "Достижения пока не добавлены."}
          </Empty>
        )}
        {data.user.role === "student" && (
          <form
            className="portfolio-form"
            onSubmit={(e) => {
              e.preventDefault();
              mutate(
                "/api/portfolio",
                { title, url, category },
                "Достижение отправлено на проверку учителю.",
              );
            }}
          >
            <h3>Добавить достижение</h3>
            <div className="form-grid">
              <label className="wide-field">
                Название
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  minLength={3}
                  maxLength={120}
                  placeholder="Название конкурса или сертификата"
                  required
                />
              </label>
              <label>
                Категория
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="certificate">Сертификат</option>
                  <option value="olympiad">Олимпиада</option>
                  <option value="activity">Школьная активность</option>
                </select>
              </label>
              <label className="wide-field">
                Ссылка на документ
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                  pattern="https://.*"
                  required
                />
              </label>
            </div>
            <button className="button" disabled={busy}>
              <Plus size={15} />
              На проверку
            </button>
          </form>
        )}
      </Panel>
      <Panel
        title="Топ дня"
        subtitle="Баллы за закрытые цели · Asia/Oral"
        className="span-4"
      >
        <Leaderboard entries={data.leaderboard} />
      </Panel>
      <Panel
        title="Учебные цели"
        subtitle="Каждая цель приносит баллы один раз"
        className="span-8"
      >
        <GoalList
          goals={data.goals}
          busy={busy}
          canComplete={data.user.role === "student"}
          onComplete={(id) =>
            mutate(
              `/api/goals/${id}/complete`,
              {},
              "Цель закрыта. Баллы начислены один раз.",
            )
          }
        />
      </Panel>
      <Panel title="Достижение начинается с шага" className="span-4">
        <div className="goal-explainer">
          <Target size={28} />
          <p>
            Закрывай учебные цели, собирай подтверждённые результаты и замечай
            собственный прогресс.
          </p>
          <div>
            <CheckCheck size={17} />
            <span>Выполненные цели остаются в профиле</span>
          </div>
          <div>
            <ShieldCheck size={17} />
            <span>Достижения подтверждает учитель</span>
          </div>
        </div>
      </Panel>
    </div>
  );
}
function Announcements({
  data,
  busy,
  mutate,
}: {
  data: DashboardDTO;
  busy: boolean;
  mutate: Mutate;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("all");
  const [publicPost, setPublicPost] = useState(false);
  return (
    <div className="dashboard-grid">
      <Panel
        title="Новости и события"
        subtitle="Публикации, доступные вашей аудитории"
        className={data.user.role === "admin" ? "span-8" : "span-12"}
      >
        <PostList posts={data.posts} />
      </Panel>
      {data.user.role === "admin" && (
        <Panel
          title="Опубликовать событие"
          subtitle="Аудитория применяется на сервере"
          className="span-4"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              mutate(
                "/api/posts",
                {
                  title,
                  body,
                  audience: audience === "all" ? "all" : Number(audience),
                  public: publicPost,
                },
                "Объявление опубликовано для выбранной аудитории.",
              );
            }}
          >
            <label>
              Заголовок
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                minLength={3}
                maxLength={120}
                required
              />
            </label>
            <label>
              Текст
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                minLength={3}
                maxLength={2000}
                rows={5}
                required
              />
            </label>
            <label>
              Кому показать
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
              >
                <option value="all">Весь лицей</option>
                {[...new Set(data.classes.map((c) => c.gradeLevel))].map(
                  (level) => (
                    <option key={level} value={level}>
                      {level}-е классы
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={publicPost}
                onChange={(e) => setPublicPost(e.target.checked)}
              />
              Показать на публичной стенгазете
            </label>
            <button className="button primary full" disabled={busy}>
              Опубликовать
              <ArrowRight size={15} />
            </button>
          </form>
        </Panel>
      )}
    </div>
  );
}
function Notifications({
  data,
  busy,
  enablePush,
}: {
  data: DashboardDTO;
  busy: boolean;
  enablePush: () => void;
}) {
  const delivery: Record<string, string> = {
    pending: "Отправляется",
    sent: "Принято push-сервисом",
    failed: "Ошибка доставки",
    not_subscribed: "Нет push-подписки",
  };
  return (
    <div className="dashboard-grid">
      <Panel
        title="Сообщения о заменах"
        subtitle="Только изменения, которые относятся к вам"
        className="span-8"
      >
        {data.notifications.length ? (
          <div className="notification-list">
            {[...data.notifications].reverse().map((item) => (
              <article key={item.id}>
                <Bell size={18} />
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                  <div className="notification-meta">
                    <time>{dateLabel(item.createdAt)}</time>
                    <span>Версия {item.version}</span>
                    <Status
                      tone={item.delivery === "failed" ? "warning" : "neutral"}
                    >
                      {delivery[item.delivery]}
                    </Status>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty>
            Новых изменений пока нет. Сообщения о заменах появятся здесь.
          </Empty>
        )}
      </Panel>
      <Panel title="Узнать о замене вовремя" className="span-4">
        <div className="push-description">
          <Bell size={30} />
          <p>
            Разрешите браузерные уведомления, чтобы получать изменения
            расписания, даже когда портал не на экране.
          </p>
          <button
            className="button primary full"
            disabled={busy}
            onClick={enablePush}
          >
            Включить уведомления
            <ArrowRight size={16} />
          </button>
          <small>
            Разрешение действует для этого браузера и текущего аккаунта.
          </small>
        </div>
      </Panel>
    </div>
  );
}

function Kiosk() {
  const [data, setData] = useState<KioskDTO | null>(null);
  const [error, setError] = useState("");
  const [time, setTime] = useState(new Date());
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      api<KioskDTO>("/api/kiosk")
        .then((value) => {
          if (active) {
            setData(value);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(messageOf(e));
        });
    refresh();
    const interval = setInterval(refresh, 15000);
    const clock = setInterval(() => setTime(new Date()), 1000);
    return () => {
      active = false;
      clearInterval(interval);
      clearInterval(clock);
    };
  }, []);
  useEffect(() => {
    let direction = 1;
    const interval = setInterval(() => {
      const el = scroller.current;
      if (!el || el.scrollHeight <= el.clientHeight) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) direction = -1;
      if (el.scrollTop <= 0) direction = 1;
      el.scrollTop += direction;
    }, 60);
    return () => clearInterval(interval);
  }, []);
  return (
    <main className="kiosk-page">
      <header>
        <Mark large />
        <div>
          <span>
            {new Intl.DateTimeFormat("ru-RU", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Asia/Oral",
            }).format(time)}
          </span>
          <p>{dateLabel(time.toISOString())}</p>
        </div>
      </header>
      <div className="kiosk-title">
        <div>
          <h1>Сегодня в Aqbobek</h1>
          <p>Лицей в одном ритме.</p>
        </div>
        <span className="kiosk-live">
          <i />
          Стенгазета
        </span>
      </div>
      {error && (
        <p className="notice warning" role="alert">
          {error}
          {data ? " · Показана последняя загруженная версия." : ""}
        </p>
      )}
      {!data ? (
        <p className="kiosk-loading" role="status">
          Загружаем школьный день…
        </p>
      ) : (
        <div className="kiosk-grid">
          <section className="kiosk-news">
            <h2>В лицее</h2>
            <div className="kiosk-scroll" ref={scroller}>
              <PostList posts={data.posts} />
              {data.posts.length > 0 && (
                <div className="kiosk-scroll-footer">
                  Новые события появляются здесь автоматически.
                </div>
              )}
            </div>
          </section>
          <section className="kiosk-changes">
            <h2>Актуальные замены</h2>
            <p className="kiosk-version">
              Версия {data.version}
              {data.status !== "current" ? " · есть нерешённые замены" : ""}
            </p>
            {data.changes.length ? (
              data.changes.map((item) => (
                <article key={item.demandId}>
                  <div>
                    <strong>{item.title}</strong>
                    <Status tone={item.unresolved ? "warning" : "positive"}>
                      {item.unresolved ? "Ожидает решения" : "Изменено"}
                    </Status>
                  </div>
                  <p className="kiosk-change-time">
                    {data.slots.find((slot) => slot.id === item.startSlot)
                      ?.start || `Слот ${item.startSlot + 1}`}
                    –
                    {data.slots.find(
                      (slot) =>
                        slot.id === item.startSlot + item.durationSlots - 1,
                    )?.end || "—"}
                  </p>
                  <p>
                    {item.roomName} ·{" "}
                    {item.teacherName || "Учитель не назначен"}
                  </p>
                </article>
              ))
            ) : (
              <div className="kiosk-clear">
                <CheckCheck size={34} />
                <p>Изменений в расписании нет.</p>
              </div>
            )}
          </section>
          <section className="kiosk-top">
            <h2>Топ учеников дня</h2>
            <p>Учебные цели, которые стали результатом.</p>
            <Leaderboard entries={data.leaderboard} compact />
          </section>
        </div>
      )}
      <footer>
        <span>Демонстрационные данные · Aqbobek Pulse</span>
        <span>Обновляется автоматически</span>
      </footer>
    </main>
  );
}
function AvailabilityForm({
  data,
  busy,
  mutate,
}: {
  data: DashboardDTO;
  busy: boolean;
  mutate: Mutate;
}) {
  const [type, setType] = useState<"teacher" | "room">("teacher");
  const [id, setId] = useState("");
  const [slots, setSlots] = useState<number[]>([]);
  const resources =
    type === "teacher"
      ? data.teachers.map((t) => ({ id: t.id, name: t.name }))
      : data.rooms;
  function changeResource(next: string) {
    setId(next);
    const existing =
      type === "teacher"
        ? data.teacherAvailability.find((t) => t.teacherId === next)
            ?.unavailableSlots
        : data.rooms.find((r) => r.id === next)?.unavailableSlots;
    setSlots(existing || []);
  }
  return (
    <details className="availability-editor">
      <summary>Изменить доступность</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutate(
            "/api/schedule/availability",
            {
              ...(type === "teacher" ? { teacherId: id } : { roomId: id }),
              unavailableSlots: slots,
              baseRevision: data.revision,
            },
            "Ограничения сохранены. Сгенерируйте расписание заново.",
          );
        }}
      >
        <label>
          Ресурс
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value as "teacher" | "room");
              setId("");
              setSlots([]);
            }}
          >
            <option value="teacher">Учитель</option>
            <option value="room">Кабинет</option>
          </select>
        </label>
        <label>
          {type === "teacher" ? "Учитель" : "Кабинет"}
          <select
            value={id}
            onChange={(e) => changeResource(e.target.value)}
            required
          >
            <option value="">Выберите ресурс</option>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <div className="slot-checkboxes">
          <p>Недоступные интервалы</p>
          {data.slots.map((slot) => (
            <label key={slot.id}>
              <input
                type="checkbox"
                checked={slots.includes(slot.id)}
                onChange={(e) =>
                  setSlots(
                    e.target.checked
                      ? [...slots, slot.id]
                      : slots.filter((s) => s !== slot.id),
                  )
                }
              />
              {slot.start}–{slot.end}
            </label>
          ))}
        </div>
        <button className="button full" disabled={busy || !id}>
          Сохранить ограничения
        </button>
      </form>
    </details>
  );
}
