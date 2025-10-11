"use client";

import { useEffect, useState, useMemo } from "react";
import client from "@/lib/appwrite";
import { TablesDB, Query, Functions } from "appwrite";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type CometRow = {
  $id: string;
  name?: string | null;
  designation?: string | null;
  orbit_class?: string | null;
  period_years?: number | null;
  source?: string | null;
};

export default function CometList({ onVisibleChange }: { onVisibleChange?: (ids: string[]) => void }) {
  const [comets, setComets] = useState<CometRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [submitValue, setSubmitValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [blast, setBlast] = useState(false);
  const [orbitClasses, setOrbitClasses] = useState<string[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const DURATION_BUCKETS: { key: string; label: string; min?: number; max?: number }[] = [
    { key: "lt10", label: "< 10y", max: 10 },
    { key: "10to25", label: "10–25y", min: 10, max: 25 },
    { key: "25to50", label: "25–50y", min: 25, max: 50 },
    { key: "50to100", label: "50–100y", min: 50, max: 100 },
    { key: "100to200", label: "100–200y", min: 100, max: 200 },
    { key: "200to500", label: "200–500y", min: 200, max: 500 },
    { key: "gt500", label: "> 500y", min: 500 },
  ];
  const [selectedBuckets, setSelectedBuckets] = useState<string[]>([]);
  // inline info replaces button
  // filters apply in realtime

  const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || "astroDB";
  const tableId = process.env.NEXT_PUBLIC_APPWRITE_TABLE_COMETS || "comets";

  const tables = useMemo(() => new TablesDB(client), []);
  const functions = useMemo(() => new Functions(client), []);

  const ORBIT_INFO: Record<string, { short: string; url?: string }> = {
    jfc: {
      short:
        "Jupiter-family comets (P < 20y; 2 < T_J < 3) are controlled by Jupiter and likely originate in the Kuiper Belt/Scattered Disk.",
      url: "https://en.wikipedia.org/wiki/Jupiter-family_comet",
    },
    encke: {
      short:
        "Encke-type are JFCs with aphelion Q < 4 AU (e.g., 2P/Encke), effectively decoupled from strong Jupiter encounters.",
      url: "https://en.wikipedia.org/wiki/2P/Encke",
    },
    halley: {
      short:
        "Halley-type comets (20–200y) have higher inclinations (often retrograde) and are thought to come from the Oort Cloud.",
      url: "https://en.wikipedia.org/wiki/Halley-type_comet",
    },
    lpc: {
      short:
        "Long-period comets (P > 200y) are near-parabolic and isotropically distributed, consistent with an Oort Cloud origin.",
      url: "https://en.wikipedia.org/wiki/Long-period_comet",
    },
    spc: {
      short: "Short-period comets (P < 200y) include Jupiter-family and Halley-type comets.",
      url: "https://en.wikipedia.org/wiki/Short-period_comet",
    },
    hyperbolic: {
      short: "Hyperbolic comets (e ≥ 1) are on unbound trajectories and may be interstellar.",
      url: "https://en.wikipedia.org/wiki/Interstellar_comet",
    },
    nearparabolic: {
      short: "Near-parabolic comets have eccentricities very close to 1 and extremely long periods.",
    },
    nonperiodic: {
      short: "Non-periodic comets are observed once; they typically have P » 200 years or unbound orbits.",
    },
  };

  function normalizeClassName(name: string): string {
    const s = name.toLowerCase();
    if (s.includes("jupiter") && s.includes("family")) return "jfc";
    if (s.includes("encke")) return "encke";
    if (s.includes("halley")) return "halley";
    if (s.includes("long") && s.includes("period")) return "lpc";
    if (s.includes("short") && s.includes("period")) return "spc";
    if (s.includes("hyperbolic")) return "hyperbolic";
    if (s.includes("near") && s.includes("parabolic")) return "nearparabolic";
    if (s.includes("non") && s.includes("period")) return "nonperiodic";
    return s.trim();
  }

  async function fetchRows() {
    try {
      setLoading(true);
      const queries: string[] = [Query.limit(400)];
      if (selectedClasses.length > 0) {
        queries.push(Query.equal("orbit_class", selectedClasses));
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
      setComets(rows);
      if (onVisibleChange) onVisibleChange(rows.map((r) => r.$id));
    } catch (e: unknown) {
      setListError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let unsub: (() => void) | undefined;

    async function init() {
      await fetchRows();

      try {
        // Subscribe to realtime changes on this table
        unsub = client.subscribe(
          `databases.${databaseId}.tables.${tableId}.rows`,
          async () => {
            // Re-fetch to respect active filters
            await fetchRows();
          }
        );
      } catch (e) {
        // Swallow subscribe errors silently to prevent UI breakage
        console.warn("Realtime subscribe failed", e);
      }
    }

    // preload classes once
    (async () => {
      try {
        const res = await tables.listRows({ databaseId, tableId, queries: [Query.limit(400)] });
        const uniq = Array.from(new Set((res.rows as CometRow[]).map((r) => r.orbit_class).filter(Boolean))) as string[];
        const order = ["Jupiter-family", "Encke", "Short-period", "Halley", "Long-period", "Hyperbolic", "Near-parabolic", "Non-periodic"];
        uniq.sort((a, b) => {
          const ia = order.findIndex((t) => a!.toLowerCase().includes(t.toLowerCase()));
          const ib = order.findIndex((t) => b!.toLowerCase().includes(t.toLowerCase()));
          const ra = ia === -1 ? 999 : ia;
          const rb = ib === -1 ? 999 : ib;
          if (ra !== rb) return ra - rb;
          return a.localeCompare(b);
        });
        setOrbitClasses(uniq);
      } catch (e) {
        // ignore
      }
    })();

    init();
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [databaseId, tableId, tables]);

  // Reapply filters instantly on change
  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClasses, selectedBuckets]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cometID = submitValue.trim();
    if (!cometID) return;
    setSubmitting(true);
    setSubmitMsg(null);
    setSubmitError(null);
    try {
      const functionId =
        (process.env.APPWRITE_ADD_COMET as string | undefined) ||
        (process.env.NEXT_PUBLIC_APPWRITE_ADD_COMET as string | undefined);
      if (!functionId) throw new Error("Missing APPWRITE_ADD_COMET env variable");

      const exec = await functions.createExecution({ functionId, body: JSON.stringify({ cometID }) });
      const ok = exec.status === "completed";
      setSubmitMsg(ok ? "☄️ Comet request queued" : `Execution status: ${exec.status}`);
      if (ok) {
        setBlast(true);
        setTimeout(() => setBlast(false), 1200);
      }
      setSubmitValue("");
    } catch (err: unknown) {
      setSubmitError(String((err as Error)?.message ?? err));
    } finally {
      setSubmitting(false);
    }
  }

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

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>Comets</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Orbit groups (tabs) + duration slider */}
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm text-foreground/80">Orbit group</div>
          </div>
          <div className="inline-flex items-center gap-2 flex-wrap">
            <button
              type="button"
              className={`px-3 py-1.5 rounded text-sm transition-colors border ${selectedClasses.length === 0
                  ? "bg-accent text-black border-accent/60 shadow-[0_0_12px_rgba(255,255,255,0.25)]"
                  : "text-foreground/80 hover:bg-white/10 border-white/15"
                }`}
              onClick={() => setSelectedClasses([])}
              title="Show all orbit classes"
            >
              All
            </button>
            <ToggleGroup type="multiple" value={selectedClasses} onValueChange={(v) => setSelectedClasses(v as string[])}>
              {orbitClasses.map((c) => (
                <ToggleGroupItem key={c} value={c} title={c}>
                  {c}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="text-xs text-foreground/70">
            {selectedClasses.length === 0 && "Showing all orbit classes."}
            {selectedClasses.length === 1 && (
              <>
                {ORBIT_INFO[normalizeClassName(selectedClasses[0])]?.short ?? `Filtering by orbit class: ${selectedClasses[0]}.`}
                {ORBIT_INFO[normalizeClassName(selectedClasses[0])]?.url && (
                  <>
                    {" "}
                    <a
                      href={ORBIT_INFO[normalizeClassName(selectedClasses[0])]!.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="underline opacity-80 hover:opacity-100"
                    >
                      Learn more
                    </a>
                    .
                  </>
                )}
              </>
            )}
            {selectedClasses.length > 1 && `Filtering ${selectedClasses.length} families.`}
          </div>
          <div className="text-sm text-foreground/80">Duration buckets</div>
          <div className="inline-flex items-center gap-2 flex-wrap">
            <button
              type="button"
              className={`px-3 py-1.5 rounded text-sm transition-colors border ${selectedBuckets.length === 0
                  ? "bg-accent text-black border-accent/60 shadow-[0_0_12px_rgba(255,255,255,0.25)]"
                  : "text-foreground/80 hover:bg-white/10 border-white/15"
                }`}
              onClick={() => setSelectedBuckets([])}
              title="Show all durations"
            >
              All
            </button>
            <ToggleGroup type="multiple" value={selectedBuckets} onValueChange={(v) => setSelectedBuckets(v as string[])}>
              {DURATION_BUCKETS.map((b) => (
                <ToggleGroupItem key={b.key} value={b.key} title={b.label}>
                  {b.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          {/* No Reset button; use the All toggles to clear filters */}
        </div>

        {/* Top row: compact add-comet form */}
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
        {submitError && (
          <div className="-mt-1 mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-200 shadow-[0_0_20px_rgba(239,68,68,0.15)]">
            {submitError}
          </div>
        )}
        {loading && <p className="text-sm text-foreground/70">Loading comets…</p>}
        {listError && <p className="text-sm text-red-400">{listError}</p>}
        {!loading && !listError && comets.length === 0 && (
          <p className="text-sm text-foreground/70">No comets yet. Add one above.</p>
        )}
        <ul className="divide-y divide-white/10">
          {comets.map((c) => (
            <li key={c.$id} className="py-3 flex items-center justify-between">
              <div>
                <div className="font-medium">{c.name ?? c.designation ?? c.$id}</div>
                <div className="text-xs text-foreground/70">
                  {c.designation ? `${c.designation}` : ""}
                  {c.orbit_class ? ` • ${c.orbit_class}` : ""}
                  {c.period_years ? ` • P≈${Number(c.period_years).toFixed(2)}y` : ""}
                </div>
              </div>
              {c.source && <span className="text-[10px] uppercase tracking-wide text-foreground/60">{c.source}</span>}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
