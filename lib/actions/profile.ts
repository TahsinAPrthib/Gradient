"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { isIndustry } from "@/lib/industries";
import { parseTags, validateTags } from "@/lib/tags";

const THIS_YEAR = new Date().getFullYear();
const MAX_BIO = 1000;

// Note what is *not* here: no profileId, no userId, no role. The only thing
// identifying the person is the session, so there is no field a caller could
// tamper with to edit somebody else's profile. Email and role aren't read from
// the form either — they simply aren't editable.

function asTrimmedString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function asInt(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  const parsed = typeof raw === "string" ? Number(raw) : NaN;
  return Number.isInteger(parsed) ? parsed : null;
}

function badYear(year: number | null): boolean {
  return year === null || year < 1950 || year > THIS_YEAR + 10;
}

/** Updates the logged-in student's own profile. */
export async function updateStudentProfile(formData: FormData) {
  const session = await requireSession();

  const name = asTrimmedString(formData, "name");
  const field = asTrimmedString(formData, "field");
  const currentYear = asInt(formData, "currentYear");
  const gradYear = asInt(formData, "gradYear");
  const interests = parseTags(formData.get("interests"));

  if (name.length < 2) {
    redirect("/dashboard/profile?error=bad-name");
  }

  if (!field) {
    redirect("/dashboard/profile?error=bad-field");
  }

  if (currentYear === null || currentYear < 1 || currentYear > 8) {
    redirect("/dashboard/profile?error=bad-current-year");
  }

  if (badYear(gradYear)) {
    redirect("/dashboard/profile?error=bad-grad-year");
  }

  if (validateTags(interests, "interests")) {
    redirect("/dashboard/profile?error=bad-interests");
  }

  // Both writes together, so a failure can't leave the name changed but the
  // profile stale. The count from updateMany is returned out of the
  // transaction and acted on below, because redirect() throws and would
  // otherwise abort the transaction from inside.
  const updated = await prisma.$transaction(async (tx) => {
    // `where: { user: { id: ... } }` is the authorization. We never look the
    // profile up by an id from the form — the only row that can match is the
    // one belonging to the session user. A non-student hitting this action
    // matches zero rows and changes nothing.
    const result = await tx.studentProfile.updateMany({
      where: { user: { id: session.user.id } },
      data: { field, currentYear, gradYear: gradYear!, interests },
    });

    if (result.count === 0) {
      return 0;
    }

    // The name lives on User, and this is already scoped to the session id.
    await tx.user.update({
      where: { id: session.user.id },
      data: { name },
    });

    return result.count;
  });

  if (updated === 0) {
    redirect("/dashboard/profile?error=not-student");
  }

  revalidatePath("/dashboard/profile");
  redirect("/dashboard/profile?saved=1");
}

/** Updates the logged-in alumnus's own profile. */
export async function updateAlumniProfile(formData: FormData) {
  const session = await requireSession();

  const name = asTrimmedString(formData, "name");
  const gradYear = asInt(formData, "gradYear");
  const industry = formData.get("industry");
  const company = asTrimmedString(formData, "company");
  const jobTitle = asTrimmedString(formData, "jobTitle");
  const bio = asTrimmedString(formData, "bio");
  const expertiseTags = parseTags(formData.get("expertiseTags"));

  if (name.length < 2) {
    redirect("/dashboard/profile?error=bad-name");
  }

  if (badYear(gradYear)) {
    redirect("/dashboard/profile?error=bad-grad-year");
  }

  // Only the enum members are acceptable, exactly as at signup.
  if (!isIndustry(industry)) {
    redirect("/dashboard/profile?error=bad-industry");
  }

  if (!company) {
    redirect("/dashboard/profile?error=bad-company");
  }

  if (!jobTitle) {
    redirect("/dashboard/profile?error=bad-job-title");
  }

  if (bio.length > MAX_BIO) {
    redirect("/dashboard/profile?error=bio-long");
  }

  if (validateTags(expertiseTags, "areas of expertise")) {
    redirect("/dashboard/profile?error=bad-tags");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.alumniProfile.updateMany({
      where: { user: { id: session.user.id } },
      data: {
        gradYear: gradYear!,
        industry,
        company,
        jobTitle,
        // bio is String? in the schema, so an empty box means null, not "".
        bio: bio || null,
        expertiseTags,
      },
    });

    if (result.count === 0) {
      return 0;
    }

    await tx.user.update({
      where: { id: session.user.id },
      data: { name },
    });

    return result.count;
  });

  if (updated === 0) {
    redirect("/dashboard/profile?error=not-alumni");
  }

  // The directory and this alumnus's public page both show what just changed,
  // so their cached renders are stale. This lookup is only for building that
  // path — it plays no part in authorization, which the updateMany above
  // already settled. `verified` is deliberately not editable here.
  const profile = await prisma.alumniProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  revalidatePath("/dashboard/profile");
  revalidatePath("/alumni");
  if (profile) {
    revalidatePath(`/alumni/${profile.id}`);
  }

  redirect("/dashboard/profile?saved=1");
}
