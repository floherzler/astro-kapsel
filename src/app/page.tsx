"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import OrbitView3D from "@/components/orbit-view-3d";
import SlideToLaunch from "@/components/slide-to-launch";
import AddCometForm from "@/components/add-comet-form";
import client from "@/lib/appwrite";
import { TablesDB, Query } from "appwrite";

type HomeCometRow = {
  $id: string;
  name?: string | null;
  designation?: string | null;
  prefix?: string | null;
  orbit_class?: string | null;
  comet_status?: string | null;
  period_years?: number | string | null;
  last_perihelion_year?: number | string | null;
};

type CategorisedComets = {
  periodic: HomeCometRow[];
  longPeriod: HomeCometRow[];
  hyperbolic: HomeCometRow[];
  other: HomeCometRow[];
};

function isHyperbolicRow(row: HomeCometRow): boolean {
  const prefix = row.prefix?.toUpperCase() ?? "";
  const status = row.comet_status?.toLowerCase() ?? "";
  const orbitClass = row.orbit_class?.toLowerCase() ?? "";
  return (
    status.includes("hyperbolic") ||
    status.includes("interstellar") ||
    orbitClass.includes("hyperbolic") ||
    prefix === "I"
  );
}

const GREAT_COMETS_REFERENCE = [
  {
    designation: "C/390 Q1",
    name: "Great Comet of 390 AD",
  },
  {
    designation: "C/442 V1",
    name: "Great Comet of 442 AD",
  },
  {
    designation: "C/568 O1",
    name: "Great Comet of 568 AD",
  },
  {
    designation: "C/770 K1",
    name: "Great Comet of 770 AD",
  },
  {
    designation: "C/905 K1",
    name: "Great Comet of 905 AD",
  },
  {
    designation: "C/1471 Y1",
    name: "Great Comet of 1472",
  },
  {
    designation: "C/1532 R1",
    name: "Great Comet of 1532",
  },
  {
    designation: "C/1577 V1",
    name: "Great Comet of 1577",
  },
  {
    designation: "C/1618 W1",
    name: "Great Comet of 1618",
  },
  {
    designation: "C/1680 V1",
    name: "Great Comet of 1680 (Kirch)",
  },
  {
    designation: "C/1743 X1",
    name: "Klinkenberg-Chéseaux (Great Comet of 1744)",
  },
  {
    designation: "C/1811 F1",
    name: "Great Comet of 1811",
  },
  {
    designation: "C/1843 D1",
    name: "Great Comet of 1843",
  },
  {
    designation: "C/1858 L1",
    name: "Comet Donati (Great Comet of 1858)",
  },
  {
    designation: "C/1882 R1",
    name: "Great Comet of 1882",
  },
  {
    designation: "C/1910 A1",
    name: "Great January Comet of 1910",
  },
  {
    designation: "C/1965 S1",
    name: "Comet Ikeya-Seki (Great Comet of 1965)",
  },
  {
    designation: "C/1995 O1",
    name: "Comet Hale-Bopp",
  },
  {
    designation: "C/2006 P1",
    name: "Comet McNaught (Great Comet of 2007)",
  },
  {
    designation: "C/2020 F3",
    name: "Comet NEOWISE",
  },
] as const;

// (Removed unused constants HEARTBEAT_FLEET and SPIKES_OF_WONDER)

const FLEET_TABS = [
  { key: "p", label: "P-Type", empty: "No periodic comets tracked yet. Add a P-designation to begin your fleet." },
  { key: "c", label: "C-Type", empty: "No long-period comets logged yet. Add a C-designation to chart one." },
  {
    key: "hyperbolic",
    label: "Hyperbolic",
    empty: "No hyperbolic or interstellar visitors recorded yet.",
  },
  { key: "lost", label: "Lost", empty: "No lost or disrupted comets catalogued yet." },
  { key: "asteroidal", label: "Asteroidal", empty: "No asteroidal objects stored with the fleet." },
] as const;

