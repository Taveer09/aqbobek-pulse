import type {
  Grade,
  Risk,
  SchoolState,
  StudentAnalysis,
  SubjectTrend,
  TopicMastery,
} from "../../shared/contracts.js";

const DAY = 86_400_000;
const round = (value: number, digits = 1) => Number(value.toFixed(digits));
const mean = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

/** Pure, deterministic indicators. Scores are heuristics, never failure probabilities. */
export function analyzeStudent(
  state: SchoolState,
  studentId: string,
  now?: Date,
): StudentAnalysis {
  const reference = now ?? new Date(`${state.schoolDate}T23:59:59.999+05:00`);
  const referenceTime = reference.getTime();
  const schoolDay = Number.isFinite(referenceTime)
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Oral",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(reference)
    : state.schoolDate;
  const topicsById = new Map(state.topics.map((topic) => [topic.id, topic]));
  const grades = state.grades.filter((grade) => {
    const topic = topicsById.get(grade.topicId);
    const time = Date.parse(grade.assessedAt);
    return (
      grade.studentId === studentId &&
      topic?.subjectId === grade.subjectId &&
      Number.isFinite(grade.earned) &&
      Number.isFinite(grade.maximum) &&
      grade.maximum > 0 &&
      grade.earned >= 0 &&
      grade.earned <= grade.maximum &&
      Number.isFinite(time) &&
      time <= referenceTime
    );
  });
  const byTopic = new Map<string, Grade[]>();
  for (const grade of grades) {
    const entries = byTopic.get(grade.topicId) ?? [];
    entries.push(grade);
    byTopic.set(grade.topicId, entries);
  }
  const topics: TopicMastery[] = state.topics.map((topic) => {
    const entries = byTopic.get(topic.id) ?? [];
    let weightedTotal = 0;
    let totalWeight = 0;
    for (const grade of entries) {
      const weeksOld =
        Math.max(0, referenceTime - Date.parse(grade.assessedAt)) / (7 * DAY);
      const weight = 0.8 ** weeksOld;
      weightedTotal += (grade.earned / grade.maximum) * weight;
      totalWeight += weight;
    }
    return {
      topicId: topic.id,
      name: topic.name,
      prerequisiteIds: [...topic.prerequisiteIds],
      mastery:
        entries.length >= 2 && totalWeight > 0
          ? round(weightedTotal / totalWeight, 4)
          : null,
      observations: entries.length,
    };
  });
  const masteryById = new Map(topics.map((topic) => [topic.topicId, topic]));
  const risks: Risk[] = state.assessments
    .filter(
      (assessment) =>
        assessment.studentIds.includes(studentId) &&
        assessment.date >= schoolDay,
    )
    .map((assessment) => {
      const reasons: string[] = [];
      const topicIds = assessment.topics.map((entry) => entry.topicId);
      const weightsValid =
        assessment.topics.length > 0 &&
        new Set(topicIds).size === topicIds.length &&
        assessment.topics.every(
          (entry) => Number.isFinite(entry.weight) && entry.weight > 0,
        ) &&
        Math.abs(
          assessment.topics.reduce((sum, entry) => sum + entry.weight, 0) - 1,
        ) <= 1e-6;
      if (!weightsValid) {
        return {
          assessmentId: assessment.id,
          name: assessment.name,
          subjectId: assessment.subjectId,
          score: null,
          level: "insufficient_data",
          coverage: 0,
          topicIds,
          reasons: [
            "Не заданы корректные тематические веса предстоящей работы.",
          ],
        };
      }
      let score = 0;
      let coverage = 0;
      for (const entry of assessment.topics) {
        const topic = topicsById.get(entry.topicId);
        const target = masteryById.get(entry.topicId);
        if (
          !topic ||
          topic.subjectId !== assessment.subjectId ||
          target?.mastery == null
        ) {
          reasons.push(
            `Недостаточно тематических работ: ${target?.name ?? entry.topicId}.`,
          );
          continue;
        }
        const prerequisites = topic.prerequisiteIds.map((id) =>
          masteryById.get(id),
        );
        if (prerequisites.some((item) => item?.mastery == null)) {
          reasons.push(
            `Не хватает данных по предпосылкам темы «${topic.name}».`,
          );
          continue;
        }
        const targetGap = 1 - target.mastery;
        const topicRisk =
          prerequisites.length === 0
            ? targetGap
            : 0.7 * targetGap +
              0.3 * (1 - mean(prerequisites.map((item) => item!.mastery!)));
        score += 100 * topicRisk * entry.weight;
        coverage += entry.weight;
        reasons.push(
          `«${topic.name}»: освоение ${round(target.mastery * 100)}%, работ: ${target.observations}.`,
        );
        if (prerequisites.length > 0) {
          const weakest = [...prerequisites].sort(
            (a, b) => a!.mastery! - b!.mastery!,
          )[0]!;
          reasons.push(
            `Предпосылка «${weakest.name}»: ${round(weakest.mastery! * 100)}%.`,
          );
        }
      }
      const complete = Math.abs(coverage - 1) <= 1e-6;
      const displayedScore = complete ? round(score) : null;
      return {
        assessmentId: assessment.id,
        name: assessment.name,
        subjectId: assessment.subjectId,
        score: displayedScore,
        level:
          displayedScore != null
            ? displayedScore >= 65
              ? "high"
              : displayedScore >= 40
                ? "medium"
                : "low"
            : "insufficient_data",
        coverage: round(coverage, 4),
        topicIds,
        reasons,
      };
    });
  const trends: SubjectTrend[] = state.subjects.map((subject) => {
    const history = grades
      .filter((grade) => grade.subjectId === subject.id)
      .sort(
        (a, b) =>
          Date.parse(a.assessedAt) - Date.parse(b.assessedAt) ||
          a.id.localeCompare(b.id),
      );
    const recent =
      history.length > 0
        ? mean(history.slice(-3).map((grade) => grade.earned / grade.maximum))
        : null;
    const previous =
      history.length >= 6
        ? mean(
            history.slice(-6, -3).map((grade) => grade.earned / grade.maximum),
          )
        : null;
    const delta = recent != null && previous != null ? recent - previous : null;
    return {
      subjectId: subject.id,
      previous: previous == null ? null : round(previous, 4),
      recent: recent == null ? null : round(recent, 4),
      delta: delta == null ? null : round(delta, 4),
      warning: delta != null && delta <= -0.2 + 1e-9,
    };
  });
  const weekStart = new Date(`${schoolDay}T00:00:00+05:00`).getTime() - 6 * DAY;
  const absences = state.attendance.filter((record) => {
    const day = Date.parse(`${record.date}T00:00:00+05:00`);
    return (
      record.studentId === studentId &&
      record.status === "absent" &&
      day >= weekStart &&
      day <= referenceTime
    );
  }).length;
  return {
    studentId,
    average:
      grades.length > 0
        ? round(mean(grades.map((grade) => grade.earned / grade.maximum)) * 100)
        : null,
    topics,
    risks,
    trends,
    absences,
  };
}
