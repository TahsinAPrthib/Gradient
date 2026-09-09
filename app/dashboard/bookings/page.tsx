import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireStudent } from "@/lib/session";
import { SESSION_MODE_LABELS, formatSlotDateTime } from "@/lib/modes";
import { INDUSTRY_LABELS } from "@/lib/industries";
import { cancelBooking } from "@/lib/actions/bookings";
import { createReview } from "@/lib/actions/reviews";
import { pickMessage, type Message } from "@/lib/messages";
import { BOOKING_STATUS, STATUS_TONE_CLASSES } from "@/lib/statuses";

const MESSAGES: Record<string, Message> = {
  booked: { text: "Booked. See you there.", tone: "ok" },
  cancelled: { text: "Booking cancelled.", tone: "ok" },
  reviewed: { text: "Thanks — your review is published.", tone: "ok" },
  "cannot-cancel": { text: "That booking could not be cancelled.", tone: "bad" },
  "bad-rating": { text: "Please choose a rating from 1 to 5.", tone: "bad" },
  "comment-long": {
    text: "That comment is too long (500 characters max).",
    tone: "bad",
  },
  "already-reviewed": {
    text: "You've already reviewed that session.",
    tone: "bad",
  },
  "cannot-review": {
    text: "You can only review your own sessions, once they're completed.",
    tone: "bad",
  },
};

