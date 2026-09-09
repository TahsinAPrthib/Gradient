import type { Industry } from "@/app/generated/prisma/enums";

/**
 * Human-readable label for each Industry enum value.
 *
 * The enum stores SCREAMING_SNAKE values (matching Role, BookingStatus, etc.),
 * which is right for the database but wrong for a dropdown, so every place that
 * shows an industry to a person reads its label from here.
 *
 * Note the `import type` above: it disappears at build time, so importing this
 * file from a client component pulls in no Prisma code at all — just this
 * object. But it still type-checks, and because the type is
 * `Record<Industry, string>`, adding a value to the enum in schema.prisma
 * without adding a label here becomes a build error rather than a blank option.
 */
export const INDUSTRY_LABELS: Record<Industry, string> = {
  SOFTWARE: "Software",
  FINANCE: "Finance",
  HEALTHCARE: "Healthcare",
  EDUCATION: "Education",
  CONSULTING: "Consulting",
  GOVERNMENT: "Government",
  MEDIA: "Media",
  MANUFACTURING: "Manufacturing",
  NONPROFIT: "Nonprofit",
  OTHER: "Other",
};

// Object.keys preserves declaration order, so dropdowns list them in the same
// order they appear in the schema.
export const INDUSTRY_VALUES = Object.keys(INDUSTRY_LABELS) as Industry[];

/**
 * Type guard for values arriving from a request body or a URL. Returning
 * `value is Industry` is what lets TypeScript treat the value as an Industry
 * after the check, instead of a plain string.
 */
export function isIndustry(value: unknown): value is Industry {
  return typeof value === "string" && value in INDUSTRY_LABELS;
}
