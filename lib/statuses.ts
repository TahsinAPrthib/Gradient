import type {
  BookingStatus,
  ReferralStatus,
} from "@/app/generated/prisma/enums";

// Same pattern as INDUSTRY_LABELS and SESSION_MODE_LABELS: the database stores
// SCREAMING_SNAKE, people read a sentence. `tone` drives the badge colour so a
// status looks the same everywhere it appears.
type StatusMeta = { label: string; tone: "neutral" | "good" | "bad" | "done" };

export const BOOKING_STATUS: Record<BookingStatus, StatusMeta> = {
  PENDING: { label: "Awaiting confirmation", tone: "neutral" },
  CONFIRMED: { label: "Confirmed", tone: "good" },
  CANCELLED: { label: "Cancelled", tone: "bad" },
  COMPLETED: { label: "Completed", tone: "done" },
};

export const REFERRAL_STATUS: Record<ReferralStatus, StatusMeta> = {
  PENDING: { label: "Pending", tone: "neutral" },
  ACCEPTED: { label: "Accepted", tone: "good" },
  DECLINED: { label: "Declined", tone: "bad" },
  REFERRED: { label: "Referred", tone: "done" },
};

export const STATUS_TONE_CLASSES: Record<StatusMeta["tone"], string> = {
  neutral: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  good: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  bad: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  done: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
};
