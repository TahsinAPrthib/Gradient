import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAlumni } from "@/lib/session";
import {
  SESSION_MODE_LABELS,
  SESSION_MODE_VALUES,
  formatSlotDateTime,
} from "@/lib/modes";
import { createSlot, deleteSlot } from "@/lib/actions/slots";
import {
  acceptBooking,
  cancelBooking,
  completeBooking,
} from "@/lib/actions/bookings";
import { pickMessage, type Message } from "@/lib/messages";
import { BOOKING_STATUS, STATUS_TONE_CLASSES } from "@/lib/statuses";

// Server actions report success or failure by redirecting back here with a
// query string, which keeps this page a plain server component — no client
// state, no useActionState, and the message survives a full page reload.
const MESSAGES: Record<string, Message> = {
  created: { text: "Slot added.", tone: "ok" },
  deleted: { text: "Slot deleted.", tone: "ok" },
  cancelled: { text: "Booking cancelled and the slot is open again.", tone: "ok" },
  accepted: { text: "Booking confirmed.", tone: "ok" },
  completed: { text: "Session marked as completed.", tone: "ok" },
  "cannot-accept": {
    text: "That booking could not be confirmed — it may have been cancelled.",
    tone: "bad",
  },
  "cannot-complete": {
    text: "Only a confirmed session that has already happened can be completed.",
    tone: "bad",
  },
  "bad-date": { text: "Please pick a valid date and time.", tone: "bad" },
  "past-date": { text: "That time is in the past.", tone: "bad" },
  "bad-duration": { text: "Please choose a valid duration.", tone: "bad" },
  "bad-mode": { text: "Please choose a valid session mode.", tone: "bad" },
  "cannot-delete": {
    text: "That slot could not be deleted — it may already be booked.",
    tone: "bad",
  },
  "cannot-cancel": { text: "That booking could not be cancelled.", tone: "bad" },
};

const DURATIONS = [15, 30, 45, 60, 90];

