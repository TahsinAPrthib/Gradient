"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";

const MAX_COMMENT = 500;

/**
 * Leaves a review on one of the caller's own completed bookings.
 *
 * All three rules live in the WHERE clause rather than in `if` statements:
 *
 *   id            — which booking
 *   status        — it must already be COMPLETED
 *   student.user  — the caller must be the student who booked it
 *
 * Prisma allows non-unique filters alongside the unique `id` in `update()`
 * (the "extended where unique" behaviour), so this is a single atomic guarded
 * write: the nested `review.create` only happens if all three match. If any
 * one fails, no row matches and Prisma raises P2025 — there is no window in
 * which a booking could be un-completed or handed to another student between
 * a check and the insert.
 *
 * The "only once" rule is enforced by the schema rather than by a lookup here:
 * `Review.bookingId` is `@unique`, which makes Booking -> Review a one-to-one.
 * A second attempt is rejected without any check-then-write of our own — see
 * the catch below for the two error codes that represent it.
 */
export async function createReview(formData: FormData) {
  // Identity from the session. The form says which booking, never who.
  const session = await requireSession();

  const bookingId = String(formData.get("bookingId") ?? "");
  const rating = Number(formData.get("rating"));
  const comment = String(formData.get("comment") ?? "").trim();

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    redirect("/dashboard/bookings?error=bad-rating");
  }

  if (comment.length > MAX_COMMENT) {
    redirect("/dashboard/bookings?error=comment-long");
  }

  // Decide the outcome inside the try and redirect after it — redirect() works
  // by throwing, so calling it in here would be caught by our own catch.
  let outcome: "created" | "not-allowed" | "already-reviewed" = "created";
  let alumniId: string | null = null;

  try {
    const booking = await prisma.booking.update({
      where: {
        id: bookingId,
        status: "COMPLETED",
        student: { user: { id: session.user.id } },
      },
      data: {
        review: { create: { rating, comment: comment || null } },
      },
      // Read the alumnus back so we know whose public page to revalidate.
      select: { slot: { select: { alumniId: true } } },
    });

    alumniId = booking.slot.alumniId;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // P2025: no booking matched — wrong owner, not completed, or no such id.
      // Deliberately one message for all three, so this can't be used to probe
      // which booking ids exist.
      if (error.code === "P2025") {
        outcome = "not-allowed";
      } else if (error.code === "P2014" || error.code === "P2002") {
        // Two different ways "already reviewed" can surface, and both happen:
        //
        //   P2014 — Prisma sees that a second Review would break the one-to-one
        //           relation with Booking and refuses before touching the
        //           database. This is the code you actually get in practice.
        //   P2002 — the unique index on Review.bookingId fires. This is the
        //           backstop for a genuine race, where two submissions get past
        //           the relation check at the same moment.
        outcome = "already-reviewed";
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }

  if (outcome === "not-allowed") {
    redirect("/dashboard/bookings?error=cannot-review");
  }

  if (outcome === "already-reviewed") {
    redirect("/dashboard/bookings?error=already-reviewed");
  }

  // The rating changes the alumnus's average, which is shown in two places.
  revalidatePath("/dashboard/bookings");
  revalidatePath("/alumni");
  if (alumniId) {
    revalidatePath(`/alumni/${alumniId}`);
  }

  redirect("/dashboard/bookings?reviewed=1");
}
