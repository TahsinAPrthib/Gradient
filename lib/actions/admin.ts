"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

/**
 * Records an admin's verification decision on one alumni profile.
 *
 * A note on the authorization pattern. Everywhere else in this app the guard
 * goes *inside* the query — "update the row that belongs to me" — because the
 * caller may only touch their own data. That shape doesn't apply here: an
 * admin may act on any alumnus, so there is no ownership relation to filter
 * on. The authorization is role-based instead, and requireAdmin() supplies it
 * by reading the User row from the database rather than trusting the JWT.
 *
 * What does stay in the query is `updateMany`: a bogus or stale alumniId
 * matches zero rows and reports a friendly message, instead of throwing.
 */
export async function setAlumniVerification(formData: FormData) {
  // Identity and role both come from the session + database. Nothing about
  // *who is acting* is read from the form.
  await requireAdmin();

  const alumniId = String(formData.get("alumniId") ?? "");
  const decision = String(formData.get("decision") ?? "");

  if (decision !== "verify" && decision !== "reject") {
    redirect("/admin?error=bad-decision");
  }

  const verified = decision === "verify";

  const result = await prisma.alumniProfile.updateMany({
    where: { id: alumniId },
    data: {
      verified,
      // Stamping this on *both* outcomes is what moves the profile out of the
      // pending queue. Without it a rejected alumnus would reappear in the
      // list forever, since "pending" means verified === false.
      verificationReviewedAt: new Date(),
    },
  });

  if (result.count === 0) {
    redirect("/admin?error=not-found");
  }

  // The badge and the "verified only" filter both read this.
  revalidatePath("/admin");
  revalidatePath("/alumni");
  revalidatePath(`/alumni/${alumniId}`);

  redirect(`/admin?${verified ? "verified" : "rejected"}=1`);
}
