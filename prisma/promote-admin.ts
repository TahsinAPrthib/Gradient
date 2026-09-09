/**
 * Promotes an existing account to ADMIN.
 *
 *   npx tsx prisma/promote-admin.ts someone@example.com
 *   npm run promote-admin -- someone@example.com
 *
 * This is deliberately a command-line script rather than anything reachable
 * over HTTP. There is no route, form, or API that can grant ADMIN:
 * /api/register accepts only STUDENT and ALUMNI, and no server action writes
 * the role. So the only way to create the first admin is to have shell access
 * to the project and the database credentials — which is the point.
 *
 * It promotes; it never creates. An email with no account is an error, not an
 * invitation to make one, so a typo can't quietly mint a brand-new admin.
 */
// MUST come before ../lib/db. Next.js loads .env for you when the app runs,
// but a standalone script gets no such help — and lib/db.ts reads
// process.env.DATABASE_URL at module-evaluation time. Imports are evaluated in
// order, so putting this first is what makes the connection string exist by
// the time the Prisma client is constructed.
import "dotenv/config";
import { prisma } from "../lib/db";

async function main() {
  // Register lowercases every address before storing it, so match that here or
  // "Sam@x.com" would look like it has no account.
  const email = process.argv[2]?.trim().toLowerCase();

  if (!email) {
    console.error("Usage: npx tsx prisma/promote-admin.ts <email>");
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true },
  });

  if (!user) {
    console.error(`No account found for ${email}.`);
    console.error("Sign the account up through the app first, then re-run this.");
    process.exitCode = 1;
    return;
  }

  if (user.role === "ADMIN") {
    console.log(`${user.name} <${user.email}> is already an ADMIN. Nothing to do.`);
    return;
  }

  const previousRole = user.role;

  await prisma.user.update({
    where: { id: user.id },
    data: { role: "ADMIN" },
  });

  console.log(`Promoted ${user.name} <${user.email}>: ${previousRole} -> ADMIN`);
  console.log("They can now open /admin. Their existing profile row is untouched.");
}

main()
  .catch((error) => {
    console.error("Failed to promote:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    // A short-lived script should hand its connection back rather than waiting
    // for the process to be torn down.
    await prisma.$disconnect();
  });