const FLEET_TAB_GUIDE = {
  p: [
    {
      header: "What defines a P-type comet?",
      bullets: [
        "Returns on a known orbital loop within a human planning horizon.",
        "Carries a predictable perihelion cadence we can model and forecast.",
        "Forms the core telemetry set for the Periodic Cockpit.",
      ],
    },
  ],
  c: [
    {
      header: "What is a C-type comet?",
      bullets: [
        "Rare, long-period or hyperbolic visitors.",
        "Blaze through the system once, then drift away.",
        "Often one-time spectacular apparitions.",
      ],
    },
  ],
  hyperbolic: [
    {
      header: "What is a hyperbolic object?",
      bullets: [
        "Follows a trajectory with eccentricity greater than one.",
        "Includes interstellar visitors and hyperbolic asteroids.",
        "Escapes the Sun after a single inbound sweep.",
      ],
    },
  ],
  lost: [
    {
      header: "What does lost mean?",
      bullets: [
        "Historic comet observed previously but no longer recoverable.",
        "Orbit uncertainties or fragmentation prevent re-detection.",
        "Sometimes catalogued with “D” prefix to denote disruption.",
      ],
    },
    {
      header: "Why orbits become unrecoverable",
      bullets: [
        "Non-gravitational forces and outgassing alter trajectory unpredictably.",
        "Observational gaps or low brightness hinder follow-up.",
        "Fragmentation can scatter debris and erase the parent body.",
      ],
    },
  ],
  asteroidal: [
    {
      header: "Why some comets are classified as asteroidal",
      bullets: [
        "Appear inactive with little to no coma or tail.",
        "Dynamically cometary but visually asteroid-like.",
        "May represent dormant or exhausted nuclei.",
      ],
    },
    {
      header: "Typical behavior & distinction",
      bullets: [
        "Stable orbits, occasionally in resonances with planets.",
        "Activity can reignite when closer to the Sun.",
        "Observation focuses on albedo, rotation, and thermal properties.",
      ],
    },
  ],
} as const satisfies Record<
  (typeof FLEET_TABS)[number]["key"],
  readonly { header: string; bullets: readonly string[] }[]
>;

const CLASSIFICATION_SUMMARY = [
  { prefix: "P", label: "Periodic Comet", description: "Returns on a known orbit." },
  { prefix: "C", label: "Long-Period / Great Visitor", description: "One major spectacular passage." },
  { prefix: "D", label: "Lost", description: "Historically observed but orbit not recoverable." },
  { prefix: "A", label: "Asteroidal", description: "Rocky body not producing a coma." },
  { prefix: "I", label: "Interstellar", description: "Free traveler from beyond our Sun." },
] as const;

const PERIOD_TOOLTIP = "Time between observed close passes to the Sun (perihelion).";
const HYPERBOLIC_TOOLTIP = "Likely a one-time visitor from deep interstellar space.";

type FleetTabKey = typeof FLEET_TABS[number]["key"];
type OrbitFilterMode = "p-only" | "p-c-inner";

type OrbitDiagramProps = {
  variant: "periodic" | "great";
};

function PrefixBadge({ prefix }: { prefix?: string | null }) {
  if (!prefix) return null;
  const upper = prefix.toUpperCase();
  const palette: Record<string, string> = {
    P: "bg-emerald-400/20 text-emerald-100 border border-emerald-300/40",
    C: "bg-fuchsia-400/20 text-fuchsia-100 border border-fuchsia-300/40",
    D: "bg-orange-400/20 text-orange-100 border border-orange-300/40",
    A: "bg-slate-400/20 text-slate-100 border border-slate-300/40",
    I: "bg-cyan-400/20 text-cyan-100 border border-cyan-300/40",
  };
  const classes =
    palette[upper] ??
    "bg-white/10 text-white border border-white/20";
  return (
    <span className={`inline-flex min-w-[1.75rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.32em] ${classes}`}>
      {upper}
    </span>
  );
}

type DetailSegment = {
  key: string;
  text: string;
  tooltip?: string;
  className?: string;
};

function buildDetailSegments(row: HomeCometRow, highlightNextPerihelion?: boolean): DetailSegment[] {
  const segments: DetailSegment[] = [];
  const period = formatPeriod(row.period_years);
  if (period) {
    segments.push({ key: "period", text: period, tooltip: PERIOD_TOOLTIP });
  }
  const last = formatLastPerihelion(row.last_perihelion_year);
  if (last) {
    segments.push({ key: "perihelion", text: last });
  }
  if (row.orbit_class) {
    const lower = row.orbit_class.toLowerCase();
    const tooltip = lower.includes("hyperbolic") ? HYPERBOLIC_TOOLTIP : undefined;
    segments.push({ key: "class", text: row.orbit_class, tooltip });
  }
  if (highlightNextPerihelion) {
    const nextSegment = buildNextPerihelionSegment(row);
    if (nextSegment) {
      segments.push(nextSegment);
    }
  }
  return segments;
}

