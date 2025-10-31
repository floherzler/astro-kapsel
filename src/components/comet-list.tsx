"use client";

import React, { useEffect, useState, useMemo, useCallback, type CSSProperties } from "react";
import client from "@/lib/appwrite";
import { TablesDB, Query, Functions } from "appwrite";
import type { Models } from "appwrite";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dropdown } from "@/components/ui/dropdown";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";

type CometRow = {
  $id: string;
  name?: string | null;
  designation?: string | null;
  orbit_class?: string | null;
  period_years?: number | null;
  last_perihelion_year?: number | null;
  source?: string | null;
  prefix?: string | null;
  comet_status?: string | null;
  is_viable?: boolean | null;
};

type StatusKey = "viable" | "lost" | "unreliable" | "asteroid" | "hyperbolic" | "interstellar" | "unknown";
type StatusFilterKey = "all" | "viable" | "lost" | "asteroid" | "hyperbolic" | "interstellar";
type PrefixKey = "P" | "C" | "D" | "X" | "A" | "I";
type CometSuggestion = {
  designation?: string | null;
  name?: string | null;
  suggestion_label: string;
};

type CountdownDisplay = {
  label: string;
  className: string;
  rowStyle?: CSSProperties;
};

const STATUS_CONFIG: Record<
  Exclude<StatusKey, "viable">,
  { label: string; className: string; description: string }
> = {
  lost: {
    label: "LOST",
    className: "border border-red-500/60 bg-red-500/10 text-red-200/90",
    description: "Object believed lost or disrupted; orbit no longer observable.",
  },
  unreliable: {
    label: "UNCERTAIN",
    className: "border border-amber-400/60 bg-amber-500/10 text-amber-100",
    description: "Highly uncertain orbital elements; treat predictions with caution.",
  },
  asteroid: {
    label: "NOT A COMET",
    className: "border border-slate-500/60 bg-slate-800/50 text-slate-200/90",
    description: "Asteroidal object recorded for reference; not an active comet.",
  },
  hyperbolic: {
    label: "HYPERBOLIC",
    className: "border border-fuchsia-500/70 bg-fuchsia-500/15 text-fuchsia-100",
    description: "Unbound trajectory; object will not return.",
  },
  interstellar: {
    label: "INTERSTELLAR",
    className: "border border-yellow-400/70 bg-yellow-500/15 text-yellow-100",
    description: "Visitor from outside the solar system on a one-off passage.",
  },
  unknown: {
    label: "UNKNOWN",
    className: "border border-slate-600/60 bg-slate-900/40 text-slate-200/80",
    description: "Status not yet classified.",
  },
};

const STATUS_FILTERS: Array<{ key: Exclude<StatusFilterKey, "all">; label: string; description: string }> = [
  { key: "viable", label: "Viable Comets", description: "Periodic or long-period comets with returning flybys." },
  { key: "lost", label: "Lost", description: "Disintegrated or no longer trackable comets." },
  { key: "asteroid", label: "Asteroid-like", description: "Asteroidal bodies catalogued for reference." },
  { key: "hyperbolic", label: "Hyperbolic", description: "One-off visitors on unbound trajectories." },
  { key: "interstellar", label: "Interstellar", description: "Objects entering from beyond the solar system." },
];

const PREFIX_INFO: Record<PrefixKey, { title: string; description: string }> = {
  P: { title: "P", description: "Short/medium-period returning comet (P-class)." },
  C: { title: "C", description: "Long-period returning comet (C-class)." },
  D: { title: "D", description: "Lost or disrupted comet (D-class)." },
  X: { title: "X", description: "Orbit elements uncertain (X-class)." },
  A: { title: "A", description: "Asteroidal object misclassified as a comet (A-class)." },
  I: { title: "I", description: "Interstellar object on an unbound trajectory (I-class)." },
};

const VIABLE_TOOLTIP = {
  title: "PERIODIC / RETURNING",
  description: "Active comet with reliable returns. Flybys, summaries, and countdowns are available.",
};

const NON_VIABLE_COUNTDOWN: CountdownDisplay = {
  label: "—",
  className: "border-slate-700/60 bg-slate-900/40 text-foreground/60",
  rowStyle: undefined,
};

function normalizeStatus(status?: string | null, isViable?: boolean | null): StatusKey {
  if (isViable) return "viable";
  const key = (status ?? "").toString().toLowerCase();
  if (key === "lost") return "lost";
  if (key === "unreliable") return "unreliable";
  if (key === "asteroid") return "asteroid";
  if (key === "hyperbolic" || key === "hyperbola") return "hyperbolic";
  if (key === "interstellar") return "interstellar";
  if (key === "periodic" || key === "long-period") return "viable";
  return "unknown";
}

