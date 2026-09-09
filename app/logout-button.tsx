"use client";

import { signOut } from "next-auth/react";

// signOut() has to run in the browser (it clears the session cookie and then
// navigates), so this small piece is a client component. The home page that
// renders it stays a server component.
//
// Note: only special filenames like page.tsx and route.ts become URLs, so this
// file living inside app/ does NOT create a /logout-button route.
export default function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
    >
      Log out
    </button>
  );
}
