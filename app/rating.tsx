import type { RatingSummary } from "@/lib/reviews";

/**
 * Compact rating display: ★★★★☆ 4.3 (7)
 *
 * Deliberately zinc rather than the usual amber stars. The gradient wordmark
 * is meant to be the only colour in the app, and a row of gold stars on every
 * directory card would out-shout it.
 *
 * The stars are marked aria-hidden and the real value is exposed as text on
 * the wrapper, so a screen reader announces "Rated 4.3 out of 5 from 7
 * reviews" instead of ten unlabelled star glyphs.
 */
export default function Rating({ average, count }: RatingSummary) {
  if (count === 0) {
    return (
      <span className="text-xs text-zinc-500">No reviews yet</span>
    );
  }

  // One decimal is enough precision for an average of at most a few dozen
  // integer ratings, and avoids "4.333333".
  const rounded = average.toFixed(1);

  return (
    <span
      className="inline-flex items-baseline gap-1.5 text-xs text-zinc-600 dark:text-zinc-400"
      aria-label={`Rated ${rounded} out of 5 from ${count} ${count === 1 ? "review" : "reviews"}`}
    >
      <Stars value={average} />
      <span className="font-medium text-zinc-900 dark:text-zinc-100">
        {rounded}
      </span>
      <span>
        ({count})
      </span>
    </span>
  );
}

/** Five glyphs, filled to the nearest whole star. */
function Stars({ value }: { value: number }) {
  const filled = Math.max(0, Math.min(5, Math.round(value)));

  return (
    <span aria-hidden="true" className="text-zinc-900 dark:text-zinc-100">
      {"★".repeat(filled)}
      <span className="text-zinc-300 dark:text-zinc-700">
        {"☆".repeat(5 - filled)}
      </span>
    </span>
  );
}
