"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import OrbitView3D from "@/components/orbit-view-3d";
import CometList from "@/components/comet-list";
import { CockpitPanel } from "@/components/cockpit/panel";

type CockpitLayoutProps = {
  /**
   * Optional content to render inside the central viewport.
   */
  children?: ReactNode;
};

export function CockpitLayout({ children }: CockpitLayoutProps) {
  const [visibleCometIds, setVisibleCometIds] = useState<string[] | null>(null);

  return (
    <div className="relative flex min-h-screen w-full items-stretch justify-center overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-black text-slate-100">
      <AmbientBackdrop />
      <div className="relative z-10 flex h-screen w-full max-w-7xl flex-col gap-6 px-6 py-6 lg:px-10">
        <motion.div
          className="pointer-events-none absolute inset-x-20 top-0 h-32 rounded-b-full border border-cyan-500/10 bg-gradient-to-b from-cyan-500/10 via-cyan-400/5 to-transparent blur-3xl"
          animate={{ opacity: [0.2, 0.4, 0.18] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        <TopHUD />
        <MainView>{children}</MainView>
        <ControlDeck
          visibleCometIds={visibleCometIds}
          onVisibleChange={(ids) => setVisibleCometIds(ids)}
        />
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
        <Badge variant="outline" className="border-cyan-500/50 px-4 py-1 text-sm tracking-[0.35em] text-cyan-300">
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
      className="relative flex flex-col rounded-[2.5rem] border border-slate-800/70 bg-slate-950/70 shadow-[0_30px_90px_-45px_rgba(0,255,255,0.35)] backdrop-blur-lg"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      style={{ flexBasis: "44vh", minHeight: "260px", flexGrow: 1 }}
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
      <div className="relative z-10 flex h-full w-full flex-1 overflow-hidden rounded-[2rem] border border-cyan-500/20 bg-slate-950/60">
        <div className="absolute inset-0">{children}</div>
        {!children && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center uppercase tracking-[0.35em] text-cyan-200/80">
            <span className="text-sm">No module loaded</span>
            <span className="text-[11px] text-slate-300/70">Inject visualization component</span>
          </div>
        )}
      </div>
    </motion.section>
  );
}

function ControlDeck({
  visibleCometIds,
  onVisibleChange,
}: {
  visibleCometIds: string[] | null;
  onVisibleChange: (ids: string[]) => void;
}) {
  return (
    <motion.section
      className="relative grid gap-4 rounded-[2.3rem] border border-slate-800/80 bg-slate-950/85 px-4 py-4 shadow-[0_-45px_120px_-70px_rgba(59,130,246,0.6)] backdrop-blur-xl md:grid-cols-[1.1fr_1.3fr_0.7fr]"
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.2 }}
    >
      <motion.div
        className="pointer-events-none absolute inset-x-12 top-0 h-12 rounded-b-full bg-gradient-to-b from-cyan-300/20 via-transparent to-transparent blur-xl"
        animate={{ opacity: [0.1, 0.22, 0.12] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
      />
      <OrbitPanel visibleCometIds={visibleCometIds} />
      <CometListPanel onVisibleChange={onVisibleChange} />
      <NavigationPanel />
    </motion.section>
  );
}

function OrbitPanel({ visibleCometIds }: { visibleCometIds: string[] | null }) {
  return (
    <CockpitPanel className="h-[18rem]">
      <div className="px-4 pt-3 text-[11px] uppercase tracking-[0.4em] text-cyan-100">Orbital View</div>
      <div className="flex flex-1 flex-col px-3 pb-3">
        <div className="flex-1 overflow-hidden rounded-[1.4rem] border border-slate-800/70 bg-slate-950/70 p-2">
          <OrbitView3D onlyIds={visibleCometIds ?? undefined} variant="compact" />
        </div>
      </div>
    </CockpitPanel>
  );
}

function CometListPanel({ onVisibleChange }: { onVisibleChange: (ids: string[]) => void }) {
  return (
    <CockpitPanel className="h-[18rem]">
      <div className="px-4 pt-3 text-[11px] uppercase tracking-[0.4em] text-cyan-100">Comet Registry</div>
      <div className="flex-1 overflow-hidden px-3 pb-3">
        <CometList onVisibleChange={onVisibleChange} variant="compact" />
      </div>
    </CockpitPanel>
  );
}

function NavigationPanel() {
  return (
    <CockpitPanel className="h-[18rem]">
      <div className="px-4 pt-3 text-[11px] uppercase tracking-[0.4em] text-cyan-100">Navigation</div>
      <div className="flex flex-1 flex-col justify-between gap-4 px-5 py-4 text-xs text-slate-300/80">
        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 px-4 py-3 shadow-[0_12px_30px_-25px_rgba(59,130,246,0.65)]">
            <div className="text-[10px] uppercase tracking-[0.45em] text-slate-400/80">Target</div>
            <div className="mt-1 font-mono text-base text-cyan-300/80">Kepler-452b</div>
          </div>
          <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 px-4 py-3 shadow-[0_12px_30px_-25px_rgba(59,130,246,0.65)]">
            <div className="text-[10px] uppercase tracking-[0.45em] text-slate-400/80">ETA</div>
            <div className="mt-1 font-mono text-base text-cyan-300/80">02:17:43</div>
          </div>
        </div>
        <Button
          size="sm"
          className="h-11 rounded-[1.2rem] bg-gradient-to-r from-cyan-500/40 via-cyan-400/30 to-blue-500/40 text-cyan-50 shadow-[0_18px_60px_-35px_rgba(59,130,246,0.75)] hover:brightness-110"
        >
          Course Adjust
        </Button>
      </div>
    </CockpitPanel>
  );
}

function AmbientBackdrop() {
  return (
    <>
      <motion.div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.18),transparent_50%),radial-gradient(circle_at_80%_30%,rgba(14,116,144,0.18),transparent_55%),radial-gradient(circle_at_50%_80%,rgba(249,115,22,0.08),transparent_45%)]"
        animate={{ opacity: [0.2, 0.35, 0.25] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute inset-0 mix-blend-screen"
        style={{
          backgroundImage:
            "linear-gradient(135deg, rgba(56, 189, 248, 0.08) 0%, transparent 60%), linear-gradient(225deg, rgba(168, 85, 247, 0.04) 0%, transparent 70%)",
        }}
        animate={{ opacity: [0.15, 0.3, 0.18] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
    </>
  );
}

function ScanlineOverlay() {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 opacity-10 mix-blend-soft-light"
      style={{
        backgroundImage:
          "repeating-linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0px, rgba(255, 255, 255, 0.04) 1px, transparent 3px, transparent 6px)",
      }}
      animate={{ opacity: [0.05, 0.15, 0.08], y: [0, -8, 0] }}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

export function CockpitLayoutBanner() {
  return (
    <div className="pointer-events-none relative aspect-[9/1] w-full min-h-[8rem] overflow-hidden rounded-[2rem] border border-slate-800/80 bg-slate-950/90 text-slate-100 shadow-[0_45px_120px_-80px_rgba(59,130,246,0.55)]">
      <AmbientBackdrop />
      <div className="relative z-10 flex h-full items-stretch gap-3 px-4 py-3">
        <motion.div
          className="hidden md:flex h-full w-48 flex-col justify-between rounded-2xl border border-slate-800/70 bg-slate-950/60 p-3"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        >
          <span className="text-[11px] uppercase tracking-[0.3em] text-cyan-200/70">Mission Feed</span>
          <motion.div
            className="space-y-1.5 text-[9px] uppercase tracking-[0.32em] text-slate-200/70"
            animate={{ opacity: [0.6, 1, 0.7] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
          >
            <BannerSignal label="Comet telemetry" value="SYNCED" />
            <BannerSignal label="Vessel drift" value="<0.02°" />
            <BannerSignal label="Orbital uplink" value="STABLE" />
          </motion.div>
        </motion.div>
        <motion.div
          className="relative flex h-full flex-1 items-center justify-center rounded-[1.5rem] border border-slate-800/70 bg-slate-950/70 px-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <div className="pointer-events-none absolute inset-0 rounded-[1.5rem] border border-cyan-500/15" />
          <motion.div
            className="absolute inset-x-6 top-2 mx-auto h-10 rounded-b-full bg-gradient-to-b from-white/15 via-cyan-200/10 to-transparent blur-xl"
            animate={{ opacity: [0.1, 0.35, 0.18] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="pointer-events-none absolute inset-0 rounded-[1.5rem] opacity-20 mix-blend-screen"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, rgba(110, 231, 255, 0.06) 0px, rgba(110, 231, 255, 0.1) 1px, transparent 2px, transparent 5px)",
            }}
            animate={{ opacity: [0.05, 0.2, 0.1] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="relative z-10 flex w-full items-center justify-between text-[10px] uppercase tracking-[0.35em] text-slate-200/70">
            <div className="space-y-1">
              <span className="text-cyan-200/85">Observation Window</span>
              <span className="font-mono text-[11px] text-cyan-200/60">viewport ready // static preview</span>
            </div>
            <motion.div
              className="flex flex-col items-end text-[9px] font-mono text-cyan-200/70"
              animate={{ opacity: [0.5, 1, 0.6] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
            >
              <span>Latitude +12.4</span>
              <span>Longitude -45.9</span>
            </motion.div>
          </div>
        </motion.div>
        <motion.div
          className="hidden lg:flex h-full w-44 flex-col justify-between rounded-2xl border border-slate-800/70 bg-slate-950/60 p-3 text-[9px] uppercase tracking-[0.3em]"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
        >
          <span className="text-cyan-200/70">Systems</span>
          <div className="grid gap-1.5">
            <BannerMetric label="Core Temp" value="278K" />
            <BannerMetric label="Fuel Res." value="63%" />
            <BannerMetric label="Vector Sync" value="Recal" accent="orange" />
          </div>
        </motion.div>
      </div>
      <ScanlineOverlay />
    </div>
  );
}

function BannerSignal({ label, value }: { label: string; value: string }) {
  return (
    <motion.div
      className="flex items-center justify-between rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-2 py-1 text-[9px] uppercase tracking-[0.32em] text-cyan-200/75"
      animate={{ opacity: [0.65, 0.95, 0.7] }}
      transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
    >
      <span>{label}</span>
      <span className="font-mono text-[10px] text-cyan-100/80">{value}</span>
    </motion.div>
  );
}

function BannerMetric({
  label,
  value,
  accent = "cyan",
}: {
  label: string;
  value: string;
  accent?: "cyan" | "orange";
}) {
  const accentClasses =
    accent === "orange"
      ? "border-orange-500/40 bg-orange-500/10 text-orange-200/80"
      : "border-cyan-500/40 bg-cyan-500/10 text-cyan-200/80";
  return (
    <motion.div
      className={`flex items-center justify-between rounded-lg border px-2 py-1 text-[9px] uppercase tracking-[0.3em] ${accentClasses}`}
      animate={{ opacity: [0.6, 1, 0.7] }}
      transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
    >
      <span>{label}</span>
      <span className="font-mono text-[10px]">{value}</span>
    </motion.div>
  );
}

export default CockpitLayout;
