import Link from "next/link";
import { BotMark } from "@/components/studio/ui";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-4 text-ink">
      <div className="max-w-[460px] text-center">
        <BotMark className="mx-auto h-12 w-12 text-blue" />
        <h1 className="mt-5 text-3xl font-bold tracking-tight">Nothing here</h1>
        <p className="mt-3 leading-relaxed text-mute">This page or build link doesn&apos;t exist. A shared link may have been copied only in part; ask for it again, or start a robot of your own.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <Link href="/" className="inline-flex h-10 items-center rounded-full bg-blue px-5 text-sm font-semibold text-white hover:bg-blue-ink">
            Build a robot
          </Link>
          <Link href="/parts" className="inline-flex h-10 items-center rounded-full border border-line px-5 text-sm font-semibold hover:border-ink">
            Parts catalog
          </Link>
        </div>
      </div>
    </main>
  );
}
