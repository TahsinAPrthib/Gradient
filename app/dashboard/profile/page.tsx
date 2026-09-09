import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { INDUSTRY_LABELS, INDUSTRY_VALUES } from "@/lib/industries";
import { tagsToInput } from "@/lib/tags";
import {
  updateAlumniProfile,
  updateStudentProfile,
} from "@/lib/actions/profile";
import { pickMessage, type Message } from "@/lib/messages";

const MESSAGES: Record<string, Message> = {
  saved: { text: "Profile saved.", tone: "ok" },
  "bad-name": { text: "Please enter your full name.", tone: "bad" },
  "bad-field": { text: "Please enter your field of study.", tone: "bad" },
  "bad-current-year": {
    text: "Current year must be a number from 1 to 8.",
    tone: "bad",
  },
  "bad-grad-year": { text: "Please enter a valid graduation year.", tone: "bad" },
  "bad-interests": {
    text: "At most 10 interests, each 40 characters or fewer.",
    tone: "bad",
  },
  "bad-industry": { text: "Please choose an industry from the list.", tone: "bad" },
  "bad-company": { text: "Please enter your company.", tone: "bad" },
  "bad-job-title": { text: "Please enter your job title.", tone: "bad" },
  "bio-long": { text: "That bio is too long (1000 characters max).", tone: "bad" },
  "bad-tags": {
    text: "At most 10 areas of expertise, each 40 characters or fewer.",
    tone: "bad",
  },
  "not-student": { text: "You don't have a student profile.", tone: "bad" },
  "not-alumni": { text: "You don't have an alumni profile.", tone: "bad" },
};

// The sibling dashboards use the generated `PageProps<"/route">` helper, but
// that type only exists for routes Next.js has already written into
// .next/types/routes.d.ts — so a brand-new route fails to typecheck until
// typegen catches up. This is the explicit form the Next.js docs show first,
// and it means the file typechecks on a fresh clone with no .next directory.
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireSession();
  const resolvedSearchParams = await searchParams;
  const message = pickMessage(resolvedSearchParams, MESSAGES);

  // Which form to show is decided by which profile row actually exists, not by
  // session.user.role. The role in the JWT was copied in at login and is never
  // re-checked; the profile row is the real answer, read fresh every request.
  const [user, studentProfile, alumniProfile] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      // No passwordHash — `select` keeps it from ever being loaded.
      select: { name: true, email: true, role: true },
    }),
    prisma.studentProfile.findUnique({
      where: { userId: session.user.id },
      select: { field: true, currentYear: true, gradYear: true, interests: true },
    }),
    prisma.alumniProfile.findUnique({
      where: { userId: session.user.id },
      select: {
        gradYear: true,
        industry: true,
        company: true,
        jobTitle: true,
        bio: true,
        expertiseTags: true,
        verified: true,
      },
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Edit profile
        </h1>
        <Link href="/" className="text-sm font-medium text-zinc-600 underline dark:text-zinc-400">
          Back home
        </Link>
      </header>

      {message && (
        <p
          className={`mt-4 rounded-md px-3 py-2 text-sm ${
            message.tone === "ok"
              ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300"
              : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
          }`}
        >
          {message.text}
        </p>
      )}

      {/* Email and role are shown for reference but never rendered as inputs,
          and the actions don't read them from the form either. */}
      <dl className="mt-6 grid gap-4 rounded-lg border border-zinc-200 p-5 sm:grid-cols-2 dark:border-zinc-800">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Email
          </dt>
          <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
            {user?.email}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Role
          </dt>
          <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
            {user?.role}
            {alumniProfile?.verified ? " · Verified" : ""}
          </dd>
        </div>
        <p className="text-xs text-zinc-500 sm:col-span-2">
          Email and role can&apos;t be changed here.
        </p>
      </dl>

      {studentProfile && (
        <form action={updateStudentProfile} className="mt-6 grid gap-4">
          <Field label="Full name" id="name">
            <input
              id="name"
              name="name"
              required
              defaultValue={user?.name ?? ""}
              className={inputClass}
            />
          </Field>

          <Field label="Field of study" id="field">
            <input
              id="field"
              name="field"
              required
              defaultValue={studentProfile.field}
              className={inputClass}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Current year" id="currentYear">
              <input
                id="currentYear"
                name="currentYear"
                type="number"
                min={1}
                max={8}
                required
                defaultValue={studentProfile.currentYear}
                className={inputClass}
              />
            </Field>

            <Field label="Graduation year" id="gradYear">
              <input
                id="gradYear"
                name="gradYear"
                type="number"
                required
                defaultValue={studentProfile.gradYear}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Interests" id="interests" optional>
            <input
              id="interests"
              name="interests"
              placeholder="Machine Learning, Product, Startups"
              defaultValue={tagsToInput(studentProfile.interests)}
              className={inputClass}
            />
            <Hint>Separate with commas. Up to 10.</Hint>
          </Field>

          <SaveButton />
        </form>
      )}

      {alumniProfile && (
        <form action={updateAlumniProfile} className="mt-6 grid gap-4">
          <Field label="Full name" id="name">
            <input
              id="name"
              name="name"
              required
              defaultValue={user?.name ?? ""}
              className={inputClass}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Graduation year" id="gradYear">
              <input
                id="gradYear"
                name="gradYear"
                type="number"
                required
                defaultValue={alumniProfile.gradYear}
                className={inputClass}
              />
            </Field>

            <Field label="Industry" id="industry">
              {/* Values are the enum members, labels are the readable names —
                  the same pairing the signup form and directory filter use. */}
              <select
                id="industry"
                name="industry"
                defaultValue={alumniProfile.industry}
                className={inputClass}
              >
                {INDUSTRY_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {INDUSTRY_LABELS[value]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company" id="company">
              <input
                id="company"
                name="company"
                required
                defaultValue={alumniProfile.company}
                className={inputClass}
              />
            </Field>

            <Field label="Job title" id="jobTitle">
              <input
                id="jobTitle"
                name="jobTitle"
                required
                defaultValue={alumniProfile.jobTitle}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Bio" id="bio" optional>
            <textarea
              id="bio"
              name="bio"
              rows={4}
              maxLength={1000}
              placeholder="A couple of sentences about your work and what you can help with."
              defaultValue={alumniProfile.bio ?? ""}
              className={inputClass}
            />
          </Field>

          <Field label="Areas of expertise" id="expertiseTags" optional>
            <input
              id="expertiseTags"
              name="expertiseTags"
              placeholder="Backend, System Design, Career Growth"
              defaultValue={tagsToInput(alumniProfile.expertiseTags)}
              className={inputClass}
            />
            <Hint>
              Separate with commas. Students filter the directory by these.
            </Hint>
          </Field>

          <SaveButton />
        </form>
      )}

      {!studentProfile && !alumniProfile && (
        <p className="mt-6 rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          Your account has no student or alumni profile attached, so there is
          nothing to edit.
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  id,
  optional,
  children,
}: {
  label: string;
  id: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        htmlFor={id}
      >
        {label}
        {optional && (
          <span className="font-normal text-zinc-500"> (optional)</span>
        )}
      </label>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-zinc-500">{children}</p>;
}

function SaveButton() {
  return (
    <div>
      <button
        type="submit"
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Save changes
      </button>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-400";
