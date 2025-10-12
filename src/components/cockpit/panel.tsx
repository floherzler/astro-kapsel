"use client";

import type { ReactNode } from "react";

type CockpitPanelProps = {
  children: ReactNode;
  className?: string;
};

type CockpitPanelHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
};

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function CockpitPanel({ children, className }: CockpitPanelProps) {
  return (
    <div
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-slate-800/70 bg-gradient-to-br from-slate-950/90 via-slate-950/70 to-slate-950/90 shadow-[inset_0_1px_0_rgba(148,163,184,0.15),0_30px_80px_-60px_rgba(59,130,246,0.55)] backdrop-blur",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-4 rounded-[1.4rem] border border-white/5" />
      <div className="pointer-events-none absolute inset-0 opacity-20 mix-blend-screen">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_55%)]" />
      </div>
      <div className="relative flex h-full flex-col">{children}</div>
    </div>
  );
}

export function CockpitPanelHeader({ title, subtitle, actions, className }: CockpitPanelHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-slate-800/70 px-5 pb-4 pt-5 text-slate-200 md:flex-row md:items-center md:justify-between",
        className
      )}
    >
      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-[0.55em] text-cyan-200/80">{title}</span>
        {subtitle ? <span className="text-[11px] uppercase tracking-[0.4em] text-slate-300/60">{subtitle}</span> : null}
      </div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </div>
  );
}
