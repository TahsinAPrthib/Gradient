import { hash } from "bcryptjs";
import type { Industry } from "@/app/generated/prisma/enums";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { isIndustry } from "@/lib/industries";
import { parseTags, validateTags } from "@/lib/tags";

// Everything arriving from the network is `unknown` until we check it. Typing
// the body this way stops us from accidentally trusting a value we never
// validated.
type RegisterBody = {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  role?: unknown;
  // Student-only fields
  field?: unknown;
  currentYear?: unknown;
  // Both roles have a graduation year
  gradYear?: unknown;
  // Alumni-only fields
  industry?: unknown;
  company?: unknown;
  jobTitle?: unknown;
  expertiseTags?: unknown;
};

const THIS_YEAR = new Date().getFullYear();

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// <input type="number"> values arrive as strings ("2027"), so accept both.
function asInt(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isInteger(parsed) ? parsed : null;
}

export async function POST(request: Request) {
  let body: RegisterBody;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  // Collect every problem instead of failing on the first one, so the form can
  // highlight all the bad fields at once.
  const fieldErrors: Record<string, string> = {};

  const name = asTrimmedString(body.name);
  if (name.length < 2) {
    fieldErrors.name = "Please enter your full name.";
  }

  // Store emails lowercased so "Sam@x.com" and "sam@x.com" can't both register.
  const email = asTrimmedString(body.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldErrors.email = "Please enter a valid email address.";
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 8) {
    fieldErrors.password = "Password must be at least 8 characters.";
  }

  // Only these two roles may be self-assigned. ADMIN exists in the schema but
  // must never be grantable by an anonymous signup request.
  const role = body.role;
  if (role !== "STUDENT" && role !== "ALUMNI") {
    fieldErrors.role = "Role must be either STUDENT or ALUMNI.";
  }

  const gradYear = asInt(body.gradYear);
  if (gradYear === null || gradYear < 1950 || gradYear > THIS_YEAR + 10) {
    fieldErrors.gradYear = `Graduation year must be between 1950 and ${THIS_YEAR + 10}.`;
  }

  // Validate only the fields that belong to the chosen role.
  let field = "";
  let currentYear: number | null = null;
  let industry: Industry | null = null;
  let company = "";
  let jobTitle = "";
  let expertiseTags: string[] = [];

  if (role === "STUDENT") {
    field = asTrimmedString(body.field);
    if (!field) fieldErrors.field = "Please enter your field of study.";

    currentYear = asInt(body.currentYear);
    if (currentYear === null || currentYear < 1 || currentYear > 8) {
      fieldErrors.currentYear = "Current year must be a number from 1 to 8.";
    }
  } else if (role === "ALUMNI") {
    // industry is an enum now, so the only valid values are the ones the
    // database knows about. Anything else is rejected rather than stored.
    if (isIndustry(body.industry)) {
      industry = body.industry;
    } else {
      fieldErrors.industry = "Please choose an industry from the list.";
    }

    company = asTrimmedString(body.company);
    if (!company) fieldErrors.company = "Please enter your company.";

    jobTitle = asTrimmedString(body.jobTitle);
    if (!jobTitle) fieldErrors.jobTitle = "Please enter your job title.";

    // Expertise tags are optional — an alumnus can add them later on
    // /dashboard/profile, which parses them with the same shared rules.
    expertiseTags = parseTags(body.expertiseTags);
    const tagError = validateTags(expertiseTags, "areas of expertise");
    if (tagError) fieldErrors.expertiseTags = tagError;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return Response.json(
      { error: "Please fix the highlighted fields.", fields: fieldErrors },
      { status: 400 },
    );
  }

  // Friendly duplicate check. This is a convenience, not the real guarantee —
  // the unique index on User.email is, and we still handle P2002 below in case
  // two people submit the same email at the same moment.
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    return Response.json(
      { error: "An account with that email already exists." },
      { status: 409 },
    );
  }

  // Never store the raw password. bcrypt hashes it with a random salt; 10 is
  // the cost factor (how slow the hash is, which is what makes it hard to
  // brute-force). This must match what lib/auth.ts compares against on login.
  const passwordHash = await hash(password, 10);

  // A *nested create*: Prisma inserts the User row and the matching profile row
  // in a single call, inside one transaction. If the profile insert fails, the
  // user insert is rolled back too — so you can never end up with a user who
  // has no profile. `gradYear!` is safe here because the validation above
  // already returned if it was null; TypeScript just can't follow that.
  const data: Prisma.UserCreateInput =
    role === "STUDENT"
      ? {
          name,
          email,
          passwordHash,
          role: "STUDENT",
          studentProfile: {
            // interests is passed explicitly so the column holds an empty
            // array. Omitting it leaves the column NULL, which then has to be
            // null-checked everywhere it's read.
            create: {
              field,
              currentYear: currentYear!,
              gradYear: gradYear!,
              interests: [],
            },
          },
        }
      : {
          name,
          email,
          passwordHash,
          role: "ALUMNI",
          alumniProfile: {
            // Same reasoning as interests above: pass expertiseTags explicitly
            // so the column is an empty array rather than NULL when the
            // alumnus leaves the field blank. `industry!` is safe because the
            // validation above already returned if it wasn't a valid value.
            create: {
              gradYear: gradYear!,
              industry: industry!,
              company,
              jobTitle,
              expertiseTags,
            },
          },
        };

  try {
    // `select` keeps passwordHash out of the response. Never send it back.
    const user = await prisma.user.create({
      data,
      select: { id: true, name: true, email: true, role: true },
    });

    return Response.json(user, { status: 201 });
  } catch (error) {
    // P2002 is Prisma's "unique constraint failed" code — here it means the
    // email was taken between our check above and this insert.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return Response.json(
        { error: "An account with that email already exists." },
        { status: 409 },
      );
    }

    console.error("POST /api/register failed:", error);
    return Response.json(
      { error: "Something went wrong creating your account." },
      { status: 500 },
    );
  }
}
