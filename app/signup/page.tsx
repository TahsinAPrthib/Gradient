"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { INDUSTRY_LABELS, INDUSTRY_VALUES } from "@/lib/industries";
import Wordmark from "../wordmark";

type Role = "STUDENT" | "ALUMNI";

// One object holds every field for both roles. Switching the toggle just
// changes which of them we render and which ones we send.
const EMPTY_FORM = {
  name: "",
  email: "",
  password: "",
  field: "",
  currentYear: "",
  gradYear: "",
  industry: "",
  company: "",
  jobTitle: "",
  expertiseTags: "",
};

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-400";

const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

export default function SignupPage() {
  const router = useRouter();

  const [role, setRole] = useState<Role>("STUDENT");
  const [form, setForm] = useState(EMPTY_FORM);
  // Errors from the API, keyed by field name, e.g. { email: "already taken" }.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update(key: keyof typeof EMPTY_FORM, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Without this the browser does a full page reload and we lose all state.
    event.preventDefault();

    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    // Send only the fields the chosen role actually uses, so a student never
    // submits a half-filled "company" left over from toggling back and forth.
    const payload =
      role === "STUDENT"
        ? {
            name: form.name,
            email: form.email,
            password: form.password,
            role,
            field: form.field,
            currentYear: form.currentYear,
            gradYear: form.gradYear,
          }
        : {
            name: form.name,
            email: form.email,
            password: form.password,
            role,
            gradYear: form.gradYear,
            industry: form.industry,
            company: form.company,
            jobTitle: form.jobTitle,
            // Sent as the raw comma-separated string; the API splits and
            // cleans it, so the parsing rules live in exactly one place.
            expertiseTags: form.expertiseTags,
          };

    try {
      // Step 1 — create the account.
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        setFormError(data.error ?? "Could not create your account.");
        setFieldErrors(data.fields ?? {});
        setSubmitting(false);
        return;
      }

      // Step 2 — log the new account straight in. `redirect: false` tells
      // NextAuth to hand the result back to us instead of navigating itself,
      // so we can show an error in place if something goes wrong.
      const signInResult = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });

      if (signInResult?.error) {
        setFormError(
          "Your account was created, but signing in failed. Please log in.",
        );
        setSubmitting(false);
        return;
      }

      // push() navigates; refresh() re-runs the server components so the home
      // page re-reads the new session cookie instead of rendering the cached
      // logged-out version.
      router.push("/");
      router.refresh();
    } catch {
      setFormError("Network error — please check your connection and retry.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Create your <Wordmark /> account
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Already have one?{" "}
          <Link href="/login" className="font-medium underline">
            Log in
          </Link>
          .
        </p>

        {/* Role toggle — changing it swaps the role-specific fields below. */}
        <div className="mt-6 grid grid-cols-2 gap-2 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
          {(["STUDENT", "ALUMNI"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRole(option)}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                role === option
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              {option === "STUDENT" ? "Student" : "Alumni"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {formError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {formError}
            </p>
          )}

          <div>
            <label className={labelClass} htmlFor="name">
              Full name
            </label>
            <input
              id="name"
              className={inputClass}
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
            />
            <FieldError message={fieldErrors.name} />
          </div>

          <div>
            <label className={labelClass} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className={inputClass}
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
            />
            <FieldError message={fieldErrors.email} />
          </div>

          <div>
            <label className={labelClass} htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              className={inputClass}
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
            />
            <FieldError message={fieldErrors.password} />
            <p className="mt-1 text-xs text-zinc-500">At least 8 characters.</p>
          </div>

          {role === "STUDENT" ? (
            <>
              <div>
                <label className={labelClass} htmlFor="field">
                  Field of study
                </label>
                <input
                  id="field"
                  className={inputClass}
                  placeholder="Computer Science"
                  value={form.field}
                  onChange={(e) => update("field", e.target.value)}
                />
                <FieldError message={fieldErrors.field} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass} htmlFor="currentYear">
                    Current year
                  </label>
                  <input
                    id="currentYear"
                    type="number"
                    className={inputClass}
                    placeholder="3"
                    value={form.currentYear}
                    onChange={(e) => update("currentYear", e.target.value)}
                  />
                  <FieldError message={fieldErrors.currentYear} />
                </div>

                <div>
                  <label className={labelClass} htmlFor="gradYear">
                    Graduation year
                  </label>
                  <input
                    id="gradYear"
                    type="number"
                    className={inputClass}
                    placeholder="2027"
                    value={form.gradYear}
                    onChange={(e) => update("gradYear", e.target.value)}
                  />
                  <FieldError message={fieldErrors.gradYear} />
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className={labelClass} htmlFor="gradYearAlumni">
                  Graduation year
                </label>
                <input
                  id="gradYearAlumni"
                  type="number"
                  className={inputClass}
                  placeholder="2018"
                  value={form.gradYear}
                  onChange={(e) => update("gradYear", e.target.value)}
                />
                <FieldError message={fieldErrors.gradYear} />
              </div>

              <div>
                <label className={labelClass} htmlFor="industry">
                  Industry
                </label>
                {/*
                  A dropdown rather than free text, because industry is a
                  database enum now. The option values are the enum members
                  (SOFTWARE); the text shown is the friendly label (Software).
                */}
                <select
                  id="industry"
                  className={inputClass}
                  value={form.industry}
                  onChange={(e) => update("industry", e.target.value)}
                >
                  <option value="">Select an industry…</option>
                  {INDUSTRY_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {INDUSTRY_LABELS[value]}
                    </option>
                  ))}
                </select>
                <FieldError message={fieldErrors.industry} />
              </div>

              <div>
                <label className={labelClass} htmlFor="company">
                  Company
                </label>
                <input
                  id="company"
                  className={inputClass}
                  placeholder="Acme Inc."
                  value={form.company}
                  onChange={(e) => update("company", e.target.value)}
                />
                <FieldError message={fieldErrors.company} />
              </div>

              <div>
                <label className={labelClass} htmlFor="jobTitle">
                  Job title
                </label>
                <input
                  id="jobTitle"
                  className={inputClass}
                  placeholder="Senior Engineer"
                  value={form.jobTitle}
                  onChange={(e) => update("jobTitle", e.target.value)}
                />
                <FieldError message={fieldErrors.jobTitle} />
              </div>

              <div>
                <label className={labelClass} htmlFor="expertiseTags">
                  Areas of expertise{" "}
                  <span className="font-normal text-zinc-500">(optional)</span>
                </label>
                <input
                  id="expertiseTags"
                  className={inputClass}
                  placeholder="Backend, System Design, Career Growth"
                  value={form.expertiseTags}
                  onChange={(e) => update("expertiseTags", e.target.value)}
                />
                <FieldError message={fieldErrors.expertiseTags} />
                <p className="mt-1 text-xs text-zinc-500">
                  Separate with commas. Students can filter the directory by
                  these.
                </p>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}

// Small helper so every field renders its error the same way.
function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs text-red-600 dark:text-red-400">{message}</p>
  );
}
