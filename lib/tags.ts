// Shared rules for the two comma-separated list fields in the app:
// StudentProfile.interests and AlumniProfile.expertiseTags. They live here so
// signup and profile editing can't drift apart — a tag typed at signup and the
// same tag typed on the profile page must normalise identically, or the
// directory's `has` filter would stop matching.

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 40;

/**
 * Turns "Backend, Career Growth , backend" into ["Backend", "Career Growth"].
 *
 * Splits on commas, trims each piece, drops blanks (so trailing commas and
 * double commas are harmless), then removes duplicates via a Set.
 */
export function parseTags(value: unknown): string[] {
  if (typeof value !== "string") return [];

  const tags = value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  return [...new Set(tags)];
}

/**
 * Returns an error message, or null when the list is acceptable.
 * `noun` is the plural wording for the message, e.g. "areas of expertise".
 */
export function validateTags(tags: string[], noun: string): string | null {
  if (tags.length > MAX_TAGS) {
    return `Please list at most ${MAX_TAGS} ${noun}.`;
  }

  if (tags.some((tag) => tag.length > MAX_TAG_LENGTH)) {
    return `Each entry must be ${MAX_TAG_LENGTH} characters or fewer.`;
  }

  return null;
}

/** Renders a stored list back into the text the user typed. */
export function tagsToInput(tags: string[] | null | undefined): string {
  return (tags ?? []).join(", ");
}
