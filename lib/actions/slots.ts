"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAlumni } from "@/lib/session";
import { isSessionMode } from "@/lib/modes";

// A Server Action is a real POST endpoint that anyone can call directly — the
// Next.js docs are explicit that "render-time gating is not a security
// boundary". So each action below re-checks who the caller is and what they
// own, rather than trusting that the page only rendered the button for the
// right person.

const ALLOWED_DURATIONS = [15, 30, 45, 60, 90];

/** Creates an availability slot owned by the logged-in alumnus. */
export async function createSlot(formData: FormData) {
  // Identity comes from the session, never from the form. A caller cannot
  // create slots on someone else's calendar because alumniId isn't an input.
  const { alumniId } = await requireAlumni();

  const dateValue = String(formData.get("date") ?? "");
  const durationValue = Number(formData.get("durationMin"));
  const modeValue = formData.get("mode");

  // <input type="datetime-local"> gives "2026-09-20T14:30". new Date() parses
  // that as local time; an empty or malformed value produces an Invalid Date,
  // which is why we test getTime() rather than trusting the parse.
  const date = new Date(dateValue);

  if (!dateValue || Number.isNaN(date.getTime())) {
    redirect("/dashboard/slots?error=bad-date");
  }

  if (date.getTime() <= Date.now()) {
    redirect("/dashboard/slots?error=past-date");
  }

  if (!ALLOWED_DURATIONS.includes(durationValue)) {
    redirect("/dashboard/slots?error=bad-duration");
  }

  if (!isSessionMode(modeValue)) {
    redirect("/dashboard/slots?error=bad-mode");
  }

  await prisma.availabilitySlot.create({
    data: { alumniId, date, durationMin: durationValue, mode: modeValue },
  });

  // Tells Next.js the cached render of this page is stale, so the new slot
  // shows up immediately. Without it the list could render from cache.
  revalidatePath("/dashboard/slots");
  redirect("/dashboard/slots?created=1");
}

/** Deletes one of the caller's own slots, but only if nobody has booked it. */
export async function deleteSlot(formData: FormData) {
  const { alumniId } = await requireAlumni();
  const slotId = String(formData.get("slotId") ?? "");

  // deleteMany, not delete — because the WHERE clause is doing three jobs at
  // once: find the slot, prove the caller owns it (alumniId), and prove it is
  // still free (isBooked: false). A plain delete({ where: { id } }) would need
  // a separate ownership read first, and that gap is where bugs live.
  //
  // If any condition fails, count is 0 and nothing was deleted — so a caller
  // POSTing someone else's slot id simply gets an error, not a deletion.
  const result = await prisma.availabilitySlot.deleteMany({
    where: { id: slotId, alumniId, isBooked: false },
  });

  if (result.count === 0) {
    redirect("/dashboard/slots?error=cannot-delete");
  }

  revalidatePath("/dashboard/slots");
  redirect("/dashboard/slots?deleted=1");
}
