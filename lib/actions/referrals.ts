"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ReferralStatus } from "@/app/generated/prisma/enums";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { requireSession, requireStudent } from "@/lib/session";

const MAX_COMPANY = 100;
const MAX_ROLE = 100;
const MAX_NOTE = 500;
const MAX_LINK = 500;

/** Sends a referral request from the logged-in student to one alumnus. */
export async function createReferralRequest(formData: FormData) {
  // studentId comes from the session. The form only says *who* to ask.
  const { studentId } = await requireStudent();

  const alumniId = String(formData.get("alumniId") ?? "");
  const targetCompany = String(formData.get("targetCompany") ?? "").trim();
  const targetRole = String(formData.get("targetRole") ?? "").trim();
  const resumeLinkRaw = String(formData.get("resumeLink") ?? "").trim();
  const noteRaw = String(formData.get("note") ?? "").trim();

  const back = `/alumni/${alumniId}`;

  if (!targetCompany || targetCompany.length > MAX_COMPANY) {
    redirect(`${back}?error=bad-company`);
  }

  if (!targetRole || targetRole.length > MAX_ROLE) {
    redirect(`${back}?error=bad-role`);
  }

  if (noteRaw.length > MAX_NOTE) {
    redirect(`${back}?error=note-long`);
  }

  // A resume link is optional, but if given it must be a real http(s) URL.
  // Rejecting other schemes matters: a "javascript:" value would otherwise be
  // rendered as a link for the alumnus to click.
  let resumeLink: string | null = null;

  if (resumeLinkRaw) {
    let parsed: URL | null = null;
    try {
      parsed = new URL(resumeLinkRaw);
    } catch {
      parsed = null;
    }

    if (
      !parsed ||
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      resumeLinkRaw.length > MAX_LINK
    ) {
      redirect(`${back}?error=bad-link`);
    }

    resumeLink = resumeLinkRaw;
  }

  // Friendly duplicate check. The real guarantee is the partial unique index
  // from migration 20260909011946 (studentId, alumniId, lower(company),
  // lower(role)) WHERE status = 'PENDING' — this read just lets us show a
  // clear message instead of a constraint error in the common case.
  const duplicate = await prisma.referralRequest.findFirst({
    where: {
      studentId,
      alumniId,
      status: "PENDING",
      targetCompany: { equals: targetCompany, mode: "insensitive" },
      targetRole: { equals: targetRole, mode: "insensitive" },
    },
    select: { id: true },
  });

  if (duplicate) {
    redirect(`${back}?error=duplicate-referral`);
  }

  let created = true;

  try {
    await prisma.referralRequest.create({
      data: { studentId, alumniId, targetCompany, targetRole, resumeLink, note: noteRaw || null },
    });
  } catch (error) {
    // P2002 = the unique index fired, meaning an identical pending request was
    // inserted between our check above and this write. Same user-visible
    // outcome as the check, just arrived at by the database.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      created = false;
    } else if (
      // P2003 = foreign key violation, i.e. that alumniId doesn't exist.
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      redirect("/alumni?error=alumni-missing");
    } else {
      throw error;
    }
  }

  revalidatePath(back);
  revalidatePath("/dashboard/referrals");

  if (!created) {
    redirect(`${back}?error=duplicate-referral`);
  }

  redirect("/dashboard/referrals?sent=1");
}

// Which statuses a request may move *from* for each requested target. Encoding
// it this way means an out-of-order transition (e.g. REFERRED straight from
// PENDING, without ever accepting) simply matches no rows.
const ALLOWED_TRANSITIONS: Record<string, ReferralStatus[]> = {
  ACCEPTED: ["PENDING"],
  DECLINED: ["PENDING", "ACCEPTED"],
  REFERRED: ["ACCEPTED"],
};

/**
 * Alumni moves one of their incoming requests to ACCEPTED, DECLINED or
 * REFERRED.
 */
export async function updateReferralStatus(formData: FormData) {
  const session = await requireSession();

  const referralId = String(formData.get("referralId") ?? "");
  const target = String(formData.get("status") ?? "");

  // Never trust a status straight from the form — only these three are
  // reachable, and PENDING is deliberately not among them.
  const allowedFrom = ALLOWED_TRANSITIONS[target];

  if (!allowedFrom) {
    redirect("/dashboard/referrals?error=bad-status");
  }

  // Ownership (the alumnus this request was sent to) and the legal source
  // statuses both live in the WHERE, so the whole transition is one atomic
  // conditional update.
  const updated = await prisma.referralRequest.updateMany({
    where: {
      id: referralId,
      status: { in: allowedFrom },
      alumni: { user: { id: session.user.id } },
    },
    data: { status: target as ReferralStatus },
  });

  if (updated.count === 0) {
    redirect("/dashboard/referrals?error=cannot-update");
  }

  revalidatePath("/dashboard/referrals");
  redirect(`/dashboard/referrals?updated=${target.toLowerCase()}`);
}
