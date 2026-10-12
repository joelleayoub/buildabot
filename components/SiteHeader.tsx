import Link from "next/link";
import { Logo } from "./Illustrations";

/** Simple header for the parts catalog and shared build pages. The home page has its own. */
export function SiteHeader() {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <nav className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <Logo />
          buildabot
        </Link>
        <Link href="/parts" className="text-sm text-zinc-600 hover:text-foreground dark:text-zinc-400">
          Parts catalog
        </Link>
      </nav>
    </header>
  );
}
