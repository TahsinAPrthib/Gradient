import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { INDUSTRY_LABELS } from "@/lib/industries";
import { SESSION_MODE_LABELS, formatSlotDateTime } from "@/lib/modes";
import { BOOKING_STATUS, STATUS_TONE_CLASSES } from "@/lib/statuses";
import LogoutButton from "./logout-button";
import Wordmark from "./wordmark";

// A server component, and deliberately NOT guarded by requireSession — this is
// the public front door. getServerSession returns null for anonymous visitors,
// which is what selects the marketing view below.
export default async function Home() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return <LandingView />;
  }

  return <DashboardView userId={session.user.id} name={session.user.name} />;
}

/* ------------------------------------------------------------------ */
/* Logged out                                                          */
/* ------------------------------------------------------------------ */

async function LandingView() {
  // A small public preview of real alumni. Only the four fields shown on the
  // card are selected — no email, no bio, no ids — so this page can't leak
  // more than it displays. If nobody has signed up yet the section is skipped
  // entirely rather than rendering empty placeholders.
  const previewAlumni = await prisma.alumniProfile.findMany({
    take: 3,
    orderBy: { user: { createdAt: "desc" } },
    select: {
      id: true,
      jobTitle: true,
      company: true,
      industry: true,
      user: { select: { name: true } },
    },
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-20">
      <h1 className="text-5xl leading-tight sm:text-6xl">
        <Wordmark />
      </h1>

      <p className="mt-5 max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
        The people who studied where you study now work where you want to work.
        Gradient connects current university students with alumni who have
        already made the jump.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/signup"
          className="rounded-md bg-zinc-900 px-5 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Sign up
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-zinc-300 px-5 py-2.5 text-center text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Log in
        </Link>
      </div>

      {/* The three things the product actually does, in the order a student
          would do them. Numbered rather than iconed — no decoration that
          would compete with the wordmark. */}
      <ol className="mt-16 grid gap-8 sm:grid-cols-3">
        {[
          {
            title: "Find a mentor",
            body: "Search alumni by industry, graduation year, expertise or company.",
          },
          {
            title: "Book a session",
            body: "Pick an open slot on their calendar — video call, chat or in person.",
          },
          {
            title: "Ask for a referral",
            body: "Request a referral for a specific role and track where it stands.",
          },
        ].map((step, index) => (
          <li key={step.title}>
            <span className="text-xs font-medium tabular-nums text-zinc-400 dark:text-zinc-600">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h2 className="mt-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
              {step.title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              {step.body}
            </p>
          </li>
        ))}
      </ol>

      {previewAlumni.length > 0 && (
        <section className="mt-16 border-t border-zinc-200 pt-10 dark:border-zinc-800">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Alumni on Gradient
          </h2>

          <ul className="mt-4 grid gap-4 sm:grid-cols-3">
            {previewAlumni.map((person) => (
              // Not links: /alumni/[id] requires a session, so a card that
              // bounced straight to /login would feel broken. Signing up is
              // the call to action instead.
              <li
                key={person.id}
                className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  {person.user.name}
                </p>
                <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">
                  {person.jobTitle} at {person.company}
                </p>
                <p className="mt-2 text-xs text-zinc-500">
                  {INDUSTRY_LABELS[person.industry]}
                </p>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            <Link href="/signup" className="font-medium underline">
              Create an account
            </Link>{" "}
            to see the full directory.
          </p>
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Logged in                                                           */
/* ------------------------------------------------------------------ */

async function DashboardView({
  userId,
  name,
}: {
  userId: string;
  name?: string | null;
}) {
  const now = new Date();

  // Which overview to show is decided by which profile row exists, not by
  // session.user.role — the same rule the dashboards and profile page follow,
  // because the role in the JWT was copied in at login and never re-verified.
  const [studentProfile, alumniProfile] = await Promise.all([
    prisma.studentProfile.findUnique({
      where: { userId },
      select: { id: true },
    }),
    prisma.alumniProfile.findUnique({
      where: { userId },
      select: { id: true },
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Welcome back to <Wordmark />
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {name}
          </h1>
        </div>
        <LogoutButton />
      </header>

      {studentProfile && (
        <StudentOverview studentId={studentProfile.id} now={now} />
      )}
      {alumniProfile && (
        <AlumniOverview alumniId={alumniProfile.id} now={now} />
      )}

      {!studentProfile && !alumniProfile && (
        <p className="mt-10 rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          Your account has no student or alumni profile attached yet.
        </p>
      )}
    </div>
  );
}

async function StudentOverview({
  studentId,
  now,
}: {
  studentId: string;
  now: Date;
}) {
  // Three independent reads, so they run together rather than in sequence.
  const [sessions, referrals, referralCount] = await Promise.all([
    prisma.booking.findMany({
      where: {
        studentId,
        status: { not: "CANCELLED" },
        slot: { date: { gte: now } },
      },
      orderBy: { slot: { date: "asc" } },
      take: 3,
      select: {
        id: true,
        status: true,
        slot: {
          select: {
            date: true,
            durationMin: true,
            mode: true,
            alumni: {
              select: { id: true, company: true, user: { select: { name: true } } },
            },
          },
        },
      },
    }),
    prisma.referralRequest.findMany({
      where: { studentId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        id: true,
        targetRole: true,
        targetCompany: true,
        alumni: { select: { user: { select: { name: true } } } },
      },
    }),
    prisma.referralRequest.count({ where: { studentId, status: "PENDING" } }),
  ]);

  return (
    <>
      <Panel
        title="Upcoming sessions"
        href="/dashboard/bookings"
        linkLabel="All bookings"
      >
        {sessions.length === 0 ? (
          <Empty>
            Nothing booked.{" "}
            <Link href="/alumni" className="underline">
              Find a mentor
            </Link>{" "}
            to get started.
          </Empty>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {sessions.map((booking) => (
              <li
                key={booking.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {formatSlotDateTime(booking.slot.date)}
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                    {booking.slot.alumni.user.name} ·{" "}
                    {booking.slot.alumni.company} · {booking.slot.durationMin}{" "}
                    min · {SESSION_MODE_LABELS[booking.slot.mode]}
                  </p>
                </div>
                <StatusPill status={booking.status} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title={`Pending referral requests${referralCount ? ` (${referralCount})` : ""}`}
        href="/dashboard/referrals"
        linkLabel="All referrals"
      >
        {referrals.length === 0 ? (
          <Empty>No requests waiting on a reply.</Empty>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {referrals.map((request) => (
              <li key={request.id} className="py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {request.targetRole} at {request.targetCompany}
                </p>
                <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                  asked {request.alumni.user.name}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Actions
        links={[
          { href: "/alumni", label: "Browse alumni", primary: true },
          { href: "/dashboard/bookings", label: "My bookings" },
          { href: "/dashboard/referrals", label: "My referrals" },
          { href: "/dashboard/profile", label: "Edit profile" },
        ]}
      />
    </>
  );
}

async function AlumniOverview({
  alumniId,
  now,
}: {
  alumniId: string;
  now: Date;
}) {
  const [sessions, referrals, referralCount, openSlots] = await Promise.all([
    // Upcoming slots that someone actually holds. `booking: { status: ... }`
    // filters on the related row, so free slots and slots whose booking was
    // cancelled don't appear here.
    prisma.availabilitySlot.findMany({
      where: {
        alumniId,
        date: { gte: now },
        booking: { status: { not: "CANCELLED" } },
      },
      orderBy: { date: "asc" },
      take: 3,
      select: {
        id: true,
        date: true,
        durationMin: true,
        mode: true,
        booking: {
          select: {
            status: true,
            student: { select: { user: { select: { name: true } } } },
          },
        },
      },
    }),
    prisma.referralRequest.findMany({
      where: { alumniId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        id: true,
        targetRole: true,
        targetCompany: true,
        student: { select: { user: { select: { name: true } } } },
      },
    }),
    prisma.referralRequest.count({ where: { alumniId, status: "PENDING" } }),
    prisma.availabilitySlot.count({
      where: { alumniId, date: { gte: now }, isBooked: false },
    }),
  ]);

  return (
    <>
      <Panel
        title="Upcoming sessions"
        href="/dashboard/slots"
        linkLabel="My availability"
      >
        {sessions.length === 0 ? (
          <Empty>
            {openSlots > 0
              ? `No one has booked yet. You have ${openSlots} open ${openSlots === 1 ? "slot" : "slots"}.`
              : "No booked sessions, and no open slots — add some availability."}
          </Empty>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {sessions.map((slot) => (
              <li
                key={slot.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {formatSlotDateTime(slot.date)}
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                    {slot.booking?.student.user.name} · {slot.durationMin} min ·{" "}
                    {SESSION_MODE_LABELS[slot.mode]}
                  </p>
                </div>
                {slot.booking && <StatusPill status={slot.booking.status} />}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title={`Referral requests to answer${referralCount ? ` (${referralCount})` : ""}`}
        href="/dashboard/referrals"
        linkLabel="All referrals"
      >
        {referrals.length === 0 ? (
          <Empty>Nothing waiting on you.</Empty>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {referrals.map((request) => (
              <li key={request.id} className="py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {request.targetRole} at {request.targetCompany}
                </p>
                <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                  from {request.student.user.name}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Actions
        links={[
          { href: "/dashboard/slots", label: "My availability", primary: true },
          { href: "/dashboard/referrals", label: "Referral requests" },
          { href: "/alumni", label: "Browse alumni" },
          { href: "/dashboard/profile", label: "Edit profile" },
        ]}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

function Panel({
  title,
  href,
  linkLabel,
  children,
}: {
  title: string;
  href: string;
  linkLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          {title}
        </h2>
        <Link
          href={href}
          className="text-sm font-medium text-zinc-600 underline dark:text-zinc-400"
        >
          {linkLabel}
        </Link>
      </div>
      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        {children}
      </div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-2 text-center text-sm text-zinc-600 dark:text-zinc-400">
      {children}
    </p>
  );
}

function StatusPill({ status }: { status: keyof typeof BOOKING_STATUS }) {
  const meta = BOOKING_STATUS[status];
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

function Actions({
  links,
}: {
  links: { href: string; label: string; primary?: boolean }[];
}) {
  return (
    <div className="mt-10 flex flex-wrap gap-3">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={
            link.primary
              ? "rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              : "rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          }
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}
