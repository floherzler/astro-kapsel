"use client";

import * as React from "react";

type ScrollAreaProps = {
  children: React.ReactNode;
  className?: string;
  viewportClassName?: string;
};

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function ScrollArea({ children, className, viewportClassName }: ScrollAreaProps) {
  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div
        className={cn(
          "h-full w-full overflow-y-auto pr-2 [scrollbar-width:thin] [scrollbar-color:rgba(59,130,246,0.4)_transparent]",
          "scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700/50 hover:scrollbar-thumb-slate-500/70",
          viewportClassName
        )}
      >
        {children}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-slate-950/90 to-transparent" />
    </div>
  );
}

export default ScrollArea;
