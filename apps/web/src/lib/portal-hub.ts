import type { DashboardSummary, HubMessage, HubNotification } from "../types/dashboard";

export interface PortalAnnouncementItem {
  id: string;
  title: string;
  body: string;
  date: string;
}

export interface PortalPanelMessage {
  title: string;
  preview: string;
  date: string;
  href?: string;
}

export interface PortalPanelNotification {
  type: "assignment" | "grade" | "announcement" | "reminder" | "system";
  title: string;
  body: string;
  date: string;
  href?: string;
}

export interface PortalPanelCalendarDay {
  date: string;
  events: Array<{
    title: string;
    time?: string;
    href?: string;
  }>;
}

const GUEST_MESSAGES: HubMessage[] = [
  {
    id: "guest-sign-in",
    title: "Sign in to YorkLanes",
    preview: "Sync assignments, schedule, and degree progress across devices.",
    date: "Today",
    href: "/login",
  },
];

const GUEST_NOTIFICATIONS: HubNotification[] = [
  {
    id: "guest-sign-in",
    title: "Sign in to get started",
    body: "Sign in to import your degree checklist, sync assignments, and build your schedule.",
    date: "Today",
    type: "system",
    href: "/login",
  },
];

export function emptyHubFallback(): NonNullable<DashboardSummary["hub"]> {
  return {
    messageCount: 0,
    notificationCount: 0,
    messages: [],
    notifications: [],
    calendarDays: [],
  };
}

export function guestHubFallback(): NonNullable<DashboardSummary["hub"]> {
  const messages = GUEST_MESSAGES;
  const notifications = GUEST_NOTIFICATIONS;
  return {
    messageCount: messages.length,
    notificationCount: notifications.length,
    messages,
    notifications,
    calendarDays: [],
  };
}

export function hubFromSummary(summary: DashboardSummary): NonNullable<DashboardSummary["hub"]> {
  return summary.hub ?? emptyHubFallback();
}

/** Badge label for portal header counts; caps at 9+. */
export function capBadgeCount(count: number): string {
  if (count <= 0) return "";
  return count > 9 ? "9+" : String(count);
}

export function hubAnnouncementsFromSummary(
  summary: DashboardSummary,
): PortalAnnouncementItem[] | undefined {
  const notifications = summary.hub?.notifications;
  if (!notifications?.length) return undefined;

  return notifications.slice(0, 5).map((item) => ({
    id: item.id,
    title: item.title,
    body: item.body,
    date: item.date,
  }));
}

function mapNotificationType(
  type: HubNotification["type"],
): PortalPanelNotification["type"] {
  switch (type) {
    case "assignment":
      return "assignment";
    case "schedule":
      return "reminder";
    case "finance":
      return "announcement";
    case "system":
    default:
      return "system";
  }
}

export function hubMessagesForPanels(
  hub: NonNullable<DashboardSummary["hub"]>,
): PortalPanelMessage[] {
  return hub.messages.map((message) => ({
    title: message.title,
    preview: message.preview,
    date: message.date,
    href: message.href,
  }));
}

export function hubNotificationsForPanels(
  hub: NonNullable<DashboardSummary["hub"]>,
): PortalPanelNotification[] {
  return hub.notifications.map((notification) => ({
    type: mapNotificationType(notification.type),
    title: notification.title,
    body: notification.body,
    date: notification.date,
    href: notification.href,
  }));
}

export function hubCalendarForPanels(
  hub: NonNullable<DashboardSummary["hub"]>,
): PortalPanelCalendarDay[] {
  return hub.calendarDays.map((day) => ({
    date: day.date,
    events: day.events.map((event) => ({
      title: event.title,
      time: event.time,
      href: "/schedule",
    })),
  }));
}
