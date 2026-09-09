import Link from "next/link";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { INDUSTRY_LABELS, INDUSTRY_VALUES, isIndustry } from "@/lib/industries";
import { ratingsByAlumni } from "@/lib/reviews";
import Rating from "@/app/rating";

// A server component: it runs on the server, so it can talk to the database
// directly. There is no API route and no fetch() here — the query result is
// rendered to HTML before it ever reaches the browser.
//
// Filters live in the URL (?industry=Software&q=acme). That means the filter
// form can be a plain HTML <form method="get"> with no JavaScript at all: the
// browser puts the values in the URL, Next.js re-renders this component, and we
// read them back out of searchParams. It also makes filtered views shareable
// and bookmarkable.
export default async function AlumniDirectoryPage(
  props: PageProps<"/alumni">,
) {
  // Redirects to /login if nobody is signed in. Must come before any query.
  await requireSession();

  // In this version of Next.js searchParams is a Promise and must be awaited.
  const searchParams = await props.searchParams;

  // Values from a URL can be string | string[] | undefined, so normalise first.
  const q = firstValue(searchParams.q);
  const industry = firstValue(searchParams.industry);
  const gradYear = firstValue(searchParams.gradYear);
  const expertise = firstValue(searchParams.expertise);
  const verifiedOnly = firstValue(searchParams.verified) === "1";

  // Build the WHERE clause one condition at a time. Anything the user left
  // blank is simply never added, so an empty form returns everyone.
  const where: Prisma.AlumniProfileWhereInput = {};

  if (q) {
    // OR = match either field. `mode: "insensitive"` makes it case-insensitive,
    // and `contains` is a substring match, so "acm" finds "Acme Inc.".
    // The name lives on the related User row, hence the nested `user` filter.
    where.OR = [
      { user: { name: { contains: q, mode: "insensitive" } } },
      { company: { contains: q, mode: "insensitive" } },
    ];
  }

  // Guard the URL value against the enum. A hand-edited ?industry=banana would
  // otherwise reach Prisma and throw; here it's simply ignored.
  if (isIndustry(industry)) {
    where.industry = industry;
  }

  // gradYear arrives as a string like "2018" but the column is an Int.
  const gradYearNumber = Number(gradYear);
  if (gradYear && Number.isInteger(gradYearNumber)) {
    where.gradYear = gradYearNumber;
  }

  if (expertise) {
    // `has` is the array operator: "this list contains this exact value".
    where.expertiseTags = { has: expertise };
  }

  // Only ever narrows. Unchecked shows everyone, so nobody is hidden by
  // default just because an admin hasn't got to them yet.
  if (verifiedOnly) {
    where.verified = true;
  }

  // These three queries don't depend on each other, so run them at the same
  // time instead of one after another. (Industries no longer need a query at
  // all — the enum is the complete list of valid values.)
  const [alumni, gradYearRows, tagRows] = await Promise.all([
    prisma.alumniProfile.findMany({
      where,
      select: {
        id: true,
        jobTitle: true,
        company: true,
        industry: true,
        gradYear: true,
        expertiseTags: true,
        verified: true,
        // Pull just the name off the related User — never the passwordHash.
        user: { select: { name: true } },
      },
      orderBy: [{ gradYear: "desc" }, { company: "asc" }],
    }),

    // `distinct` gives one row per unique value, which is what populates the
    // graduation-year dropdown with only years that actually exist.
    prisma.alumniProfile.findMany({
      distinct: ["gradYear"],
      select: { gradYear: true },
      orderBy: { gradYear: "desc" },
    }),

    // expertiseTags is a list column, so `distinct` can't help — we read every
    // row's tags and flatten them into one deduplicated set in JS.
    prisma.alumniProfile.findMany({ select: { expertiseTags: true } }),
  ]);

  // One extra query for every card's rating, rather than one per card.
  const ratings = await ratingsByAlumni(alumni.map((person) => person.id));

  const gradYears = gradYearRows.map((row) => row.gradYear);
  const expertiseTags = [
    ...new Set(tagRows.flatMap((row) => row.expertiseTags ?? [])),
  ].sort();

  const isFiltered = Boolean(
    q || industry || gradYear || expertise || verifiedOnly,
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Alumni directory
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {alumni.length} {alumni.length === 1 ? "alumnus" : "alumni"}
            {isFiltered ? " matching your filters" : " available to connect"}
          </p>
        </div>
        <Link
          href="/"
          className="text-sm font-medium text-zinc-600 underline dark:text-zinc-400"
        >
          Back home
        </Link>
      </header>

      {/*
        method="get" means submitting this form navigates to
        /alumni?q=...&industry=... which re-runs this server component.
        defaultValue keeps the current choice visible after the reload.
      */}
      <form
        method="get"
        className="mt-6 grid gap-3 rounded-lg border border-zinc-200 p-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-zinc-800"
      >
        <div className="lg:col-span-4">
          <label className={labelClass} htmlFor="q">
            Search by name or company
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q ?? ""}
            placeholder="e.g. Parthib, or Acme"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="industry">
            Industry
          </label>
          <select
            id="industry"
            name="industry"
            defaultValue={industry ?? ""}
            className={inputClass}
          >
            <option value="">All industries</option>
            {INDUSTRY_VALUES.map((value) => (
              <option key={value} value={value}>
                {INDUSTRY_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="gradYear">
            Graduation year
          </label>
          <select
            id="gradYear"
            name="gradYear"
            defaultValue={gradYear ?? ""}
            className={inputClass}
          >
            <option value="">All years</option>
            {gradYears.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="expertise">
            Expertise
          </label>
          <select
            id="expertise"
            name="expertise"
            defaultValue={expertise ?? ""}
            className={inputClass}
            disabled={expertiseTags.length === 0}
          >
            <option value="">
              {expertiseTags.length === 0 ? "None recorded yet" : "All areas"}
            </option>
            {expertiseTags.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        {/* A checkbox submits its value only when ticked, so `verified=1`
            simply isn't in the URL when it's off — which is exactly the
            "absent means no filter" shape the other filters use. */}
        <div className="flex items-end lg:col-span-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              name="verified"
              value="1"
              defaultChecked={verifiedOnly}
              className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
            />
            Verified alumni only
          </label>
        </div>

        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Apply
          </button>
          {isFiltered && (
            // A plain link back to the bare URL is the simplest possible reset.
            <Link
              href="/alumni"
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      {alumni.length === 0 ? (
        <p className="mt-10 rounded-lg border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          {isFiltered
            ? "No alumni match those filters. Try clearing one of them."
            : "No alumni have signed up yet."}
        </p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {alumni.map((person) => (
            <li key={person.id}>
              {/* The whole card is one link to the detail page. */}
              <Link
                href={`/alumni/${person.id}`}
                className="block h-full rounded-lg border border-zinc-200 p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-medium text-zinc-900 dark:text-zinc-50">
                    {person.user.name}
                  </h2>
                  {person.verified && (
                    <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950 dark:text-green-300">
                      Verified
                    </span>
                  )}
                </div>

                <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                  {person.jobTitle} at {person.company}
                </p>

                <div className="mt-2">
                  {/* Alumni with no reviews get "No reviews yet" rather than a
                      misleading 0.0. */}
                  <Rating
                    {...(ratings.get(person.id) ?? { average: 0, count: 0 })}
                  />
                </div>

                <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                  <div>
                    <dt className="inline font-medium">Industry: </dt>
                    <dd className="inline">
                      {INDUSTRY_LABELS[person.industry]}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">Class of </dt>
                    <dd className="inline">{person.gradYear}</dd>
                  </div>
                </dl>

                {person.expertiseTags && person.expertiseTags.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {person.expertiseTags.map((tag) => (
                      <li
                        key={tag}
                        className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      >
                        {tag}
                      </li>
                    ))}
                  </ul>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ?q=a&q=b would give us an array; we only ever want a single value.
function firstValue(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  const trimmed = single?.trim();
  return trimmed ? trimmed : undefined;
}

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-400";

const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";