function OrbitDiagram({ variant }: OrbitDiagramProps) {
  const isPeriodic = variant === "periodic";
  const title = isPeriodic ? "Periodic Orbit" : "Great Comet Trajectory";
  const description = isPeriodic
    ? "Elliptical loop returning past the Sun on predictable cadence."
    : "Highly elongated arc — a single flyby.";
  const accent = isPeriodic ? "#66d6ff" : "#ff9dcd";
  const gradientId = `panelGlow-${variant}`;
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-[0_0_25px_rgba(12,24,48,0.35)]">
      <div className="text-[11px] uppercase tracking-[0.35em] text-foreground/55">
        {isPeriodic ? "P-Orbit" : "C-Orbit"}
      </div>
      <div className="mt-2 text-sm font-semibold text-white">{title}</div>
      <p className="mt-1 text-xs text-foreground/70">{description}</p>
      <svg className="mt-3 h-32 w-full text-accent/80" viewBox="0 0 240 160" fill="none">
        <rect x="8" y="8" width="224" height="144" rx="18" fill={`url(#${gradientId})`} opacity="0.12" />
        {isPeriodic ? (
          <g stroke={accent} strokeWidth={2}>
            <circle cx="120" cy="80" r="6" fill="#fbe7a1" stroke="none" />
            <circle cx="120" cy="80" r="26" className="earth-orbit" />
            <circle cx="144" cy="80" r="3.5" fill="#7dd3fc" stroke="none" />
            <ellipse cx="120" cy="80" rx="78" ry="44" fill="none" className="orbit-path" />
            <circle cx="184" cy="105" r="5" fill={accent} stroke="none" />
          </g>
        ) : (
          <g stroke={accent} strokeWidth={2}>
            <circle cx="120" cy="80" r="6" fill="#fbe7a1" stroke="none" />
            <circle cx="120" cy="80" r="26" className="earth-orbit" />
            <path
              d="M-12 112C44 90 98 68 134 66c22-1 44 5 78 30 20 15 28 26 32 34"
              fill="none"
              className="orbit-path"
              strokeWidth={2.4}
            />
            <circle cx="196" cy="78" r="5" fill={accent} stroke="none" />
          </g>
        )}
        <defs>
          <linearGradient id={gradientId} x1="8" y1="8" x2="240" y2="152" gradientUnits="userSpaceOnUse">
            <stop stopColor="#66d6ff" />
            <stop offset="1" stopColor="#b39bff" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function jdToDate(value: unknown): Date | null {
  const numeric = coerceNumber(value);
  if (numeric === null) return null;
  const ms = (numeric - 2440587.5) * 86400000;
  return new Date(ms);
}

function formatUTCDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatCometLabel(row: HomeCometRow): string {
  const name = row.name?.trim();
  const designation = row.designation?.trim();
  const base =
    name && designation && name !== designation
      ? `${name} · ${designation}`
      : name ?? designation ?? row.$id;
  const prefix = row.prefix?.trim();
  return prefix ? `${prefix} · ${base}` : base;
}

function formatPeriod(periodYears: unknown): string | null {
  const numeric = coerceNumber(periodYears);
  if (numeric === null) return null;
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  if (numeric < 1) {
    return `${(numeric * 365.25).toFixed(0)} days`;
  }
  if (numeric < 10) return `${numeric.toFixed(1)} years`;
  return `${Math.round(numeric)} years`;
}

function formatLastPerihelion(reading: unknown): string | null {
  const date = jdToDate(reading);
  if (!date) return null;
  return `Perihelion ${formatUTCDate(date)}`;
}

const MS_PER_YEAR = 365.25 * 86400000;

function computeNextPerihelion(row: HomeCometRow): Date | null {
  const periodYears = coerceNumber(row.period_years);
  const last = jdToDate(row.last_perihelion_year);
  if (!periodYears || !last) return null;
  const periodMs = periodYears * MS_PER_YEAR;
  if (!Number.isFinite(periodMs) || periodMs <= 0) return null;
  const now = new Date();
  let next = new Date(last.getTime());
  if (next.getTime() <= now.getTime()) {
    const diff = now.getTime() - next.getTime();
    const cycles = Math.floor(diff / periodMs) + 1;
    next = new Date(next.getTime() + cycles * periodMs);
  }
  return next;
}

function IntroAudioPlayer({
  src,
  accent = "bg-emerald-400",
}: {
  src: string;
  accent?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => {
      if (!el) return;
      const d = el.duration || 0;
      setDuration(d);
      setProgress(d ? (el.currentTime / d) * 100 : 0);
    };
    const onEnded = () => setPlaying(false);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onTime);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onTime);
      el.removeEventListener("ended", onEnded);
    };
  }, []);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      const p = el.play();
      if (p && typeof p.then === "function") {
        p.then(() => setPlaying(true)).catch(() => setPlaying(false));
      } else {
        setPlaying(true);
      }
    }
  }, [playing]);

  const formattedTime = (secs: number) => {
    if (!Number.isFinite(secs) || secs <= 0) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60)
      .toString()
      .padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <div className="rounded-xl border border-white/10 bg-[#041021]/70 p-3 shadow-[0_6px_18px_rgba(2,8,20,0.6)]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-pressed={playing}
          className={`flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition hover:scale-105 focus-visible:outline-none ${playing ? "ring-2 ring-accent/50" : ""}`}
          title={playing ? "Pause audio" : "Play audio"}
        >
          {playing ? (
            <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="6" y="5" width="4" height="14" fill="currentColor" />
              <rect x="14" y="5" width="4" height="14" fill="currentColor" />
            </svg>
          ) : (
            <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 5v14l11-7z" fill="currentColor" />
            </svg>
          )}
        </button>

        <div className="flex w-full flex-col">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-white">Audio Overview</div>
            <div className="text-xs text-foreground/70">{formattedTime(duration)}</div>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="relative flex-1">
              <div className="h-2 w-full rounded-full bg-white/6">
                <div
                  className={`absolute left-0 top-0 h-2 rounded-full ${accent}`}
                  style={{ width: `${progress}%`, maxWidth: "100%" }}
                />
              </div>
            </div>
            <div className="text-xs text-foreground/60">{formattedTime((duration * progress) / 100)}</div>
          </div>
        </div>
      </div>
      <audio ref={audioRef} preload="none" className="hidden">
        <source src={src} />
        Your browser does not support audio playback.
      </audio>
    </div>
  );
}