export default async function SlotsDashboardPage(
  props: PageProps<"/dashboard/slots">,
) {
  // Confirms the caller is an alumnus AND gives us the AlumniProfile id that
  // slots hang off. Non-alumni are redirected away.
  const { alumniId } = await requireAlumni();

  const searchParams = await props.searchParams;
  const message = pickMessage(searchParams, MESSAGES);

  const now = new Date();

  // Two queries rather than one filtered in JS, so the database does the
  // sorting: upcoming ascending (soonest first), past descending (latest first).
  const [upcoming, past] = await Promise.all([
    prisma.availabilitySlot.findMany({
      where: { alumniId, date: { gte: now } },
      orderBy: { date: "asc" },
      select: {
        id: true,
        date: true,
        durationMin: true,
        mode: true,
        isBooked: true,
        booking: {
          select: {
            id: true,
            status: true,
            notes: true,
            student: { select: { user: { select: { name: true } } } },
          },
        },
      },
    }),
    prisma.availabilitySlot.findMany({
      where: { alumniId, date: { lt: now } },
      orderBy: { date: "desc" },
      take: 20,
      select: {
        id: true,
        date: true,
        durationMin: true,
        mode: true,
        isBooked: true,
        booking: {
          select: {
            id: true,
            status: true,
            student: { select: { user: { select: { name: true } } } },
          },
        },
      },
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          My availability
        </h1>
        <div className="flex gap-4 text-sm font-medium">
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

      {message && <Banner text={message.text} tone={message.tone} />}

      {/*
        `action={createSlot}` posts straight to the server function — no
        onSubmit, no fetch, and it still works with JavaScript disabled.
      */}
      <form
        action={createSlot}
        className="mt-6 grid gap-3 rounded-lg border border-zinc-200 p-4 sm:grid-cols-3 dark:border-zinc-800"
      >
        <div className="sm:col-span-3">
          <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Add a slot
          </h2>
        </div>

        <div>
          <label className={labelClass} htmlFor="date">
            Date and time
          </label>
          <input
            id="date"
            name="date"
            type="datetime-local"
            required
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="durationMin">
            Duration
          </label>
          <select
            id="durationMin"
            name="durationMin"
            defaultValue={30}
            className={inputClass}
          >
            {DURATIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} minutes
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="mode">
            Mode
          </label>
          <select id="mode" name="mode" defaultValue="VIDEO_CALL" className={inputClass}>
            {SESSION_MODE_VALUES.map((value) => (
              <option key={value} value={value}>
                {SESSION_MODE_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-3">
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Add slot
          </button>
        </div>
      </form>

      <Section title={`Upcoming (${upcoming.length})`}>
        {upcoming.length === 0 ? (
          <Empty>No upcoming slots. Add one above.</Empty>
        ) : (
          <ul className="space-y-3">
            {upcoming.map((slot) => {
              // A cancelled booking leaves its row behind, so "is this slot
              // actually taken" means: there is a booking and it isn't cancelled.
              const activeBooking =
                slot.booking && slot.booking.status !== "CANCELLED"
                  ? slot.booking
                  : null;

              return (
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
                    {activeBooking && (
                      <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                        Booked by {activeBooking.student.user.name}
                        {activeBooking.notes ? ` — “${activeBooking.notes}”` : ""}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {activeBooking ? (
                      <>
                        <StatusBadge status={activeBooking.status} />

                        {/* A pending request is accepted or declined; an
                            already-confirmed one can only be cancelled.
                            Declining and cancelling are the same write, so
                            only the wording changes. */}
                        {activeBooking.status === "PENDING" && (
                          <form action={acceptBooking}>
                            <input
                              type="hidden"
                              name="bookingId"
                              value={activeBooking.id}
                            />
                            <SecondaryButton>Accept</SecondaryButton>
                          </form>
                        )}

                        <form action={cancelBooking}>
                          <input
                            type="hidden"
                            name="bookingId"
                            value={activeBooking.id}
                          />
                          <input
                            type="hidden"
                            name="returnTo"
                            value="/dashboard/slots"
                          />
                          <SecondaryButton>
                            {activeBooking.status === "PENDING"
                              ? "Decline"
                              : "Cancel booking"}
                          </SecondaryButton>
                        </form>
                      </>
                    ) : (
                      <>
                        <Badge tone="open">Open</Badge>
                        {/* Only unbooked slots get a delete button — and the
                            action re-checks that server-side anyway. */}
                        <form action={deleteSlot}>
                          <input type="hidden" name="slotId" value={slot.id} />
                          <SecondaryButton>Delete</SecondaryButton>
                        </form>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={`Past (${past.length})`}>
        {past.length === 0 ? (
          <Empty>Nothing in the past yet.</Empty>
        ) : (
          <ul className="space-y-3">
            {past.map((slot) => {
              const activeBooking =
                slot.booking && slot.booking.status !== "CANCELLED"
                  ? slot.booking
                  : null;

              return (
                <li
                  key={slot.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 p-4 opacity-70 dark:border-zinc-800"
                >
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-zinc-50">
                      {formatSlotDateTime(slot.date)}
                    </p>
                    <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                      {slot.durationMin} min · {SESSION_MODE_LABELS[slot.mode]}
                      {activeBooking
                        ? ` · with ${activeBooking.student.user.name}`
                        : " · nobody booked"}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {slot.booking && <StatusBadge status={slot.booking.status} />}

                    {/* Only a confirmed session that has already happened can
                        be completed — the action enforces both conditions in
                        its WHERE clause, this just hides a button that would
                        always fail. */}
                    {activeBooking?.status === "CONFIRMED" && (
                      <form action={completeBooking}>
                        <input
                          type="hidden"
                          name="bookingId"
                          value={activeBooking.id}
                        />
                        <SecondaryButton>Mark completed</SecondaryButton>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
      {children}
    </p>
  );
}

/** Renders a booking's real lifecycle status with its shared label and colour. */
function StatusBadge({ status }: { status: keyof typeof BOOKING_STATUS }) {
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

function Badge({
  tone,
  children,
}: {
  tone: "open" | "booked" | "cancelled";
  children: React.ReactNode;
}) {
  const tones = {
    open: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    booked: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  };
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

function SecondaryButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
    >
      {children}
    </button>
  );
}

function Banner({ text, tone }: { text: string; tone: "ok" | "bad" }) {
  return (
    <p
      className={`mt-4 rounded-md px-3 py-2 text-sm ${
        tone === "ok"
          ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300"
          : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
      }`}
    >
      {text}
    </p>
  );
}

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-400";

const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";