function getPrefixInfo(prefix?: string | null) {
  if (!prefix) return null;
  const key = prefix.toUpperCase() as PrefixKey;
  return PREFIX_INFO[key] ?? null;
}

type CometListVariant = "default" | "compact";
type DurationBucket = { key: string; label: string; min?: number; max?: number };
type ExecutionWithExtras = Models.Execution & {
  statusCode?: unknown;
  response?: unknown;
  stdout?: unknown;
  result?: unknown;
};

function formatCometLabelFromPayload(row: Partial<CometRow> | undefined): string | null {
  if (!row) return null;
  const name = row.name?.trim();
  const designation = row.designation?.trim();
  if (name && designation && name !== designation) return `${name} · ${designation}`;
  return name ?? designation ?? null;
}

async function pollExecutionCompletion(
  functions: Functions,
  functionId: string,
  executionId: string,
  initial: Models.Execution,
  logUpdate?: (status: string) => void
): Promise<ExecutionWithExtras> {
  let current = initial as ExecutionWithExtras;
  const terminal = new Set(["completed", "failed", "errored", "cancelled", "aborted"]);
  const maxAttempts = 12;
  const delayMs = 1000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (terminal.has((current.status ?? "").toLowerCase())) {
      return current;
    }
    logUpdate?.(current.status ?? "waiting");
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    current = (await functions.getExecution(functionId, executionId)) as ExecutionWithExtras;
  }
  return current;
}

function coerceFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function getExecutionStatusCode(execution: ExecutionWithExtras): number | undefined {
  return coerceFiniteNumber(execution.responseStatusCode) ?? coerceFiniteNumber(execution.statusCode);
}

