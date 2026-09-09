import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { INDUSTRY_LABELS } from "@/lib/industries";
import { SESSION_MODE_LABELS, formatSlotDateTime } from "@/lib/modes";
import { bookSlot } from "@/lib/actions/bookings";
import { createReferralRequest } from "@/lib/actions/referrals";
import { pickMessage, type Message } from "@/lib/messages";
import { REFERRAL_STATUS, STATUS_TONE_CLASSES } from "@/lib/statuses";
import { ratingForAlumni } from "@/lib/reviews";
import Rating from "@/app/rating";

const MESSAGES: Record<string, Message> = {
  "bad-company": { text: "Please enter the target company.", tone: "bad" },
  "bad-role": { text: "Please enter the target role.", tone: "bad" },
  "note-long": { text: "That note is too long (500 characters max).", tone: "bad" },
  "bad-link": {
    text: "The resume link must be a full http:// or https:// URL.",
    tone: "bad",
  },
  "duplicate-referral": {
    text: "You already have a pending request to this alumnus for that role.",
    tone: "bad",
  },
  "slot-taken": {
    text: "Sorry — someone booked that slot moments before you did.",
    tone: "bad",
  },
  "slot-past": { text: "That slot has already passed.", tone: "bad" },
  "slot-missing": { text: "That slot no longer exists.", tone: "bad" },
};

