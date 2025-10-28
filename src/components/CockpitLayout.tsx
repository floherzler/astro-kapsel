"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import SummaryProvider, {
  SummaryDetailsPanel,
  SummaryFlybyPanel,
  SummaryVisualizationPanel,
  useSummaryLayoutInfo,
} from "@/components/cockpit/summary-panel";

type CockpitLayoutProps = {
  children?: ReactNode;
};

export function CockpitLayout({ children }: CockpitLayoutProps) {
  return (
    <SummaryProvider>
      <div className="relative flex min-h-screen w-full items-stretch justify-center bg-[#050607] text-slate-100">
        <div className="flex h-screen w-full max-w-7xl flex-col gap-6 px-6 py-6 lg:px-10">
          <MainView>{children}</MainView>
        </div>
      </div>
    </SummaryProvider>
  );
}

function MainView({ children }: { children?: ReactNode }) {
  // Desktop layout uses a fixed 3x2 cell grid; mobile stacks panels.
  const { orientation } = useSummaryLayoutInfo();
  return (
    <div className="flex flex-1 min-h-0 flex-col gap-6">
      <header className="flex items-center justify-between px-2 py-2 sm:px-4">
        <div className="flex items-center gap-4 text-xs uppercase tracking-[0.35em] text-cyan-200/80">
          <span className="text-sm font-semibold tracking-[0.4em] text-cyan-100">astroKapsel</span>
          <span>Observation Window</span>
        </div>
        <Link
          href="/"
          className="rounded-full border border-slate-600/70 bg-slate-900/70 px-4 py-1.5 text-[11px] uppercase tracking-[0.35em] text-slate-200/80 shadow-[0_0_15px_rgba(59,130,246,0.35)] transition hover:border-cyan-500/50 hover:text-white"
        >
          Exit Cockpit
        </Link>
      </header>

      {/* Mobile: stack in order flyby -> image -> briefing -> earth */}
      <div className="flex flex-1 flex-col gap-6 lg:hidden">
        <SummaryFlybyPanel className="rounded-2xl border border-slate-900/70 bg-[#06080e]" />
        <SummaryVisualizationPanel className="rounded-2xl border border-slate-900/70 bg-[#06080e]" />
        <SummaryDetailsPanel className="min-h-0 overflow-auto rounded-2xl border border-slate-900/70 bg-[#06080e]" />
        <div className="relative h-64 w-full overflow-hidden rounded-2xl border border-slate-900/70 bg-[#06080e]">
          {children ? (
            <div className="absolute inset-0">{children}</div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-[11px] uppercase tracking-[0.35em] text-cyan-200/80">
              <span className="text-sm">No module loaded</span>
              <span className="text-[11px] text-slate-300/70">Inject visualization component</span>
            </div>
          )}
        </div>
      </div>

      {/* Desktop: simple 3 columns x 2 rows grid using available space.
          Wide image order:
            s | f | e
            s | i | i
          Poster image order:
            s | f | i
            s | e | i
      */}
      <div className="hidden lg:flex lg:flex-1 lg:items-stretch">
        <div className="mx-auto grid h-full min-h-0 w-full max-w-[140rem] grid-cols-3 grid-rows-2 gap-6">
          {/* Summary spans two rows, first column */}
          <SummaryDetailsPanel className="min-h-0 overflow-auto rounded-2xl border border-slate-900/70 bg-[#06080e] lg:col-start-1 lg:row-span-2" />

          {/* Top-middle: Flyby selector */}
          <SummaryFlybyPanel className="rounded-2xl border border-slate-900/70 bg-[#06080e] lg:col-start-2 lg:row-start-1" />

          {orientation === "poster" ? (
            <>
              {/* Poster: Image spans two rows on the right */}
              <SummaryVisualizationPanel className="rounded-2xl border border-slate-900/70 bg-[#06080e] lg:col-start-3 lg:row-span-2" />
              {/* Bottom-middle: Earth */}
              <div className="relative overflow-hidden rounded-2xl border border-slate-900/70 bg-[#06080e] lg:col-start-2 lg:row-start-2">
                {children ? (
                  <div className="absolute inset-0">{children}</div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-[11px] uppercase tracking-[0.35em] text-cyan-200/80">
                    <span className="text-sm">No module loaded</span>
                    <span className="text-[11px] text-slate-300/70">Inject visualization component</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Wide: Top-right Earth */}
              <div className="relative overflow-hidden rounded-2xl border border-slate-900/70 bg-[#06080e] lg:col-start-3 lg:row-start-1">
                {children ? (
                  <div className="absolute inset-0">{children}</div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-[11px] uppercase tracking-[0.35em] text-cyan-200/80">
                    <span className="text-sm">No module loaded</span>
                    <span className="text-[11px] text-slate-300/70">Inject visualization component</span>
                  </div>
                )}
              </div>
              {/* Bottom image spans middle + right */}
              <SummaryVisualizationPanel className="rounded-2xl border border-slate-900/70 bg-[#06080e] lg:col-start-2 lg:col-span-2 lg:row-start-2" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default CockpitLayout;