function getExecutionResponseBody(execution: ExecutionWithExtras): string {
  const candidates = [execution.responseBody, execution.response, execution.stdout, execution.result];
  for (const candidate of candidates) {
    if (candidate == null) continue;
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  for (const candidate of candidates) {
    if (candidate == null) continue;
    return String(candidate);
  }
  return "";
}

function jdNow(): number {
  return Date.now() / 86400000 + 2440587.5;
}

function jdToDate(jd: number): Date {
  const ms = (jd - 2440587.5) * 86400000;
  return new Date(ms);
}

function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function lastNextPerihelion(tpJD?: number | null, periodYears?: number | null): { last?: string; next?: string } {
  if (!tpJD || !periodYears || periodYears <= 0) return {};
  const Pdays = periodYears * 365.25;
  const now = jdNow();
  const k = Math.floor((now - tpJD) / Pdays);
  let lastJD = tpJD + k * Pdays;
  if (lastJD > now) lastJD -= Pdays;
  const nextJD = lastJD + Pdays;
  return { last: formatDate(jdToDate(lastJD)), next: formatDate(jdToDate(nextJD)) };
}

function nextPerihelionJD(tpJD?: number | null, periodYears?: number | null): number | null {
  if (!tpJD || !periodYears || periodYears <= 0) return null;
  const Pdays = periodYears * 365.25;
  const now = jdNow();
  const k = Math.floor((now - tpJD) / Pdays);
  let lastJD = tpJD + k * Pdays;
  if (lastJD > now) lastJD -= Pdays;
  return lastJD + Pdays;
}

function lastPerihelionJD(tpJD?: number | null, periodYears?: number | null): number | null {
  if (!tpJD || !periodYears || periodYears <= 0) return null;
  const Pdays = periodYears * 365.25;
  const now = jdNow();
  const k = Math.floor((now - tpJD) / Pdays);
  let lastJD = tpJD + k * Pdays;
  if (lastJD > now) lastJD -= Pdays;
  return lastJD;
}

function formatCountdown(nextJD: number | null): CountdownDisplay {
  if (!nextJD) {
    return { label: "—", className: "bg-white/5 border-white/10 text-foreground/70", rowStyle: undefined };
  }
  const now = jdNow();
  const dtDays = nextJD - now;
  // Extremely soon
  if (dtDays <= 0.5) {
    return {
      label: "today",
      className: "bg-gradient-to-br from-rose-500/40 to-orange-400/30 text-white border border-rose-400/50 shadow-[0_0_22px_rgba(255,107,107,0.35)]",
      rowStyle: {
        boxShadow: `0 0 26px rgba(255,107,107,0.35)`,
        borderColor: `rgba(255,107,107,0.45)`,
      },
    };
  }
  // Choose nearest single unit (days, months, or years)
  const days = Math.max(1, Math.round(dtDays));
  const months = Math.max(1, Math.round(dtDays / 30.44));
  const years = Math.max(1, Math.round(dtDays / 365.25));

  // Thresholds: show days if < 32 days; months if >= 32 days and < ~6 months; years if >= ~6 months
  let label = "";
  if (dtDays >= 365.25 / 2) {
    label = years === 1 ? "in 1 year" : `in ${years} years`;
  } else if (dtDays >= 32) {
    label = months === 1 ? "in 1 month" : `in ${months} months`;
  } else {
    label = days === 1 ? "in 1 day" : `in ${days} days`;
  }

  // Styling tiers by proximity
  if (dtDays <= 32) {
    const t = Math.max(0, Math.min(1, (32 - dtDays) / 32));
    const r = Math.round(129 + (255 - 129) * t);
    const g = Math.round(212 + (107 - 212) * t);
    const b = Math.round(250 + (107 - 250) * t);
    const alpha = 0.16 + 0.22 * t;
    const rad = 14 + 12 * t;
    return {
      label,
      className: dtDays <= 15
        ? "bg-gradient-to-br from-rose-500/35 via-orange-400/25 to-amber-300/10 text-white border-transparent"
        : dtDays <= 45
          ? "bg-gradient-to-r from-orange-400/30 to-amber-300/15 text-white border-transparent"
          : "bg-[#1a2238]/40 text-foreground/80 border border-[#344056]/40",
      rowStyle: {
        boxShadow: `0 0 ${rad}px rgba(${r},${g},${b},${alpha})`,
        borderColor: `rgba(${r},${g},${b},${Math.min(0.45, 0.2 + 0.25 * t)})`,
      },
    };
  }
  if (dtDays <= 182.5) {
    return {
      label,
      className: "bg-gradient-to-tr from-amber-400/25 to-amber-300/10 text-amber-100 border border-amber-300/30",
      rowStyle: { boxShadow: `0 0 16px rgba(245,196,67,0.14)`, borderColor: `rgba(245,196,67,0.25)` },
    };
  }
  if (dtDays <= 5 * 365.25) {
    return {
      label,
      className: "bg-gradient-to-br from-accent/20 to-accent/5 text-accent border border-accent/30 shadow-[0_0_12px_rgba(110,203,255,0.2)]",
      rowStyle: { boxShadow: `0 0 12px rgba(110,203,255,0.16)`, borderColor: `rgba(110,203,255,0.3)` },
    };
  }
  return { label, className: "bg-[#1a2238]/40 border-[#344056]/40 text-foreground/80", rowStyle: undefined };
}

export default function CometList({
  onVisibleChange,
  variant = "default",
}: {
  onVisibleChange?: (ids: string[]) => void;
  variant?: CometListVariant;
}) {
  const isCompact = variant === "compact";
  const [comets, setComets] = useState<CometRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [submitValue, setSubmitValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [blast, setBlast] = useState(false);
  // trigger periodic re-render to keep countdown fresh
  const [, setNowTick] = useState<number>(Date.now());
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>("all");
  const DURATION_BUCKETS = useMemo<DurationBucket[]>(
    () => [
      { key: "lt10", label: "< 10y", max: 10 },
      { key: "10to25", label: "10–25y", min: 10, max: 25 },
      { key: "25to50", label: "25–50y", min: 25, max: 50 },
      { key: "50to100", label: "50–100y", min: 50, max: 100 },
      { key: "100to200", label: "100–200y", min: 100, max: 200 },
      { key: "200to500", label: "200–500y", min: 200, max: 500 },
      { key: "gt500", label: "> 500y", min: 500 },
    ],
    []
  );
  const [selectedBuckets, setSelectedBuckets] = useState<string[]>([]);
  const [addNotice, setAddNotice] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<CometSuggestion[]>([]);
  // inline info replaces button
  // filters apply in realtime
  const [sortKey, setSortKey] = useState<"id" | "family" | "period" | "last" | "next" | "countdown">("countdown");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const activeFilterCount = (statusFilter === "all" ? 0 : 1) + selectedBuckets.length;

  const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || "astroDB";
  const tableId = process.env.NEXT_PUBLIC_APPWRITE_TABLE_COMETS || "comets";

  const tables = useMemo(() => new TablesDB(client), []);
  const functions = useMemo(() => new Functions(client), []);

  // const ORBIT_INFO: Record<string, { short: string; url?: string }> = {
  //   jfc: {
  //     short:
  //       "Jupiter-family comets (P < 20y; 2 < T_J < 3) are controlled by Jupiter and likely originate in the Kuiper Belt/Scattered Disk.",
  //     url: "https://en.wikipedia.org/wiki/Jupiter-family_comet",
  //   },
  //   encke: {
  //     short:
  //       "Encke-type are JFCs with aphelion Q < 4 AU (e.g., 2P/Encke), effectively decoupled from strong Jupiter encounters.",
  //     url: "https://en.wikipedia.org/wiki/2P/Encke",
  //   },
  //   halley: {
  //     short:
  //       "Halley-type comets (20–200y) have higher inclinations (often retrograde) and are thought to come from the Oort Cloud.",
  //     url: "https://en.wikipedia.org/wiki/Halley-type_comet",
  //   },
  //   lpc: {
  //     short:
  //       "Long-period comets (P > 200y) are near-parabolic and isotropically distributed, consistent with an Oort Cloud origin.",
  //     url: "https://en.wikipedia.org/wiki/Long-period_comet",
  //   },
  //   spc: {
  //     short: "Short-period comets (P < 200y) include Jupiter-family and Halley-type comets.",
  //     url: "https://en.wikipedia.org/wiki/Short-period_comet",
  //   },
  //   hyperbolic: {
  //     short: "Hyperbolic comets (e ≥ 1) are on unbound trajectories and may be interstellar.",
  //     url: "https://en.wikipedia.org/wiki/Interstellar_comet",
  //   },
  //   nearparabolic: {
  //     short: "Near-parabolic comets have eccentricities very close to 1 and extremely long periods.",
  //   },
  //   nonperiodic: {
  //     short: "Non-periodic comets are observed once; they typically have P » 200 years or unbound orbits.",
  //   },
  // };

  // function normalizeClassName(name: string): string {
  //   const s = name.toLowerCase();
  //   if (s.includes("jupiter") && s.includes("family")) return "jfc";
  //   if (s.includes("encke")) return "encke";
  //   if (s.includes("halley")) return "halley";
  //   if (s.includes("long") && s.includes("period")) return "lpc";
  //   if (s.includes("short") && s.includes("period")) return "spc";
  //   if (s.includes("hyperbolic")) return "hyperbolic";
  //   if (s.includes("near") && s.includes("parabolic")) return "nearparabolic";
  //   if (s.includes("non") && s.includes("period")) return "nonperiodic";
  //   return s.trim();
  // }
  const sortRows = useCallback(
    (rows: CometRow[]): CometRow[] => {
      const dir = sortDir === "asc" ? 1 : -1;
      const now = jdNow();
      const keyVal = (r: CometRow): number | string => {
        switch (sortKey) {
          case "id":
            return (r.designation ?? r.name ?? r.$id).toString().toLowerCase();
          case "family":
            return (r.orbit_class ?? "").toLowerCase();
          case "period":
            return typeof r.period_years === "number"
              ? r.period_years
              : Number(r.period_years ?? Number.POSITIVE_INFINITY);
          case "last": {
            const jd = lastPerihelionJD(r.last_perihelion_year ?? null, r.period_years ?? null);
            return jd ?? Number.NEGATIVE_INFINITY;
          }
          case "next": {
            const jd = nextPerihelionJD(r.last_perihelion_year ?? null, r.period_years ?? null);
            return jd ?? Number.POSITIVE_INFINITY;
          }
          case "countdown": {
            if (!r.is_viable) return Number.POSITIVE_INFINITY;
            const jd = nextPerihelionJD(r.last_perihelion_year ?? null, r.period_years ?? null);
            return jd ? jd - now : Number.POSITIVE_INFINITY;
          }
          default:
            return r.$id;
        }
      };
      return [...rows].sort((a, b) => {
        const va = keyVal(a);
        const vb = keyVal(b);
        if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * dir;
        const na = Number(va);
        const nb = Number(vb);
        if (Number.isNaN(na) && Number.isNaN(nb)) return 0;
        if (Number.isNaN(na)) return 1;
        if (Number.isNaN(nb)) return -1;
        if (na === nb) return 0;
        return na < nb ? -1 * dir : 1 * dir;
      });
    },
    [sortDir, sortKey]
  );

  const fetchRows = useCallback(async () => {
    try {
      setLoading(true);
      const queries: string[] = [Query.limit(400)];
      if (statusFilter === "viable") {
        queries.push(Query.equal("is_viable", [true]));
      } else if (statusFilter !== "all") {
        queries.push(Query.equal("comet_status", [statusFilter]));
      }
      const res = await tables.listRows({ databaseId, tableId, queries });
      let rows = res.rows as CometRow[];
      if (selectedBuckets.length > 0) {
        rows = rows.filter((r) => {
          const p = typeof r.period_years === "number" ? r.period_years : Number(r.period_years);
          if (!isFinite(p)) return false;
          return selectedBuckets.some((key) => {
            const b = DURATION_BUCKETS.find((d) => d.key === key);
            if (!b) return false;
            if (b.min != null && p < b.min) return false;
            if (b.max != null && p >= b.max) return false;
            return true;
          });
        });
      }
      rows = sortRows(rows);
      setComets(rows);
      if (onVisibleChange) onVisibleChange(rows.map((r) => r.$id));
    } catch (e: unknown) {
      setListError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [databaseId, tableId, tables, statusFilter, selectedBuckets, sortRows, onVisibleChange, DURATION_BUCKETS]);

  useEffect(() => {
    let unsub: (() => void) | undefined;

    async function init() {
      await fetchRows();

      try {
        // Subscribe to realtime changes on this table
        unsub = client.subscribe(
          `databases.${databaseId}.tables.${tableId}.rows`,
          async (event: { events?: string[] }) => {
            const evs = event?.events ?? [];
            const mutate = evs.some((e) => /\.(create|update|delete)$/.test(e));
            if (mutate) {
              await fetchRows();
            }
          }
        );
      } catch (e) {
        // Swallow subscribe errors silently to prevent UI breakage
        console.warn("Realtime subscribe failed", e);
      }
    }

    init();
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [databaseId, tableId, tables, fetchRows]);

  // Reapply filters/sorting on change
  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    if (activeFilterCount > 0) {
      setFiltersExpanded(true);
    }
  }, [activeFilterCount]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cometID = submitValue.trim();
    if (!cometID) return;
    setSubmitting(true);
    setSubmitMsg(null);
    setSubmitError(null);
    setSuggestions([]);
    try {
      const functionId = "addComet";
      if (!functionId) throw new Error("Missing APPWRITE_ADD_COMET env variable");

      let exec = (await functions.createExecution({ functionId, body: JSON.stringify({ cometID }) })) as ExecutionWithExtras;
      if (exec.status !== "completed") {
        setSubmitMsg(`Execution status: ${exec.status}. Processing…`);
        exec = await pollExecutionCompletion(functions, functionId, exec.$id, exec, (status) => {
          setSubmitMsg(`Execution status: ${status}. Processing…`);
        });
      }
      if (exec.status !== "completed") {
        setSubmitMsg(`Execution status: ${exec.status}`);
        setSuggestions([]);
        setAddNotice(null);
        setSubmitValue("");
        return;
      }

      // Some SDK versions use different property names on the execution result;
      // use helper functions to normalize fields across SDK versions.
      const execution = exec as ExecutionWithExtras;
      const statusCode = getExecutionStatusCode(execution);
      const rawResponse = getExecutionResponseBody(execution);
      let parsed: Record<string, unknown> | undefined;
      if (rawResponse) {
        try {
          const candidate = JSON.parse(rawResponse);
          if (candidate && typeof candidate === "object") {
            parsed = candidate as Record<string, unknown>;
          }
        } catch {
          parsed = undefined;
        }
      }
      const parsedError = typeof parsed?.error === "string" ? (parsed.error as string) : undefined;
      const parsedMessage = typeof parsed?.message === "string" ? (parsed.message as string) : undefined;
      const responseMessage = parsedError ?? parsedMessage ?? (!parsed && rawResponse ? rawResponse : undefined);

      if (typeof statusCode === "number" && Number.isFinite(statusCode) && statusCode >= 400) {
        const multiMatch = parsed?.reason === "multiple_matches" && Array.isArray(parsed?.suggestions);
        setSubmitError(responseMessage ?? `Execution failed with status ${statusCode}`);
        setSubmitMsg(null);
        setAddNotice(null);
        setSuggestions(multiMatch ? (parsed!.suggestions as CometSuggestion[]) : []);
      } else {
        const addedComet = parsed?.comet as Partial<CometRow> | undefined;
        const cometLabel = formatCometLabelFromPayload(addedComet);
        const successMsg =
          parsedMessage && parsedMessage.length > 0
            ? parsedMessage
            : cometLabel
              ? `☄️ ${cometLabel} ready for the cockpit`
              : "☄️ Comet added successfully";
        setSubmitMsg(successMsg);
        setBlast(true);
        setTimeout(() => setBlast(false), 1200);
        setSuggestions([]);
        const cometCandidate = parsed?.comet as Partial<CometRow> | undefined;
        if (cometCandidate) {
          if (cometCandidate.is_viable === false) {
            setAddNotice("Note: This object is catalogued, but is not a returning comet. Visualizations and summaries are limited.");
          } else {
            setAddNotice(null);
          }
        } else {
          setAddNotice(null);
        }
      }
      setSubmitValue("");
    } catch (err: unknown) {
      setSubmitError(String((err as Error)?.message ?? err));
      setAddNotice(null);
      setSuggestions([]);
    } finally {
      setSubmitting(false);
    }
  }

  // tick every minute to keep countdowns fresh
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  // Resort on sort control changes
  useEffect(() => {
    if (comets.length === 0) return;
    const sorted = sortRows(comets);
    setComets(sorted);
    if (onVisibleChange) onVisibleChange(sorted.map((r) => r.$id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKey, sortDir]);

  // Auto-hide transient submit messages
  useEffect(() => {
    if (!submitMsg) return;
    const t = setTimeout(() => setSubmitMsg(null), 4500);
    return () => clearTimeout(t);
  }, [submitMsg]);
  useEffect(() => {
    if (!submitError) return;
    const t = setTimeout(() => setSubmitError(null), 6000);
    return () => clearTimeout(t);
  }, [submitError]);

  const renderedList = (items: CometRow[]) => (
    <Accordion className="space-y-2">
      {items.map((c) => {
        const statusKey = normalizeStatus(c.comet_status, c.is_viable);
        const statusConfig = statusKey === "viable" ? null : STATUS_CONFIG[statusKey];
        const info = lastNextPerihelion(c.last_perihelion_year ?? null, c.period_years ?? null);
        const isViable = Boolean(c.is_viable);
        const nextJD = isViable ? nextPerihelionJD(c.last_perihelion_year ?? null, c.period_years ?? null) : null;
        const countdown = isViable ? formatCountdown(nextJD) : NON_VIABLE_COUNTDOWN;
        const rowStyle = isViable ? countdown.rowStyle : undefined;
        const prefixInfo = getPrefixInfo(c.prefix);
        const displayName = c.name ?? c.designation ?? c.$id;
        const detailNext = isViable ? info.next ?? "—" : "No recurring perihelion cycle";
        const detailFooter = isViable
          ? "> telemetry slot reserved for future flyby data"
          : "> flybys disabled — classification is non-viable";
        const badgeLabel = statusKey === "viable" ? "Countdown" : "Classification";
        const badgeTitle = statusKey === "viable" ? VIABLE_TOOLTIP.title : statusConfig?.label ?? "UNKNOWN";
        const badgeDescription =
          statusKey === "viable" ? VIABLE_TOOLTIP.description : statusConfig?.description ?? "Classification unavailable.";
        const badgeClassName =
          statusKey === "viable"
            ? `border ${countdown.className}`
            : statusConfig?.className ?? "border border-slate-600/60 bg-slate-900/40 text-slate-200/80";
        const badgeValue = statusKey === "viable" ? countdown.label : statusConfig?.label ?? "UNKNOWN";
        const header = (open: boolean) => (
          <div className={`group rounded-md border border-transparent bg-[#0b1020]/60 hover:bg-[#0b1020]/80 transition-colors`} style={rowStyle}>
            <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <span aria-hidden className={`text-foreground/60 transition-transform select-none ${open ? "rotate-90" : ""}`}>▸</span>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    {prefixInfo ? (
                      <Tooltip>
                        <TooltipTrigger
                          asChild
                          className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/80"
                        >
                          <span>{prefixInfo.title}</span>
                        </TooltipTrigger>
                        <TooltipContent
                          align="start"
                          sideOffset={10}
                          className="max-w-xs border border-white/10 bg-slate-950/95 px-3 py-2 text-[11px] leading-relaxed text-foreground/80 shadow-[0_20px_60px_-35px_rgba(110,203,255,0.6)]"
                        >
                          <div className="text-[10px] uppercase tracking-[0.35em] text-cyan-200/80">{prefixInfo.title}</div>
                          <div className="mt-1 text-xs text-foreground/80">{prefixInfo.description}</div>
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                    <span className="min-w-0 truncate font-medium">{displayName}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-foreground/60">
                    {typeof c.period_years === "number" ? `Period ≈ ${c.period_years.toFixed(2)}y` : "Period unknown"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-right">
                <span className="text-xs text-foreground/60">{badgeLabel}</span>
                <HoverCard>
                  <HoverCardTrigger className="inline-flex">
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.3em] ${badgeClassName}`}>
                      {badgeValue}
                    </span>
                  </HoverCardTrigger>
                  <HoverCardContent
                    align="end"
                    sideOffset={10}
                    className="max-w-xs border border-white/10 bg-slate-950/95 px-3 py-2 text-[12px] leading-relaxed text-foreground/80 shadow-[0_22px_55px_-35px_rgba(110,203,255,0.65)]"
                  >
                    <div className="text-[10px] uppercase tracking-[0.35em] text-cyan-200/80">{badgeTitle}</div>
                    <div className="mt-1 text-sm text-foreground/85">{badgeDescription}</div>
                    {statusKey === "viable" && detailNext !== "—" ? (
                      <div className="mt-2 text-xs text-cyan-200/75">Next perihelion: {detailNext}</div>
                    ) : null}
                  </HoverCardContent>
                </HoverCard>
              </div>
            </div>
          </div>
        );
        return (
          <AccordionItem key={c.$id} header={header}>
            <div className="space-y-4 rounded-md border border-accent/20 bg-[#0b1020]/70 px-4 py-4 shadow-[0_0_12px_rgba(110,203,255,0.12)]">
              <div className="grid grid-cols-1 gap-3 text-xs text-foreground/70 sm:grid-cols-2">
                <div>
                  <div className="uppercase tracking-[0.3em] text-foreground/50">Orbit class</div>
                  <div className="mt-1 text-sm text-foreground/80">{c.orbit_class ?? "—"}</div>
                </div>
                <div>
                  <div className="uppercase tracking-[0.3em] text-foreground/50">Source</div>
                  <div className="mt-1 text-sm text-foreground/80">{c.source ?? "—"}</div>
                </div>
                <div>
                  <div className="uppercase tracking-[0.3em] text-foreground/50">Last perihelion</div>
                  <div className="mt-1 text-sm text-foreground/80">{info.last ?? "—"}</div>
                </div>
                <div>
                  <div className="uppercase tracking-[0.3em] text-foreground/50">Next perihelion</div>
                  <div className="mt-1 text-sm text-foreground/80">{detailNext}</div>
                </div>
              </div>
              <div className="font-mono text-[11px] tracking-wide text-accent/80">{detailFooter}</div>
            </div>
          </AccordionItem>
        );
      })}
    </Accordion>
  );

  if (isCompact) {
    return (
      <div className="flex h-full flex-col px-2 pb-2 pt-1 text-[11px] text-foreground/80">
        <ScrollArea className="h-full" viewportClassName="max-h-[10.5rem] pr-1">
          {renderedList(comets)}
        </ScrollArea>
      </div>
    );
  }

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>Comets</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-[0.25em] text-slate-300/70">Filters</div>
            <button
              type="button"
              onClick={() => setFiltersExpanded((open) => !open)}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-foreground/80 transition hover:bg-white/10 sm:hidden"
            >
              {filtersExpanded ? "Hide" : "Show"}
              {activeFilterCount > 0 && (
                <span className="inline-flex h-5 min-w-[1.4rem] items-center justify-center rounded-full bg-cyan-500/30 px-1 text-xs font-medium text-cyan-100">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
          <div className={`mt-3 space-y-3 sm:mt-2 sm:space-y-0 ${filtersExpanded ? "block" : "hidden"} sm:block`}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-white/10 bg-white/5 p-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-300/70">Object type</div>
                <div className="mt-2">
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible">
                    <button
                      type="button"
                      className={`flex-shrink-0 rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] transition-colors ${
                        statusFilter === "all"
                          ? "border-cyan-500/40 bg-cyan-500/20 text-cyan-100"
                          : "border-slate-700/60 text-slate-300/80 hover:bg-slate-800/60"
                      }`}
                      onClick={() => setStatusFilter("all")}
                    >
                      All
                    </button>
                    <ToggleGroup
                      type="single"
                      value={statusFilter === "all" ? "" : statusFilter}
                      onValueChange={(value) => setStatusFilter((value as StatusFilterKey) || "all")}
                      className="flex flex-nowrap gap-2 md:flex-wrap"
                    >
                      {STATUS_FILTERS.map((filter) => (
                        <ToggleGroupItem
                          key={filter.key}
                          value={filter.key}
                          title={filter.description}
                          className="flex-shrink-0 whitespace-nowrap rounded-full border border-slate-700/60 px-3 py-1 text-[11px] uppercase tracking-[0.2em] data-[state=on]:border-cyan-500/40 data-[state=on]:bg-cyan-500/15 data-[state=on]:text-cyan-100 md:flex-shrink"
                        >
                          {filter.label}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>
                </div>
              </div>
              <div className="rounded-md border border-white/10 bg-white/5 p-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-300/70">Duration buckets</div>
                <div className="mt-2">
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible">
                    <button
                      type="button"
                      className={`flex-shrink-0 rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] transition-colors ${
                        selectedBuckets.length === 0
                          ? "border-cyan-500/40 bg-cyan-500/20 text-cyan-100"
                          : "border-slate-700/60 text-slate-300/80 hover:bg-slate-800/60"
                      }`}
                      onClick={() => setSelectedBuckets([])}
                    >
                      All
                    </button>
                    <ToggleGroup
                      type="multiple"
                      value={selectedBuckets}
                      onValueChange={(v) => setSelectedBuckets(v as string[])}
                      className="flex flex-nowrap gap-2 md:flex-wrap"
                    >
                      {DURATION_BUCKETS.map((b) => (
                        <ToggleGroupItem
                          key={b.key}
                          value={b.key}
                          title={b.label}
                          className="flex-shrink-0 whitespace-nowrap rounded-full border border-slate-700/60 px-3 py-1 text-[11px] uppercase tracking-[0.2em] data-[state=on]:border-cyan-500/40 data-[state=on]:bg-cyan-500/15 data-[state=on]:text-cyan-100 md:flex-shrink"
                        >
                          {b.label}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <form onSubmit={onSubmit} className="mb-4 flex gap-2">
          <Input
            value={submitValue}
            onChange={(e) => setSubmitValue(e.target.value)}
            placeholder='Add comet ID, e.g. "1P" or "1P/Halley"'
            aria-label="Comet ID"
          />
          <Button type="submit" disabled={submitting} variant="space" className="relative overflow-hidden">
            <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-r from-accent/15 via-transparent to-transparent" />
            <span className="mr-1">☄️</span>
            {submitting ? "Adding…" : "Add"}
            {blast && <span className="comet-fx" aria-hidden />}
          </Button>
        </form>
        {submitMsg && (
          <div className="-mt-1 mb-3 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-emerald-200/90 shadow-[0_0_20px_rgba(34,197,94,0.15)]">
            {submitMsg}
          </div>
        )}
        {addNotice && (
          <div className="-mt-2 mb-3 rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-amber-100 shadow-[0_0_20px_rgba(245,158,11,0.15)]">
            {addNotice}
          </div>
        )}
        {submitError && (
          <div className="-mt-1 mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-200 shadow-[0_0_20px_rgba(239,68,68,0.15)]">
            {submitError}
          </div>
        )}
        {suggestions.length > 0 && (
          <div className="-mt-1 mb-3 rounded-md border border-cyan-400/30 bg-cyan-500/10 px-3 py-3 text-sm text-cyan-50/90 shadow-[0_0_20px_rgba(14,165,233,0.18)]">
            <p className="mb-2 text-xs uppercase tracking-[0.3em] text-cyan-100/80">Multiple matches found</p>
            <div className="flex flex-col gap-2">
              {suggestions.map((s, idx) => (
                <button
                  key={`${s.designation ?? s.name ?? idx}`}
                  type="button"
                  onClick={() => {
                    setSubmitValue(s.designation || s.name || "");
                    setSuggestions([]);
                  }}
                  className="flex w-full flex-col items-start rounded-md border border-cyan-400/30 bg-black/20 px-3 py-2 text-left text-sm transition hover:border-cyan-300/60 hover:bg-black/30"
                >
                  <span className="font-medium text-cyan-100">{s.suggestion_label}</span>
                  {(s.designation && s.designation !== s.suggestion_label) || (s.name && s.name !== s.suggestion_label) ? (
                    <span className="text-xs text-cyan-100/70">
                      {[s.name, s.designation].filter((val) => val && val !== s.suggestion_label).join(" · ")}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        )}
        {loading && <p className="text-sm text-foreground/70">Loading comets…</p>}
        {listError && <p className="text-sm text-red-400">{listError}</p>}
        {!loading && !listError && comets.length === 0 && (
          <p className="text-sm text-foreground/70">No comets yet. Add one above.</p>
        )}
        <div className="mb-3 flex items-center gap-3 text-xs text-foreground/70">
          <span>Sort:</span>
          <Dropdown
            value={sortKey}
            onChange={(v) => setSortKey((v as "id" | "family" | "period" | "last" | "next" | "countdown") || "countdown")}
            items={[
              { value: "countdown", label: "Countdown" },
              { value: "id", label: "ID" },
              { value: "family", label: "Family" },
              { value: "period", label: "Period" },
              { value: "last", label: "Last Perihelion" },
              { value: "next", label: "Next Perihelion" },
            ]}
          />
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2.5 py-1.5 hover:bg-white/10"
            title={sortDir === "asc" ? "Ascending" : "Descending"}
          >
            <span>{sortDir === "asc" ? "▲" : "▼"}</span>
          </button>
        </div>
        <div className="mt-2">{renderedList(comets)}</div>
        <div className="mt-3 text-[10px] text-foreground/60">Orbital data source: NASA/JPL SBDB</div>
      </CardContent>
    </Card>
  );
}
