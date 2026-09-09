import type { SessionMode } from "@/app/generated/prisma/enums";

/**
 * Human-readable labels for the SessionMode enum, same idea as
 * INDUSTRY_LABELS in lib/industries.ts: the database stores VIDEO_CALL, people
 * should read "Video call".
 *
 * `Record<SessionMode, string>` means adding a mode to schema.prisma without a
 * label here is a build error rather than a blank dropdown entry.
 */
export const SESSION_MODE_LABELS: Record<SessionMode, string> = {
  VIDEO_CALL: "Video call",
  CHAT: "Chat",
  IN_PERSON: "In person",
};

export const SESSION_MODE_VALUES = Object.keys(
  SESSION_MODE_LABELS,
) as SessionMode[];

export function isSessionMode(value: unknown): value is SessionMode {
  return typeof value === "string" && value in SESSION_MODE_LABELS;
}

/**
 * One consistent way to print a slot's date and time.
 *
 * The locale is pinned to "en-GB" rather than left to the runtime default so
 * the string is deterministic. Note this renders in the *server's* timezone —
 * fine for a single-campus app, but something to revisit if you ever have
 * users in other timezones.
 */
export function formatSlotDateTime(date: Date): string {
  return date.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