function buildNextPerihelionSegment(row: HomeCometRow): DetailSegment | null {
  const prefix = row.prefix?.toUpperCase();
  const status = row.comet_status?.toLowerCase();
  if (prefix !== "P" && status !== "periodic") return null;
  const next = computeNextPerihelion(row);
  if (!next) return null;
  const now = new Date();
  const yearsUntil = Math.max(0, (next.getTime() - now.getTime()) / MS_PER_YEAR);
  let className = "border-slate-400/40 bg-slate-500/15 text-slate-100/80";
  if (yearsUntil <= 1) {
    className = "border-emerald-400/60 bg-emerald-500/20 text-emerald-100";
  } else if (yearsUntil <= 5) {
    className = "border-lime-400/60 bg-lime-500/20 text-lime-100";
  } else if (yearsUntil <= 15) {
    className = "border-sky-400/50 bg-sky-500/20 text-sky-100";
  }
  const label = `Next perihelion ${formatUTCDate(next)}`;
  return {
    key: "next-perihelion",
    text: label,
    tooltip: "Calculated from last perihelion and orbital period.",
    className,
  };
}

function categoriseComets(rows: HomeCometRow[]): CategorisedComets {
  const buckets: CategorisedComets = {
    periodic: [],
    longPeriod: [],
    hyperbolic: [],
    other: [],
  };

  for (const row of rows) {
    const prefix = row.prefix?.toUpperCase() ?? "";
    const status = row.comet_status?.toLowerCase() ?? "";

    if (isHyperbolicRow(row)) {
      buckets.hyperbolic.push(row);
      continue;
    }
    if (prefix === "P" || status === "periodic") {
      buckets.periodic.push(row);
      continue;
    }
    if (prefix === "C" || status === "long-period") {
      buckets.longPeriod.push(row);
      continue;
    }
    if (
      prefix === "A" ||
      prefix === "D" ||
      prefix === "X" ||
      status === "asteroid" ||
      status === "lost" ||
      status === "unreliable"
    ) {
      buckets.other.push(row);
      continue;
    }
    buckets.other.push(row);
  }

  const byLastPerihelionDesc = (a: HomeCometRow, b: HomeCometRow) => {
    const ay = jdToDate(a.last_perihelion_year)?.getTime() ?? Number.NEGATIVE_INFINITY;
    const by = jdToDate(b.last_perihelion_year)?.getTime() ?? Number.NEGATIVE_INFINITY;
    return by - ay;
  };

  const byPeriodAsc = (a: HomeCometRow, b: HomeCometRow) => {
    const ap = coerceNumber(a.period_years) ?? Number.POSITIVE_INFINITY;
    const bp = coerceNumber(b.period_years) ?? Number.POSITIVE_INFINITY;
    if (!Number.isFinite(ap) && !Number.isFinite(bp)) return formatCometLabel(a).localeCompare(formatCometLabel(b));
    if (!Number.isFinite(ap)) return 1;
    if (!Number.isFinite(bp)) return -1;
    return ap - bp;
  };

  buckets.periodic.sort(byPeriodAsc);
  buckets.longPeriod.sort(byLastPerihelionDesc);
  buckets.hyperbolic.sort((a, b) => {
    const ay = jdToDate(a.last_perihelion_year)?.getTime() ?? Number.NEGATIVE_INFINITY;
    const by = jdToDate(b.last_perihelion_year)?.getTime() ?? Number.NEGATIVE_INFINITY;
    if (ay === by) return formatCometLabel(a).localeCompare(formatCometLabel(b));
    return by - ay;
  });
  buckets.other.sort((a, b) => formatCometLabel(a).localeCompare(formatCometLabel(b)));

  return buckets;
}

