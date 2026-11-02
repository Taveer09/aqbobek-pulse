import webpush from "web-push";
import type { Store } from "../db.ts";
import type {
  SchoolState,
  ScheduleVersion,
  Notification,
} from "../../shared/contracts.ts";
export function configurePush(store: Store) {
  let json = store.config("vapid");
  if (!json) {
    json = JSON.stringify(webpush.generateVAPIDKeys());
    store.config("vapid", json);
  }
  const keys = JSON.parse(json) as { publicKey: string; privateKey: string };
  webpush.setVapidDetails(
    "mailto:admin@pulse.demo",
    keys.publicKey,
    keys.privateKey,
  );
  return keys.publicKey;
}
export function addScheduleNotifications(
  s: SchoolState,
  version: ScheduleVersion,
  unresolved = false,
) {
  const now = new Date().toISOString();
  for (const demandId of version.changedDemandIds) {
    const demand = s.demands.find((d) => d.id === demandId);
    const assignment = version.assignments.find((a) => a.demandId === demandId);
    if (!demand) continue;
    const recipients = new Set([
      ...demand.studentIds,
      ...(assignment?.teacherId ? [assignment.teacherId] : []),
    ]);
    for (const userId of recipients) {
      const id = `n-${version.id}-${demandId}-${userId}-${unresolved ? "pending" : "changed"}`;
      if (s.notifications.some((n) => n.id === id)) continue;
      s.notifications.push({
        id,
        userId,
        title: unresolved ? "Занятие ожидает замены" : "Изменение расписания",
        body: `${demand.title}. ${unresolved ? "Учитель отсутствует; замена ещё не найдена." : `Новое время: ${s.slots.find((t) => t.id === assignment?.startSlot)?.start || "уточняется"}, ${s.rooms.find((r) => r.id === assignment?.roomId)?.name || ""}.`}`,
        version: version.id,
        createdAt: now,
        delivery: "pending",
        attempts: 0,
      });
    }
  }
}
let flushing = false;
export async function flushNotifications(store: Store) {
  if (flushing) return;
  flushing = true;
  try {
    const pending = store
      .read()
      .notifications.filter(
        (n) =>
          n.delivery === "pending" ||
          (n.delivery === "failed" && n.attempts < 2),
      );
    for (const n of pending) {
      const subs = store.subscriptions(n.userId);
      let sent = false;
      for (const sub of subs)
        try {
          await webpush.sendNotification(
            sub,
            JSON.stringify({
              id: n.id,
              title: n.title,
              body: n.body,
              url: "/notifications",
            }),
            { TTL: 120, timeout: 5000 },
          );
          sent = true;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410)
            store.removeSubscription(sub.endpoint);
        }
      store.mutate(
        (s) => {
          const record = s.notifications.find((x) => x.id === n.id);
          if (record) {
            record.delivery = subs.length
              ? sent
                ? "sent"
                : "failed"
              : "not_subscribed";
            record.attempts++;
          }
        },
        undefined,
        false,
      );
    }
  } finally {
    flushing = false;
  }
}
