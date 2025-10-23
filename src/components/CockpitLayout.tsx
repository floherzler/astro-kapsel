"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import SummaryPanel from "@/components/cockpit/summary-panel";

type CockpitLayoutProps = {
  children?: ReactNode;
};

export function CockpitLayout({ children }: CockpitLayoutProps) {
  return (
    <div className="relative flex min-h-screen w-full items-stretch justify-center overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-black text-slate-100">
      <AmbientBackdrop />
      <div className="relative z-10 flex h-screen min-h-0 w-full max-w-7xl flex-col gap-6 px-6 py-6 lg:px-10">
        <motion.div
          className="pointer-events-none absolute inset-x-20 top-0 h-32 rounded-b-full border border-cyan-500/10 bg-gradient-to-b from-cyan-500/10 via-cyan-400/5 to-transparent blur-3xl"
          animate={{ opacity: [0.2, 0.4, 0.18] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        <TopHUD />
        <MainView>{children}</MainView>
        <ScanlineOverlay />
      </div>
    </div>
  );
}

function TopHUD() {
  return (
    <motion.header
      className="relative flex h-16 items-center justify-between rounded-2xl border border-slate-800/70 bg-slate-900/70 px-6 shadow-[0_12px_24px_-18px_rgba(0,0,0,0.9)] backdrop-blur-md"
      initial={{ opacity: 0, y: -18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <div className="flex items-center gap-3">
        <Badge variant="default" className="border-cyan-500/50 px-4 py-1 text-sm tracking-[0.35em] text-cyan-300">
          ASTROKAPSEL
        </Badge>
        <span className="text-xs uppercase tracking-[0.35em] text-slate-200/70">Cockpit Systems Monitor</span>
      </div>
      <div className="flex items-center gap-3">
        <motion.div
          className="hidden items-center gap-3 text-[11px] uppercase tracking-[0.25em] text-cyan-200/70 sm:flex"
          animate={{ opacity: [0.5, 0.85, 0.6] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          <span className="rounded-full border border-cyan-400/40 px-3 py-1">Status: Nominal</span>
          <span className="rounded-full border border-cyan-400/40 px-3 py-1">Solar Index 0.07</span>
        </motion.div>
        <Link
          href="/"
          className="rounded-full border border-slate-600/70 bg-slate-900/70 px-4 py-1.5 text-[11px] uppercase tracking-[0.35em] text-slate-200/80 shadow-[0_0_15px_rgba(59,130,246,0.35)] transition hover:border-cyan-500/50 hover:text-white"
        >
          Exit Cockpit
        </Link>
      </div>
    </motion.header>
  );
}

function MainView({ children }: { children?: ReactNode }) {
  return (
    <motion.section
      className="relative flex flex-1 min-h-0 flex-col rounded-[2.5rem] border border-slate-800/70 bg-slate-950/70 shadow-[0_30px_90px_-45px_rgba(0,255,255,0.35)] backdrop-blur-lg"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      style={{ flexGrow: 1, minHeight: "520px" }}
    >
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-[2.5rem] border border-cyan-500/10"
        animate={{ opacity: [0.18, 0.28, 0.2] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-[2.5rem] opacity-15 mix-blend-screen"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 15%, rgba(94, 234, 212, 0.18) 0%, transparent 40%), radial-gradient(circle at 75% 20%, rgba(59, 130, 246, 0.14) 0%, transparent 45%)",
        }}
        animate={{ opacity: [0.08, 0.2, 0.1] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />

      <header className="relative z-10 flex items-center justify-between px-8 py-4">
        <div className="flex items-center gap-4 text-xs uppercase tracking-[0.35em] text-cyan-200/80">
          <span className="text-sm font-semibold tracking-[0.4em] text-cyan-100">astroKapsel</span>
          <span>Observation Window</span>
        </div>
        <div className="text-right text-[10px] uppercase tracking-[0.35em] text-slate-200/70">
          <p>Viewport Ready</p>
          <p>Live Telemetry Feed</p>
        </div>
      </header>

      <div className="relative z-10 grid flex-1 min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-6 px-8 pb-6">
        <div className="relative min-h-0 h-full overflow-hidden rounded-[2rem] border border-cyan-500/20 bg-slate-950/60">
          <div className="absolute inset-0">{children}</div>
          {!children && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center uppercase tracking-[0.35em] text-cyan-200/80">
              <span className="text-sm">No module loaded</span>
              <span className="text-[11px] text-slate-300/70">Inject visualization component</span>
            </div>
          )}
        </div>

        <div className="min-h-0 h-full">
          <SummaryPanel />
        </div>
      </div>
    </motion.section>
  );
}

function ScanlineOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-40">
      <div className="absolute inset-0 bg-[linear-gradient(to-bottom,rgba(59,130,246,0.04)1px,transparent_0)] bg-[length:100%_3px]" />
      <motion.div
        className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent"
        animate={{ backgroundPositionY: ["0%", "100%"] }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}

function AmbientBackdrop() {
  return (
    <>
      <motion.div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.06),transparent_45%),radial-gradient(circle_at_80%_30%,rgba(59,130,246,0.08),transparent_55%),radial-gradient(circle_at_50%_80%,rgba(56,189,248,0.05),transparent_55%)]"
        animate={{ opacity: [0.6, 0.9, 0.6] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.svg
        className="pointer-events-none absolute inset-0 opacity-40"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <motion.path
          d="M0 10 Q 25 0 50 10 T 100 10 V100 H0 Z"
          fill="none"
          stroke="url(#gridGradient)"
          strokeWidth="0.35"
          strokeDasharray="0.4 5"
          opacity="0.08"
        />
        <defs>
          <linearGradient id="gridGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(34,211,238,0.25)" />
            <stop offset="50%" stopColor="rgba(59,130,246,0.18)" />
            <stop offset="100%" stopColor="rgba(34,211,238,0.25)" />
          </linearGradient>
        </defs>
      </motion.svg>
    </>
  );
}

export default CockpitLayout;