export default function Home() {
  // Share visible IDs between list and 3D orbits
  const [visibleCometIds] = useState<string[] | null>(null);
  const router = useRouter();
  const launchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tables = useMemo(() => new TablesDB(client), []);
  const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || "astroDB";
  const tableComets = process.env.NEXT_PUBLIC_APPWRITE_TABLE_COMETS || process.env.APPWRITE_TABLE_COMETS || "comets";
  const [catalog, setCatalog] = useState<HomeCometRow[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [classificationOpen, setClassificationOpen] = useState(false);
  const [airlockActive, setAirlockActive] = useState(false);
  const [fleetTab, setFleetTab] = useState<FleetTabKey>("p");
  const [orbitFilter, setOrbitFilter] = useState<OrbitFilterMode>("p-only");
  const airlockTimerRef = useRef<NodeJS.Timeout | null>(null);
  const categories = useMemo(() => categoriseComets(catalog), [catalog]);
  const fleetGroups = useMemo<Record<FleetTabKey, HomeCometRow[]>>(() => {
    const normalizePrefix = (value?: string | null) => (value ? value.toUpperCase() : "");
    const normalizeStatus = (value?: string | null) => (value ? value.toLowerCase() : "");
    const lost = catalog.filter(
      (row) => normalizePrefix(row.prefix) === "D" || normalizeStatus(row.comet_status) === "lost"
    );
    const asteroidal = catalog.filter(
      (row) =>
        !isHyperbolicRow(row) &&
        (normalizePrefix(row.prefix) === "A" || normalizeStatus(row.comet_status) === "asteroid")
    );
    return {
      p: categories.periodic,
      c: categories.longPeriod,
      hyperbolic: categories.hyperbolic,
      lost,
      asteroidal,
    };
  }, [catalog, categories]);
  const renderCategoryList = useCallback(
    (rows: HomeCometRow[], emptyMessage: string, options?: { highlightNextPerihelion?: boolean }) => {
      if (catalogLoading) {
        return (
          <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-5 text-sm text-foreground/70">
            Syncing telemetry from the archive…
          </div>
        );
      }
      if (catalogError) {
        return (
          <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-5 text-sm text-rose-100">
            {catalogError}
          </div>
        );
      }
      if (rows.length === 0) {
        return (
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-foreground/60">
            {emptyMessage}
          </div>
        );
      }
      return (
        <div className="grid gap-2.5">
          {rows.map((row) => {
            const status = row.comet_status?.replace(/-/g, " ");
            const segments = buildDetailSegments(row, options?.highlightNextPerihelion);
            const label = formatCometLabel(row);
            const safePrefix = row.prefix ? row.prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
            const displayLabel =
              row.prefix && label
                ? label.replace(new RegExp(`^${safePrefix}\\s*·\\s*`, "i"), "")
                : label;
            return (
              <div
                key={row.$id}
                className="rounded-2xl border border-white/10 bg-[#0b1020]/70 px-3.5 py-3.5 shadow-[0_0_14px_rgba(14,24,45,0.32)] backdrop-blur"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <PrefixBadge prefix={row.prefix} />
                      <div className="text-sm font-medium text-white">{displayLabel}</div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-foreground/65">
                      {segments.length === 0 ? (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-foreground/60">
                          Telemetry pending
                        </span>
                      ) : (
                        segments.map((segment) => (
                          <span
                            key={`${row.$id}-${segment.key}`}
                            className={`rounded-full px-2 py-1 ${segment.className ?? "border border-white/10 bg-white/5 text-foreground/70"}`}
                            title={segment.tooltip}
                          >
                            {segment.text}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  {status && (
                    <span className="mt-1 text-[10px] uppercase tracking-[0.3em] text-foreground/55">
                      {status}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );
    },
    [catalogLoading, catalogError]
  );

  const handleLaunch = useCallback(() => {
    if (launchTimeoutRef.current) {
      return;
    }
    setAirlockActive(true);
    launchTimeoutRef.current = setTimeout(() => {
      router.push("/cockpit");
      launchTimeoutRef.current = null;
    }, 360);
    if (airlockTimerRef.current) {
      clearTimeout(airlockTimerRef.current);
    }
    airlockTimerRef.current = setTimeout(() => {
      setAirlockActive(false);
      airlockTimerRef.current = null;
    }, 900);
  }, [router]);
  // goToCockpit removed (unused) — use direct router.push where needed
  const goToGreatComets = useCallback(() => {
    router.push("/great-comets");
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const res = await tables.listRows({
          databaseId,
          tableId: tableComets,
          queries: [Query.orderAsc("name"), Query.limit(250)],
        });
        if (cancelled) return;
        const rows = Array.isArray(res.rows) ? (res.rows as HomeCometRow[]) : [];
        setCatalog(rows);
      } catch (err) {
        if (cancelled) return;
        const message = (err as Error)?.message ?? String(err);
        setCatalogError(`Telemetry link failed: ${message}`);
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    }
    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [tables, databaseId, tableComets]);

  useEffect(() => {
    return () => {
      if (launchTimeoutRef.current) {
        clearTimeout(launchTimeoutRef.current);
        launchTimeoutRef.current = null;
      }
      if (airlockTimerRef.current) {
        clearTimeout(airlockTimerRef.current);
        airlockTimerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div className="starfield" />
      {airlockActive && <div className="airlock-overlay pointer-events-none fixed inset-0 z-20" />}

      <main className="relative z-10 mx-auto max-w-5xl px-6 py-14">
        <section className="space-y-6 rounded-[30px] border border-white/12 bg-white/5 px-6 py-8 shadow-[0_0_38px_rgba(10,18,38,0.5)] backdrop-blur sm:px-9">
          <div className="space-y-4">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              astroKapsel by{" "}
              <a
                href="https://github.com/floherzler/astro-kapsel"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-200 underline decoration-emerald-400/50 underline-offset-4 transition hover:text-emerald-100 hover:decoration-emerald-300"
              >
                @floherzler
              </a>
            </h1>
            <p className="text-sm text-foreground/75">
              astroKapsel couples NASA Small-Body Database telemetry with your field notes so you can compare recurring comets with rare visitors in one scientific workspace.
            </p>
            <p className="text-sm text-foreground/70">
              Choose a track below to explore periodic (returning) comets or single-visit flares, then continue with the tools that follow.
            </p>
          </div>

          {/* Intro audio overview placed at section level so it sits above both panels */}
          <div className="mt-4">
            <IntroAudioPlayer src="https://fra.cloud.appwrite.io/v1/storage/buckets/summaryImages/files/introAudio/view?project=68ea4bc00031046d613e" accent="bg-emerald-400" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-6 rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-6 shadow-[0_0_26px_rgba(16,185,129,0.25)]">
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-[0.45em] text-emerald-200/70">Periodic · P-Type</div>
                <p className="text-lg font-semibold text-white">Periodic comets return on closed orbits.</p>
                <p className="text-sm text-emerald-100/80">
                  astroKapsel models their cadence, perihelion epochs, and brightness windows so you can plan follow-up campaigns.
                </p>
              </div>
              <ul className="space-y-2 text-sm text-emerald-100/80">
                <li>• Inspect orbital telemetry and timelines inside the periodic cockpit.</li>
                <li>• Compare historic returns to current observations.</li>
                <li>• Coordinate observation runs with team members.</li>
              </ul>
            </div>

            <div className="flex flex-col gap-6 rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-6 shadow-[0_0_28px_rgba(217,70,239,0.25)]">
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-[0.45em] text-fuchsia-200/80">Single Visit · C-Type</div>
                <p className="text-lg font-semibold text-white">Single-visit comets blaze through once.</p>
                <p className="text-sm text-fuchsia-100/80">
                  Use astroKapsel to archive their apparition geometry, sighting narratives, and cultural context before they fade outward.
                </p>
              </div>
              <ul className="space-y-2 text-sm text-fuchsia-100/80">
                <li>• Capture observation notes and imagery for great comets.</li>
                <li>• Record perihelion timing even when periods are unknown.</li>
                <li>• Prepare story-driven briefs inside the Great Comet Lab.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mt-8 space-y-4 rounded-2xl border border-white/12 bg-white/5 p-5 shadow-[0_0_28px_rgba(10,20,40,0.45)]">
          <div className="text-[11px] uppercase tracking-[0.35em] text-foreground/55">Observation controls</div>
          <p className="text-sm text-foreground/75">
            Add a comet designation to sync telemetry, then open the workspace that fits your analysis.
          </p>
          <div className="mx-auto w-full max-w-xl">
            <AddCometForm className="space-y-2 text-center" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/8 p-4 shadow-[0_0_22px_rgba(16,185,129,0.18)]">
              <div className="text-xs uppercase tracking-[0.35em] text-emerald-200/80">Periodic cockpit</div>
              <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="text-[10px] uppercase tracking-[0.4em] text-foreground/60">Open periodic workspace</div>
                <div className="mt-3">
                  <SlideToLaunch onComplete={handleLaunch} />
                </div>
                <div className="mt-2 text-center text-[9px] uppercase tracking-[0.45em] text-cyan-100/65">
                  Slide to enter the periodic cockpit
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-4 rounded-2xl border border-fuchsia-400/35 bg-fuchsia-500/10 p-4 shadow-[0_0_24px_rgba(192,88,255,0.22)]">
              <div className="text-xs uppercase tracking-[0.35em] text-fuchsia-200/80 text-right">Great comet lab</div>
              <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="text-[10px] uppercase tracking-[0.4em] text-foreground/60">Open single-visit workspace</div>
                <div className="mt-3">
                  <SlideToLaunch onComplete={goToGreatComets} />
                </div>
                <div className="mt-2 text-center text-[9px] uppercase tracking-[0.45em] text-cyan-100/65">
                  Slide to enter the Great Comet Lab
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-white/12 bg-white/5 p-6 shadow-[0_0_28px_rgba(12,24,48,0.35)]">
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.35em] text-foreground/55">Your Fleet</div>
            <h2 className="text-2xl font-semibold text-white">Your Comet Fleet</h2>
            <p className="text-sm text-foreground/70">
              These are the objects you are currently tracking via Appwrite.
            </p>
          </div>
          <Tabs value={fleetTab} onValueChange={(value) => setFleetTab(value as FleetTabKey)} className="mt-6 space-y-4">
            <TabsList className="flex flex-wrap gap-2">
              {FLEET_TABS.map((tab) => (
                <TabsTrigger key={tab.key} value={tab.key}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {FLEET_TABS.map((tab) => {
              const guides = FLEET_TAB_GUIDE[tab.key];
              return (
                <TabsContent key={tab.key} value={tab.key}>
                  <div className="space-y-5">
                    {guides && (
                      <div className="rounded-2xl border border-white/10 bg-[#050c1a]/80 p-4 shadow-[0_0_22px_rgba(10,20,40,0.35)]">
                        <Accordion className="space-y-3">
                          {guides.map((section) => (
                            <AccordionItem
                              key={section.header}
                              header={(open) => (
                                <div
                                  className={`flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition ${open ? "border-accent/40 bg-white/10 shadow-[0_0_18px_rgba(80,175,255,0.25)]" : ""
                                    }`}
                                >
                                  <span>{section.header}</span>
                                  <svg
                                    aria-hidden
                                    className={`h-4 w-4 text-foreground/60 transition-transform duration-200 ${open ? "-rotate-180" : ""
                                      }`}
                                    viewBox="0 0 20 20"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                  >
                                    <path
                                      d="M5.5 7.5L10 12l4.5-4.5"
                                      stroke="currentColor"
                                      strokeWidth="1.6"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                </div>
                              )}
                            >
                              <ul className="list-disc space-y-1.5 pl-5 text-sm text-foreground/70">
                                {section.bullets.map((bullet) => (
                                  <li key={bullet} className="leading-relaxed">
                                    {bullet}
                                  </li>
                                ))}
                              </ul>
                            </AccordionItem>
                          ))}
                        </Accordion>
                      </div>
                    )}
                    {renderCategoryList(fleetGroups[tab.key], tab.empty, {
                      highlightNextPerihelion: tab.key === "p",
                    })}
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
          {/* <div id="fleet-catalog" className="mt-6 rounded-2xl border border-white/10 bg-[#08101c]/85 p-4">
            <CometList onVisibleChange={setVisibleCometIds} />
          </div> */}
        </section>

        <section className="mt-8 rounded-2xl border border-white/12 bg-white/5 p-6 shadow-[0_0_28px_rgba(12,24,48,0.35)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.35em] text-emerald-200/70">3D Orbit Console</div>
              <h3 className="mt-1 text-lg font-semibold text-white">Orbit Trajectories</h3>
              <p className="text-sm text-foreground/70">Visualize the orbits of your tracked comets in real time.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setOrbitFilter("p-only")}
                className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.28em] transition ${orbitFilter === "p-only" ? "border-accent/50 bg-accent/15 text-accent" : "border-white/15 bg-white/5 text-foreground/70 hover:bg-white/10"}`}
              >
                Show P-Type Only
              </button>
              <button
                type="button"
                onClick={() => setOrbitFilter("p-c-inner")}
                className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.28em] transition ${orbitFilter === "p-c-inner" ? "border-fuchsia-400/60 bg-fuchsia-500/15 text-fuchsia-100" : "border-white/15 bg-white/5 text-foreground/70 hover:bg-white/10"}`}
              >
                Show P + C (perihelion &lt; 3 AU)
              </button>
            </div>
          </div>
          {/* <div className="mt-4 rounded-2xl border border-white/10 bg-[#061025]/85 p-3"> */}
          <OrbitView3D onlyIds={visibleCometIds ?? undefined} filterMode={orbitFilter} />
          {/* </div> */}
        </section>

        <section className="mt-8 rounded-2xl border border-white/12 bg-white/5 px-4 py-5 shadow-[0_0_28px_rgba(12,24,48,0.35)]">
          <button
            type="button"
            onClick={() => setClassificationOpen((prev) => !prev)}
            className="flex w-full items-center justify-between px-5 py-4 text-left text-lg font-semibold text-white transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            aria-expanded={classificationOpen}
          >
            <span>How Comets Are Classified</span>
            <span className="font-mono text-lg">{classificationOpen ? "−" : "+"}</span>
          </button>
          {classificationOpen && (
            <div className="space-y-4 border-t border-white/10 px-4 py-5 text-sm text-foreground/75">
              <div className="flex flex-wrap gap-2">
                {CLASSIFICATION_SUMMARY.map((item) => (
                  <span
                    key={item.prefix}
                    className="flex items-center gap-2 rounded-full border border-white/12 bg-[#0d162c]/70 px-3 py-1.5 text-xs text-foreground/75"
                  >
                    <PrefixBadge prefix={item.prefix} />
                    <span className="font-semibold text-white">{item.label}</span>
                    <span className="text-foreground/60">{item.description}</span>
                  </span>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <OrbitDiagram variant="periodic" />
                <OrbitDiagram variant="great" />
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-xs leading-relaxed text-foreground/70">
                Tracking periodic comets teaches us orbital evolution and the material history of the Solar System. Documenting great comets preserves cultural memory and observational heritage. Steward both the rhythm and the spark.
              </div>
            </div>
          )}
        </section>

        <section className="mt-8 rounded-2xl border border-white/12 bg-white/5 p-6 shadow-[0_0_24px_rgba(12,24,48,0.35)]">
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-[0.35em] text-foreground/55">Historic archive</div>
            <h3 className="text-lg font-semibold text-white">Historic Great Comets</h3>
            <p className="text-sm text-foreground/70">Use these to seed narratives in the Great Comet Lab.</p>
          </div>
          <ScrollArea className="mt-4 h-48 rounded-2xl border border-white/10 bg-[#0d162e]/80 p-3">
            <div className="space-y-2">
              {GREAT_COMETS_REFERENCE.map((comet) => (
                <div key={comet.designation} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground/75">
                  <div className="flex items-center gap-3">
                    <PrefixBadge prefix="C" />
                    <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-cyan-100/80">{comet.designation}</span>
                  </div>
                  <span className="text-foreground/80">{comet.name}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </section>

        <section className="mt-8 space-y-4 rounded-2xl border border-white/12 bg-white/5 p-6 shadow-[0_0_24px_rgba(12,24,48,0.35)]">
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.35em] text-foreground/55">Further study</div>
            <h3 className="text-lg font-semibold text-white">Interesting Resources</h3>
            <p className="text-sm text-foreground/70">
              Watch and listen to additional context on comet science and observation practice.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-[#091121]/80 p-4 shadow-[0_0_22px_rgba(12,24,48,0.35)]">
              <div className="text-xs uppercase tracking-[0.35em] text-emerald-200/70">Video Briefing</div>
              <h4 className="mt-2 text-base font-semibold text-white">Interstellar Comet 3i Atlas (2025)</h4>
              <p className="mt-1 text-sm text-foreground/70">
                Latest information on the third (and fastest!) discovered interstellar object.
              </p>
              {/* Centered iframe with reduced padding to visually match the design */}
              <div className="mt-4">
                <div className="relative mx-auto aspect-video w-full max-w-3xl overflow-hidden rounded-xl border border-white/10 bg-black/40">
                  <iframe
                    title="Space Race - What Is Actually Happening With 3i Atlas?"
                    src="https://www.youtube.com/embed/BNfIPVjQwEA"
                    className="absolute inset-0 h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#0b1326]/80 p-4 shadow-[0_0_22px_rgba(18,30,60,0.35)]">
              <div className="text-xs uppercase tracking-[0.35em] text-fuchsia-200/70">Podcast Episode</div>
              <h4 className="mt-2 text-base font-semibold text-white">Astronomy Cast #768 — Comets</h4>
              <p className="mt-1 text-sm text-foreground/70">
                An audio primer on comet unpredictability, observation timing, and historical apparitions.
              </p>
              {/* Centered podcast embed with no padding */}
              <div className="mt-4">
                <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-xl border border-white/10 bg-black/40 p-0 flex items-center justify-center">
                  <iframe
                    title="Astronomy Cast #768 - Comets: Unpredictability"
                    src="https://play.libsyn.com/embed/episode/id/38638455/height/200/theme/modern/thumbnail/yes/direction/backward/download/yes/font-color/ffffff/height_adjust/true"
                    className="block w-full h-full max-h-[120px]"
                    style={{ border: "none", display: "block" }}
                    scrolling="no"
                    allow="autoplay; fullscreen"
                  />
                </div>
              </div>
            </div>
            {/* Ambient strip — minimal, no title/description/padding */}
            <div className="lg:col-span-2 mt-2 p-0">
              {/* Responsive 16:9 embed: uses padding-top trick for a 56.25% (16:9) aspect ratio */}
              <div className="relative w-full rounded-md overflow-hidden" style={{ paddingTop: "56.25%" }}>
                <iframe
                  title="Ambient Comet Audio/Visual"
                  src="https://www.youtube.com/embed/pLBda_P7leU?rel=0&modestbranding=1"
                  className="absolute inset-0 h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
