"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { requireSession, requireStudent } from "@/lib/session";

/**
 * Books an open slot for the logged-in student.
 *
 * ## How the race is handled
 *
 * Two students can press Book on the same slot in the same instant. The wrong
 * fix is "read the slot, see isBooked === false, then write" — between the read
 * and the write the other request can slip in, and both succeed.
 *
 * Instead the database decides. `Booking.slotId` is `@unique`, so Postgres
 * physically cannot hold two booking rows for one slot. Both requests attempt
 * the insert; exactly one commits and the loser comes back as Prisma error
 * P2002 (unique constraint violated), which we translate into a friendly
 * "someone just booked this" message. There is no window to lose, because the
 * uniqueness check and the write are the same atomic operation.
 *
 * `isBooked` on the slot is therefore a *cache* for display and filtering, not
 * the source of truth. The unique index is the source of truth.
 */
export async function bookSlot(formData: FormData) {
  const { studentId } = await requireStudent();
  const slotId = String(formData.get("slotId") ?? "");

  // Reading the slot first is fine here: this checks facts that don't race
  // (does it exist, is it in the past). The contended fact — "is it already
  // taken" — is left entirely to the unique index below.
  const slot = await prisma.availabilitySlot.findUnique({
    where: { id: slotId },
    select: { id: true, date: true, alumniId: true },
  });

  if (!slot) {
    redirect("/alumni?error=slot-missing");
  }

  if (slot.date.getTime() <= Date.now()) {
    redirect(`/alumni/${slot.alumniId}?error=slot-past`);
  }

  // Decide the outcome inside the try, then redirect *after* it. redirect()
  // works by throwing, so calling it inside a try block would have our own
  // catch swallow the redirect instead of navigating.
  let outcome: "booked" | "taken";

  try {
    // Both writes in one transaction: if the slot update fails, the booking is
    // rolled back too, so isBooked can never disagree with reality.
    await prisma.$transaction(async (tx) => {
      await tx.booking.create({ data: { slotId: slot.id, studentId } });
      await tx.availabilitySlot.update({
        where: { id: slot.id },
        data: { isBooked: true },
      });
    });

    outcome = "booked";
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // A booking row already exists for this slot. Because slotId is unique,
      // that row is either live (someone beat us to it) or a leftover from a
      // cancellation — and a cancelled slot is supposed to be bookable again.
      //
      // updateMany with `status: "CANCELLED"` in the WHERE is the atomic way
      // to claim it: the row flips to PENDING only if it is *still* cancelled
      // at write time, so two students reviving the same slot cannot both win.
      const revived = await prisma.booking.updateMany({
        where: { slotId: slot.id, status: "CANCELLED" },
        data: { studentId, status: "PENDING", createdAt: new Date() },
      });

      if (revived.count === 1) {
        await prisma.availabilitySlot.update({
          where: { id: slot.id },
          data: { isBooked: true },
        });
        outcome = "booked";
      } else {
        outcome = "taken";
      }
    } else {
      throw error;
    }
  }

  revalidatePath(`/alumni/${slot.alumniId}`);
  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard/slots");

  if (outcome === "taken") {
    redirect(`/alumni/${slot.alumniId}?error=slot-taken`);
  }

  redirect("/dashboard/bookings?booked=1");
}

/**
 * Alumni accepts a pending booking: PENDING -> CONFIRMED.
 *
 * Note what the WHERE clause carries: the booking id, the *required current
 * status*, and proof that the caller owns the slot. Putting the source status
 * in the query rather than in an `if` means the transition is atomic — two
 * clicks in quick succession can't both "accept", and a booking the student
 * cancelled a moment ago can't be accepted out from under them.
 */
export async function acceptBooking(formData: FormData) {
  const session = await requireSession();
  const bookingId = String(formData.get("bookingId") ?? "");

  const accepted = await prisma.booking.updateMany({
    where: {
      id: bookingId,
      status: "PENDING",
      slot: { alumni: { user: { id: session.user.id } } },
    },
    data: { status: "CONFIRMED" },
  });

  if (accepted.count === 0) {
    redirect("/dashboard/slots?error=cannot-accept");
  }

  revalidatePath("/dashboard/slots");
  revalidatePath("/dashboard/bookings");
  redirect("/dashboard/slots?accepted=1");
}

/**
 * Marks a finished session COMPLETED: CONFIRMED -> COMPLETED.
 *
 * `slot: { date: { lt: new Date() } }` is the "it already happened" rule, and
 * it lives in the query for the same reason as the status check — a session
 * that hasn't started yet can't be marked complete, no matter what gets POSTed.
 */
export async function completeBooking(formData: FormData) {
  const session = await requireSession();
  const bookingId = String(formData.get("bookingId") ?? "");

  const completed = await prisma.booking.updateMany({
    where: {
      id: bookingId,
      status: "CONFIRMED",
      slot: {
        date: { lt: new Date() },
        alumni: { user: { id: session.user.id } },
      },
    },
    data: { status: "COMPLETED" },
  });

  if (completed.count === 0) {
    redirect("/dashboard/slots?error=cannot-complete");
  }

  revalidatePath("/dashboard/slots");
  revalidatePath("/dashboard/bookings");
  redirect("/dashboard/slots?completed=1");
}

/**
 * Cancels a booking. Either side may do it: the student who booked, or the
 * alumnus whose slot it is. This is also what "decline" does — an alumnus
 * declining a pending request and cancelling a confirmed one are the same
 * operation (status CANCELLED, slot freed), so the UI just changes the label
 * rather than duplicating the logic here.
 */
export async function cancelBooking(formData: FormData) {
  const session = await requireSession();
  const bookingId = String(formData.get("bookingId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/dashboard/bookings");

  // Only these two paths are valid redirect targets. Without this check a
  // caller could POST returnTo=https://evil.example and we would bounce the
  // user there — an open redirect.
  const destination =
    returnTo === "/dashboard/slots" ? "/dashboard/slots" : "/dashboard/bookings";

  // Authorization is expressed as part of the write, not as a prior read:
  // the OR clause means the row only matches if the caller is the student who
  // booked it or the alumnus who owns the slot. `status: { not: "CANCELLED" }`
  // makes a double-cancel a no-op rather than an error, and makes this safe to
  // run twice concurrently.
  const cancelled = await prisma.booking.updateMany({
    where: {
      id: bookingId,
      status: { not: "CANCELLED" },
      OR: [
        { student: { user: { id: session.user.id } } },
        { slot: { alumni: { user: { id: session.user.id } } } },
      ],
    },
    data: { status: "CANCELLED" },
  });

  if (cancelled.count === 0) {
    redirect(`${destination}?error=cannot-cancel`);
  }

  // Free the slot so it can be booked again. Matching through the `booking`
  // relation means we never have to trust a slotId supplied by the caller.
  await prisma.availabilitySlot.updateMany({
    where: { booking: { id: bookingId } },
    data: { isBooked: false },
  });

  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard/slots");
  redirect(`${destination}?cancelled=1`);
}