export default async function BookingsDashboardPage(
  props: PageProps<"/dashboard/bookings">,
) {
  const { studentId } = await requireStudent();
  const searchParams = await props.searchParams;
  const message = pickMessage(searchParams, MESSAGES);

  const now = new Date();

  // What we need per booking spans three tables: the booking, its slot, and
  // the alumnus behind the slot (whose name lives on User). Prisma expresses
  // that as nested `select`s, and it all becomes one SQL round trip.
  const select = {
    id: true,
    status: true,
    notes: true,
    // A completed booking either already has a review or is waiting for one —
    // this is what decides which of the two the past list renders.
    review: { select: { id: true, rating: true, comment: true } },
    slot: {
      select: {
        id: true,
        date: true,
        durationMin: true,
        mode: true,
        alumni: {
          select: {
            id: true,
            company: true,
            jobTitle: true,
            industry: true,
            user: { select: { name: true } },
          },
        },
      },
    },
  } as const;

  const [upcoming, past] = await Promise.all([
    // Upcoming = the session hasn't happened yet and it's still live.
    // A cancelled booking drops out of this list and into the one below.
    prisma.booking.findMany({
      where: {
        studentId,
        status: { not: "CANCELLED" },
        slot: { date: { gte: now } },
      },
      orderBy: { slot: { date: "asc" } },
      select,
    }),
    prisma.booking.findMany({
      where: {
        studentId,
        OR: [{ status: "CANCELLED" }, { slot: { date: { lt: now } } }],
      },
      orderBy: { slot: { date: "desc" } },
      take: 20,
      select,
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          My bookings
        </h1>
        <div className="flex gap-4 text-sm font-medium">
          <Link href="/alumni" className="text-zinc-600 underline dark:text-zinc-400">
            Find alumni
          </Link>
          <Link
            href="/dashboard/profile"
            className="text-zinc-600 underline dark:text-zinc-400"
          >
            Edit profile
          </Link>
          <Link href="/" className="text-zinc-600 underline dark:text-zinc-400">
            Back home
          </Link>
        </div>
      </header>

      {message && (
        <p
          className={`mt-4 rounded-md px-3 py-2 text-sm ${
            message.tone === "ok"
              ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300"
              : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
          }`}
        >
          {message.text}
        </p>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Upcoming ({upcoming.length})
        </h2>

        {upcoming.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            No upcoming sessions.{" "}
            <Link href="/alumni" className="underline">
              Browse alumni
            </Link>{" "}
            to book one.
          </p>
        ) : (
          <ul className="space-y-3">
            {upcoming.map((booking) => (
              <li
                key={booking.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    {formatSlotDateTime(booking.slot.date)}
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">
                    with{" "}
                    <Link
                      href={`/alumni/${booking.slot.alumni.id}`}
                      className="underline"
                    >
                      {booking.slot.alumni.user.name}
                    </Link>{" "}
                    — {booking.slot.alumni.jobTitle} at{" "}
                    {booking.slot.alumni.company}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                    {booking.slot.durationMin} min ·{" "}
                    {SESSION_MODE_LABELS[booking.slot.mode]} ·{" "}
                    {INDUSTRY_LABELS[booking.slot.alumni.industry]}
                  </p>
                  <span
                    className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-medium ${
                      STATUS_TONE_CLASSES[BOOKING_STATUS[booking.status].tone]
                    }`}
                  >
                    {BOOKING_STATUS[booking.status].label}
                  </span>
                </div>

                <form action={cancelBooking}>
                  <input type="hidden" name="bookingId" value={booking.id} />
                  <input
                    type="hidden"
                    name="returnTo"
                    value="/dashboard/bookings"
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    Cancel
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Past and cancelled ({past.length})
        </h2>

        {past.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            Nothing here yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {past.map((booking) => {
              // The review form appears only where it could actually succeed:
              // a completed session that hasn't been reviewed yet. This mirrors
              // what createReview() enforces in its WHERE clause — the server
              // is still the authority, this just avoids offering a dead form.
              const canReview =
                booking.status === "COMPLETED" && !booking.review;

              return (
                <li
                  key={booking.id}
                  className={`rounded-lg border border-zinc-200 p-4 dark:border-zinc-800 ${
                    canReview || booking.review ? "" : "opacity-70"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-zinc-50">
                        {formatSlotDateTime(booking.slot.date)}
                      </p>
                      <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">
                        with {booking.slot.alumni.user.name} —{" "}
                        {booking.slot.alumni.company}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                        STATUS_TONE_CLASSES[BOOKING_STATUS[booking.status].tone]
                      }`}
                    >
                      {BOOKING_STATUS[booking.status].label}
                    </span>
                  </div>

                  {booking.review && (
                    <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                      <p className="text-xs text-zinc-500">Your review</p>
                      <p
                        className="mt-1 text-sm"
                        aria-label={`You rated this ${booking.review.rating} out of 5`}
                      >
                        <span aria-hidden="true" className="text-zinc-900 dark:text-zinc-100">
                          {"★".repeat(booking.review.rating)}
                        </span>
                        <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
                          {"☆".repeat(5 - booking.review.rating)}
                        </span>
                      </p>
                      {booking.review.comment && (
                        <p className="mt-1 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                          {booking.review.comment}
                        </p>
                      )}
                    </div>
                  )}

                  {canReview && (
                    <form
                      action={createReview}
                      className="mt-3 grid gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800"
                    >
                      {/* Only the booking id is sent. Who is reviewing comes
                          from the session inside the action. */}
                      <input
                        type="hidden"
                        name="bookingId"
                        value={booking.id}
                      />

                      <div className="flex flex-wrap items-end gap-3">
                        <div>
                          <label
                            className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                            htmlFor={`rating-${booking.id}`}
                          >
                            Rating
                          </label>
                          <select
                            id={`rating-${booking.id}`}
                            name="rating"
                            defaultValue="5"
                            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-400"
                          >
                            {[5, 4, 3, 2, 1].map((value) => (
                              <option key={value} value={value}>
                                {"★".repeat(value)} ({value})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="min-w-[12rem] flex-1">
                          <label
                            className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                            htmlFor={`comment-${booking.id}`}
                          >
                            Comment{" "}
                            <span className="font-normal text-zinc-500">
                              (optional)
                            </span>
                          </label>
                          <input
                            id={`comment-${booking.id}`}
                            name="comment"
                            maxLength={500}
                            placeholder="How did the session go?"
                            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-400"
                          />
                        </div>

                        <button
                          type="submit"
                          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                        >
                          Leave review
                        </button>
                      </div>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
