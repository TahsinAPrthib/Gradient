import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "./auth";
import { prisma } from "./db";

/**
 * Reads the session on the server and sends anonymous visitors to /login.
 *
 * `redirect()` works by throwing a special error that Next.js catches, so any
 * code after it never runs — which is exactly what you want for a guard. Its
 * return type is `never`, so after this function TypeScript knows the session
 * is non-null and you can use `session.user` without optional chaining.
 *
 * Put this on the first line of any page that requires a logged-in user.
 */
export async function requireSession() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  return session;
}

/**
 * Requires a logged-in student and returns their **StudentProfile id**.
 *
 * Why this exists: `session.user.id` is a *User* id, but Booking.studentId
 * points at StudentProfile. These are different ids, and mixing them up is an
 * easy bug, so every place that needs one looks it up here.
 *
 * The lookup also doubles as the role check — if there's no StudentProfile for
 * this user, they aren't a student, whatever the JWT claims. That matters
 * because the role in the token was copied in at login and is not re-verified,
 * whereas this reads the database every time.
 */
export async function requireStudent() {
  const session = await requireSession();

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!profile) {
    redirect("/");
  }

  return { session, studentId: profile.id };
}

/**
 * Requires an ADMIN, and checks the role **against the database** rather than
 * the session token.
 *
 * This distinction matters more here than anywhere else in the app. The role
 * on `session.user` was copied into the JWT at login and is never re-checked,
 * so if an account were demoted from ADMIN its existing token would keep
 * claiming ADMIN until it expired — trusting it would leave a window where a
 * former admin still had admin powers. Reading the User row every request
 * closes that window: revoking admin takes effect on the next request.
 *
 * Non-admins are sent to the home page rather than shown a 403, so /admin
 * doesn't advertise its own existence.
 */
export async function requireAdmin() {
  const session = await requireSession();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true },
  });

  if (!user || user.role !== "ADMIN") {
    redirect("/");
  }

  return { session, userId: user.id };
}

/** Same as requireStudent, but for alumni — returns the AlumniProfile id. */
export async function requireAlumni() {
  const session = await requireSession();

  const profile = await prisma.alumniProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!profile) {
    redirect("/");
  }

  return { session, alumniId: profile.id };
}