// The folder name [id] makes this a dynamic route: /alumni/anything matches,
// and the matched part arrives as params.id. The id here is the AlumniProfile
// id (not the User id) — that's what the directory cards link to.
export default async function AlumniProfilePage(
  props: PageProps<"/alumni/[id]">,
) {
  const session = await requireSession();

  // Like searchParams, params is a Promise in this version and must be awaited.
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const message = pickMessage(searchParams, MESSAGES);

  // Only students can book. The Book buttons are hidden from anyone else, but
  // that's cosmetic — bookSlot() calls requireStudent() itself, so an alumnus
  // POSTing the action directly still gets turned away.
  const viewerIsStudent = session.user.role === "STUDENT";
  const now = new Date();

  const alumnus = await prisma.alumniProfile.findUnique({
    where: { id },
    select: {
      id: true,
      jobTitle: true,
      company: true,
      industry: true,
      gradYear: true,
      bio: true,
      expertiseTags: true,
      verified: true,
      // Only the name — the User row also holds passwordHash and email, and
      // `select` is what guarantees they are never even loaded.
      user: { select: { name: true } },

      // Open slots only: still in the future and not currently claimed.
      // Filtering in the query (rather than fetching all slots and filtering
      // in JSX) means past and booked slots never leave the database.
      slots: {
        where: { date: { gte: now }, isBooked: false },
        orderBy: { date: "asc" },
        select: { id: true, date: true, durationMin: true, mode: true },
      },
    },
  });

  // findUnique returns null for an id that doesn't exist. notFound() renders
  // the 404 page and stops here, so the code below can assume `alumnus` exists.
  if (!alumnus) {
    notFound();
  }

  // Only students can request referrals, so only they need this lookup. It
  // gives us the StudentProfile id (different from the User id) and lets us
  // show what this student has already asked this particular alumnus.
  const studentProfile = viewerIsStudent
    ? await prisma.studentProfile.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
      })
    : null;

  // The summary counts every review; the list below shows the newest few.
  // Keeping them separate means the average stays accurate no matter how many
  // reviews the page chooses to render.
  const [rating, reviews] = await Promise.all([
    ratingForAlumni(alumnus.id),
    prisma.review.findMany({
      where: { booking: { slot: { alumniId: alumnus.id } } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        // A Review has no author column — the reviewer is reached through the
        // booking it hangs off.
        booking: {
          select: { student: { select: { user: { select: { name: true } } } } },
        },
      },
    }),
  ]);

  const myRequests = studentProfile
    ? await prisma.referralRequest.findMany({
        where: { studentId: studentProfile.id, alumniId: alumnus.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          targetCompany: true,
          targetRole: true,
          status: true,
        },
      })
    : [];

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <Link
        href="/alumni"
        className="text-sm font-medium text-zinc-600 underline dark:text-zinc-400"
      >
        ← Back to directory
      </Link>

      <header className="mt-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {alumnus.user.name}
          </h1>
          <p className="mt-1 text-zinc-700 dark:text-zinc-300">
            {alumnus.jobTitle} at {alumnus.company}
          </p>
          <p className="mt-2">
            <Rating {...rating} />
          </p>
        </div>

        {alumnus.verified && (
          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800 dark:bg-green-950 dark:text-green-300">
            Verified alumnus
          </span>
        )}
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

      <dl className="mt-8 grid gap-4 rounded-lg border border-zinc-200 p-5 sm:grid-cols-3 dark:border-zinc-800">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Industry
          </dt>
          <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
            {INDUSTRY_LABELS[alumnus.industry]}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Company
          </dt>
          <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
            {alumnus.company}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Graduated
          </dt>
          <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
            {alumnus.gradYear}
          </dd>
        </div>
      </dl>

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          About
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
          {/* bio is optional in the schema (String?), so it can be null. */}
          {alumnus.bio ?? "This alumnus hasn't added a bio yet."}
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Available sessions
        </h2>

        {alumnus.slots.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            No open slots right now — check back later.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {alumnus.slots.map((slot) => (
              <li
                key={slot.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    {formatSlotDateTime(slot.date)}
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                    {slot.durationMin} min · {SESSION_MODE_LABELS[slot.mode]}
                  </p>
                </div>

                {viewerIsStudent ? (
                  // The only thing the client sends is which slot. Who is
                  // booking comes from the session inside the action.
                  <form action={bookSlot}>
                    <input type="hidden" name="slotId" value={slot.id} />
                    <button
                      type="submit"
                      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    >
                      Book
                    </button>
                  </form>
                ) : (
                  <span className="text-xs text-zinc-500">
                    Students can book this
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Expertise
        </h2>
        {alumnus.expertiseTags && alumnus.expertiseTags.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {alumnus.expertiseTags.map((tag) => (
              <li
                key={tag}
                className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                {tag}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            No expertise areas listed yet.
          </p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Reviews
          <Rating {...rating} />
        </h2>

        {reviews.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            No reviews yet. Students can review a session once it&apos;s been
            completed.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
            {reviews.map((review) => (
              <li key={review.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {review.booking.student.user.name}
                  </p>
                  <span
                    className="text-xs text-zinc-600 dark:text-zinc-400"
                    aria-label={`Rated ${review.rating} out of 5`}
                  >
                    <span aria-hidden="true" className="text-zinc-900 dark:text-zinc-100">
                      {"★".repeat(review.rating)}
                    </span>
                    <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
                      {"☆".repeat(5 - review.rating)}
                    </span>
                  </span>
                </div>

                {review.comment && (
                  <p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                    {review.comment}
                  </p>
                )}

                <p className="mt-1 text-xs text-zinc-500">
                  {review.createdAt.toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {viewerIsStudent && (
        <section className="mt-8">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Ask for a referral
          </h2>

          {myRequests.length > 0 && (
            <ul className="mt-3 space-y-2">
              {myRequests.map((request) => (
                <li
                  key={request.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
                >
                  <span className="text-zinc-700 dark:text-zinc-300">
                    {request.targetRole} at {request.targetCompany}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      STATUS_TONE_CLASSES[REFERRAL_STATUS[request.status].tone]
                    }`}
                  >
                    {REFERRAL_STATUS[request.status].label}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <form action={createReferralRequest} className="mt-3 grid gap-3">
            {/*
              alumniId identifies *who* is being asked. Everything about the
              asker comes from the session inside the action, so this field
              can't be used to impersonate another student.
            */}
            <input type="hidden" name="alumniId" value={alumnus.id} />

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="targetCompany">
                  Target company
                </label>
                <input
                  id="targetCompany"
                  name="targetCompany"
                  required
                  maxLength={100}
                  placeholder="Acme Inc."
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass} htmlFor="targetRole">
                  Target role
                </label>
                <input
                  id="targetRole"
                  name="targetRole"
                  required
                  maxLength={100}
                  placeholder="Backend Engineer Intern"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="resumeLink">
                Resume link{" "}
                <span className="font-normal text-zinc-500">(optional)</span>
              </label>
              <input
                id="resumeLink"
                name="resumeLink"
                type="url"
                maxLength={500}
                placeholder="https://drive.google.com/..."
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="note">
                Note{" "}
                <span className="font-normal text-zinc-500">(optional)</span>
              </label>
              <textarea
                id="note"
                name="note"
                rows={3}
                maxLength={500}
                placeholder="A sentence on why you're a fit."
                className={inputClass}
              />
            </div>

            <div>
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Send request
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-400";

const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";
