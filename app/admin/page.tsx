import Link from "next/link";
import { Role } from "@/app/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { INDUSTRY_LABELS } from "@/lib/industries";
import { BOOKING_STATUS, REFERRAL_STATUS } from "@/lib/statuses";
import { setAlumniVerification } from "@/lib/actions/admin";
import { pickMessage, type Message } from "@/lib/messages";

const MESSAGES: Record<string, Message> = {
  verified: { text: "Alumnus verified.", tone: "ok" },
  rejected: { text: "Alumnus rejected and removed from the queue.", tone: "ok" },
  "bad-decision": { text: "Unknown decision.", tone: "bad" },
  "not-found": { text: "That profile no longer exists.", tone: "bad" },
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Reads the role from the database, not the token. Everyone else — including
  // a logged-out visitor — is bounced to "/" before a single query runs.
  await requireAdmin();

  const message = pickMessage(await searchParams, MESSAGES);

  const [pending, reviewed, usersByRole, bookingsByStatus, referralsByStatus] =
    await Promise.all([
      // "Pending" is defined by the timestamp, not by `verified`, so a rejected
      // profile leaves the queue instead of sitting here unverified forever.
      prisma.alumniProfile.findMany({
        where: { verificationReviewedAt: null },
        orderBy: { user: { createdAt: "asc" } },
        select: {
          id: true,
          company: true,
          jobTitle: true,
          gradYear: true,
          industry: true,
          user: { select: { name: true, email: true } },
        },
      }),

      // Kept deliberately: an admin who mis-clicks Reject needs a way back.
      prisma.alumniProfile.findMany({
        where: { verificationReviewedAt: { not: null } },
        orderBy: { verificationReviewedAt: "desc" },
        take: 10,
        select: {
          id: true,
          company: true,
          verified: true,
          user: { select: { name: true } },
        },
      }),

      // groupBy works here where it didn't for ratings: these are all scalar
      // columns on the model itself, not fields reached through a relation.
      prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
      prisma.booking.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.referralRequest.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

  // groupBy only returns rows that exist, so a status nobody has yet would
  // simply be missing. Folding the counts into the full enum list means every
  // bucket is shown, including the zeroes — which is usually the interesting
  // part of a stats panel.
  const userCounts = countsFor(
    Object.keys(Role),
    usersByRole.map((row) => [row.role, row._count._all]),
  );
  const bookingCounts = countsFor(
    Object.keys(BOOKING_STATUS),
    bookingsByStatus.map((row) => [row.status, row._count._all]),
  );
  const referralCounts = countsFor(
    Object.keys(REFERRAL_STATUS),
    referralsByStatus.map((row) => [row.status, row._count._all]),
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Admin
        </h1>
        <div className="flex gap-4 text-sm font-medium">
          <Link href="/alumni" className="text-zinc-600 underline dark:text-zinc-400">
            Directory
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
          Pending alumni ({pending.length})
        </h2>

        {pending.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            Nothing waiting for review.
          </p>
        ) : (
          <ul className="space-y-3">
            {pending.map((alumnus) => (
              <li
                key={alumnus.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    {alumnus.user.name}
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">
                    {alumnus.jobTitle} at {alumnus.company}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                    Class of {alumnus.gradYear} ·{" "}
                    {INDUSTRY_LABELS[alumnus.industry]} · {alumnus.user.email}
                  </p>
                </div>

                <div className="flex gap-2">
                  <DecisionButton id={alumnus.id} decision="verify" primary>
                    Verify
                  </DecisionButton>
                  <DecisionButton id={alumnus.id} decision="reject">
                    Reject
                  </DecisionButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {reviewed.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
            Recently reviewed
          </h2>
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {reviewed.map((alumnus) => (
              <li
                key={alumnus.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <span className="text-sm text-zinc-800 dark:text-zinc-200">
                  {alumnus.user.name}{" "}
                  <span className="text-zinc-500">· {alumnus.company}</span>
                </span>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      alumnus.verified
                        ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                        : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                    }`}
                  >
                    {alumnus.verified ? "Verified" : "Rejected"}
                  </span>
                  {/* The opposite action, so a mis-click is recoverable. */}
                  <DecisionButton
                    id={alumnus.id}
                    decision={alumnus.verified ? "reject" : "verify"}
                  >
                    {alumnus.verified ? "Revoke" : "Verify"}
                  </DecisionButton>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Stats
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard title="Users by role" counts={userCounts} />
          <StatCard title="Bookings by status" counts={bookingCounts} />
          <StatCard title="Referrals by status" counts={referralCounts} />
        </div>
      </section>
    </div>
  );
}

/** Merges groupBy results into the full list of enum values, defaulting to 0. */
function countsFor(
  allKeys: string[],
  rows: [string, number][],
): [string, number][] {
  const found = new Map(rows);
  return allKeys.map((key) => [key, found.get(key) ?? 0]);
}

function StatCard({
  title,
  counts,
}: {
  title: string;
  counts: [string, number][];
}) {
  const total = counts.reduce((sum, [, n]) => sum + n, 0);

  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {title}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
        {total}
      </p>
      <dl className="mt-3 space-y-1">
        {counts.map(([key, n]) => (
          <div key={key} className="flex justify-between gap-3 text-xs">
            <dt className="text-zinc-600 dark:text-zinc-400">{key}</dt>
            <dd className="tabular-nums text-zinc-900 dark:text-zinc-100">{n}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function DecisionButton({
  id,
  decision,
  primary,
  children,
}: {
  id: string;
  decision: "verify" | "reject";
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <form action={setAlumniVerification}>
      {/* Which profile, and which way. Who is deciding comes from the session
          inside the action, where the ADMIN role is re-read from the database. */}
      <input type="hidden" name="alumniId" value={id} />
      <input type="hidden" name="decision" value={decision} />
      <button
        type="submit"
        className={
          primary
            ? "rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            : "rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        }
      >
        {children}
      </button>
    </form>
  );
}
