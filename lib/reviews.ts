import { prisma } from "@/lib/db";

export type RatingSummary = { average: number; count: number };

/**
 * Average rating and review count for many alumni at once.
 *
 * Why not `groupBy`: a Review has no alumniId of its own. It reaches the
 * alumnus through Booking -> AvailabilitySlot -> alumniId, and Prisma's
 * `groupBy` can only group by scalar columns on the model itself, not by a
 * field two relations away. So we pull the ratings with their alumniId in one
 * query and total them in JS.
 *
 * The important part is that it is ONE query for the whole page rather than
 * one per card — passing every id in a single `in` filter is what avoids the
 * N+1 problem. It does load one row per review, which is fine at this scale;
 * if reviews ever run to thousands, this becomes a raw `GROUP BY` or a
 * denormalised average column on AlumniProfile.
 */
export async function ratingsByAlumni(
  alumniIds: string[],
): Promise<Map<string, RatingSummary>> {
  if (alumniIds.length === 0) {
    return new Map();
  }

  const rows = await prisma.review.findMany({
    where: { booking: { slot: { alumniId: { in: alumniIds } } } },
    select: {
      rating: true,
      booking: { select: { slot: { select: { alumniId: true } } } },
    },
  });

  const totals = new Map<string, { sum: number; count: number }>();

  for (const row of rows) {
    const id = row.booking.slot.alumniId;
    const running = totals.get(id) ?? { sum: 0, count: 0 };
    running.sum += row.rating;
    running.count += 1;
    totals.set(id, running);
  }

  return new Map(
    [...totals].map(([id, { sum, count }]) => [id, { average: sum / count, count }]),
  );
}

/**
 * Average and count for a single alumnus.
 *
 * Uses `aggregate` so the numbers cover every review, independently of how
 * many the page chooses to list.
 */
export async function ratingForAlumni(
  alumniId: string,
): Promise<RatingSummary> {
  const result = await prisma.review.aggregate({
    where: { booking: { slot: { alumniId } } },
    _avg: { rating: true },
    _count: { _all: true },
  });

  return {
    // _avg is null when there are no rows to average.
    average: result._avg.rating ?? 0,
    count: result._count._all,
  };
}
