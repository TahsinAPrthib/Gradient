import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { REFERRAL_STATUS, STATUS_TONE_CLASSES } from "@/lib/statuses";
import { updateReferralStatus } from "@/lib/actions/referrals";
import { pickMessage, type Message } from "@/lib/messages";

const MESSAGES: Record<string, Message> = {
  sent: { text: "Referral request sent.", tone: "ok" },
  "cannot-update": {
    text: "That request could not be updated — it may have moved on already.",
    tone: "bad",
  },
  "bad-status": { text: "Unknown status.", tone: "bad" },
};

export default async function ReferralsDashboardPage(
  props: PageProps<"/dashboard/referrals">,
) {
  const session = await requireSession();
  const searchParams = await props.searchParams;

  // One route, two views. Rather than trusting session.user.role (copied into
  // the JWT at login), we look up which profile actually exists — the same
  // reasoning as requireStudent/requireAlumni in lib/session.ts.
  const [studentProfile, alumniProfile] = await Promise.all([
    prisma.studentProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    }),
    prisma.alumniProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    }),
  ]);

  const updated = searchParams.updated;
  const message =
    typeof updated === "string"
      ? { text: `Request marked ${updated}.`, tone: "ok" as const }
      : pickMessage(searchParams, MESSAGES);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Referral requests
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

      {alumniProfile && <IncomingRequests alumniId={alumniProfile.id} />}
      {studentProfile && <SentRequests studentId={studentProfile.id} />}
    </div>
  );
}

/** Alumni view: requests other people have sent to me, newest first. */
async function IncomingRequests({ alumniId }: { alumniId: string }) {
  const requests = await prisma.referralRequest.findMany({
    where: { alumniId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      targetCompany: true,
      targetRole: true,
      resumeLink: true,
      note: true,
      status: true,
      createdAt: true,
      student: {
        select: {
          field: true,
          currentYear: true,
          gradYear: true,
          user: { select: { name: true } },
        },
      },
    },
  });

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
        Incoming ({requests.length})
      </h2>

      {requests.length === 0 ? (
        <Empty>No one has asked you for a referral yet.</Empty>
      ) : (
        <ul className="space-y-3">
          {requests.map((request) => (
            <li
              key={request.id}
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    {request.targetRole} at {request.targetCompany}
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">
                    from {request.student.user.name} — {request.student.field},
                    year {request.student.currentYear}, class of{" "}
                    {request.student.gradYear}
                  </p>
                </div>
                <StatusBadge status={request.status} />
              </div>

              {request.note && (
                <p className="mt-3 rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                  {request.note}
                </p>
              )}

              {request.resumeLink && (
                <p className="mt-2 text-sm">
                  {/*
                    The URL was validated as http(s) when it was submitted.
                    noopener/noreferrer stops the opened page from reaching
                    back into this one via window.opener.
                  */}
                  <a
                    href={request.resumeLink}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-zinc-700 underline dark:text-zinc-300"
                  >
                    View resume
                  </a>
                </p>
              )}

              {/* Which buttons show follows the same transition table the
                  server enforces — the UI just mirrors it, it doesn't decide. */}
              <div className="mt-3 flex flex-wrap gap-2">
                {request.status === "PENDING" && (
                  <>
                    <StatusButton id={request.id} status="ACCEPTED">
                      Accept
                    </StatusButton>
                    <StatusButton id={request.id} status="DECLINED">
                      Decline
                    </StatusButton>
                  </>
                )}
                {request.status === "ACCEPTED" && (
                  <>
                    <StatusButton id={request.id} status="REFERRED">
                      Mark as referred
                    </StatusButton>
                    <StatusButton id={request.id} status="DECLINED">
                      Withdraw
                    </StatusButton>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Student view: requests I have sent, and where each one stands. */
async function SentRequests({ studentId }: { studentId: string }) {
  const requests = await prisma.referralRequest.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      targetCompany: true,
      targetRole: true,
      note: true,
      status: true,
      createdAt: true,
      alumni: {
        select: {
          id: true,
          company: true,
          jobTitle: true,
          user: { select: { name: true } },
        },
      },
    },
  });

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
        Sent ({requests.length})
      </h2>

      {requests.length === 0 ? (
        <Empty>
          You haven&apos;t asked for any referrals yet.{" "}
          <Link href="/alumni" className="underline">
            Find an alumnus
          </Link>{" "}
          to ask.
        </Empty>
      ) : (
        <ul className="space-y-3">
          {requests.map((request) => (
            <li
              key={request.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  {request.targetRole} at {request.targetCompany}
                </p>
                <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">
                  asked{" "}
                  <Link
                    href={`/alumni/${request.alumni.id}`}
                    className="underline"
                  >
                    {request.alumni.user.name}
                  </Link>{" "}
                  ({request.alumni.jobTitle} at {request.alumni.company})
                </p>
              </div>
              <StatusBadge status={request.status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatusButton({
  id,
  status,
  children,
}: {
  id: string;
  status: string;
  children: React.ReactNode;
}) {
  return (
    <form action={updateReferralStatus}>
      <input type="hidden" name="referralId" value={id} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        {children}
      </button>
    </form>
  );
}

function StatusBadge({ status }: { status: keyof typeof REFERRAL_STATUS }) {
  const meta = REFERRAL_STATUS[status];
  return (
    <span
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
        STATUS_TONE_CLASSES[meta.tone]
      }`}
    >
      {meta.label}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
      {children}
    </p>
  );
}
