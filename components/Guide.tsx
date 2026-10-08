"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  markdown: string;
  onClose?(): void;
}

export function Guide({ markdown, onClose }: Props) {
  const download = () => {
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "build-guide.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section aria-label="Build guide" className="rounded-xl border border-zinc-200 p-4 sm:p-6 dark:border-zinc-800">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Build guide</h2>
        <div className="flex gap-2">
          <button type="button" onClick={download} className="h-9 rounded-full bg-foreground px-4 text-sm font-medium text-background">
            Download .md
          </button>
          {onClose && (
            <button type="button" onClick={onClose} className="h-9 rounded-full border border-zinc-300 px-4 text-sm dark:border-zinc-700">
              Close
            </button>
          )}
        </div>
      </div>
      <div className="guide overflow-x-auto text-sm leading-relaxed">
        <Markdown remarkPlugins={[remarkGfm]}>{markdown}</Markdown>
      </div>
    </section>
  );
}
