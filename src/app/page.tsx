"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import CometList from "@/components/comet-list";
import OrbitView3D from "@/components/orbit-view-3d";
import SlideToLaunch from "@/components/slide-to-launch";
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

function buildDetailLine(row: HomeCometRow): string {
  const parts: string[] = [];
  const period = formatPeriod(row.period_years);
  if (period) parts.push(period);
  const last = formatLastPerihelion(row.last_perihelion_year);
  if (last) parts.push(last);
  if (row.orbit_class) parts.push(row.orbit_class);
  return parts.join(" • ");
}

function categoriseComets(rows: HomeCometRow[]): CategorisedComets {
  const buckets: CategorisedComets = {
    periodic: [],
    longPeriod: [],
    hyperbolic: [],
    other: [],
  };

  for (const row of rows) {
    const prefix = row.prefix?.toUpperCase();
    const status = row.comet_status?.toLowerCase();

    if (prefix === "P") {
      buckets.periodic.push(row);
      continue;
    }
    if (prefix === "C") {
      buckets.longPeriod.push(row);
      continue;
    }
    if (status === "hyperbolic") {
      buckets.hyperbolic.push(row);
      continue;
    }
    if (
      prefix === "A" ||
      prefix === "D" ||
      prefix === "X" ||
      prefix === "I" ||
      status === "asteroid" ||
      status === "lost" ||
      status === "unreliable" ||
      status === "interstellar"
    ) {
      buckets.other.push(row);
      continue;
    }
    if (status === "periodic") {
      buckets.periodic.push(row);
      continue;
    }
    if (status === "long-period") {
      buckets.longPeriod.push(row);
      continue;
    }
    if (status === "hyperbolic") {
      buckets.hyperbolic.push(row);
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
  const [visibleCometIds, setVisibleCometIds] = useState<string[] | null>(null);
  const router = useRouter();
  const launchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tables = useMemo(() => new TablesDB(client), []);
  const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || "astroDB";
  const tableComets = process.env.NEXT_PUBLIC_APPWRITE_TABLE_COMETS || process.env.APPWRITE_TABLE_COMETS || "comets";
  const [catalog, setCatalog] = useState<HomeCometRow[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const categories = useMemo(() => categoriseComets(catalog), [catalog]);
  const periodicPreview = useMemo(
    () => categories.periodic.slice(0, 6),
    [categories.periodic]
  );
  const longPeriodPreview = useMemo(
    () => categories.longPeriod.slice(0, 6),
    [categories.longPeriod]
  );
  const hyperbolicPreview = useMemo(
    () => categories.hyperbolic.slice(0, 6),
    [categories.hyperbolic]
  );
  const otherPreview = useMemo(
    () => categories.other.slice(0, 6),
    [categories.other]
  );
  const renderCategoryList = useCallback(
    (rows: HomeCometRow[], emptyMessage: string) => {
      if (catalogLoading) {
        return (
          <div className="rounded-md border border-white/5 bg-white/5 px-4 py-5 text-sm text-foreground/70">
            Syncing telemetry from the archive…
          </div>
        );
      }
      if (catalogError) {
        return (
          <div className="rounded-md border border-rose-400/40 bg-rose-500/10 px-4 py-5 text-sm text-rose-100">
            {catalogError}
          </div>
        );
      }
      if (rows.length === 0) {
        return (
          <div className="rounded-md border border-white/10 bg-white/5 px-4 py-5 text-sm text-foreground/60">
            {emptyMessage}
          </div>
        );
      }
      return (
        <div className="grid gap-3">
          {rows.map((row) => {
            const status = row.comet_status?.replace(/-/g, " ");
            const details = buildDetailLine(row) || "Telemetry pending";
            return (
              <div
                key={row.$id}
                className="rounded-md border border-white/10 bg-[#0b1020]/70 px-3 py-3 shadow-[0_0_12px_rgba(14,24,45,0.35)] backdrop-blur"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      {row.prefix && (
                        <Badge
                          variant="secondary"
                          className="uppercase tracking-[0.3em] text-[10px] text-foreground/70"
                        >
                          {row.prefix}
                        </Badge>
                      )}
                      <div className="text-sm font-medium text-white">{formatCometLabel(row)}</div>
                    </div>
                    <div className="mt-1 text-xs text-foreground/70">{details}</div>
                  </div>
                  {status && (
                    <span className="text-[10px] uppercase tracking-[0.3em] text-foreground/60">
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
    launchTimeoutRef.current = setTimeout(() => {
      router.push("/cockpit");
      launchTimeoutRef.current = null;
    }, 220);
  }, [router]);
  const goToCockpit = useCallback(() => {
    router.push("/cockpit");
  }, [router]);
  const goToGreatComets = useCallback(() => {
    router.push("/great-comets");
  }, [router]);
  const handleScrollToCatalog = useCallback(() => {
    const anchor = document.getElementById("fleet-catalog");
    if (anchor) anchor.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

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
    };
  }, []);

  return (
    <div className="min-h-dvh relative">
      <div className="starfield" />

      <main className="relative z-10 max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">astroKapsel</h1>
        <p className="mt-2 text-foreground/80">
          Add a comet by its NASA Small‑Body ID. Use formats like <span className="font-mono">1P</span> or <span className="font-mono">1P/Halley</span>.
          Find IDs at
          {" "}
          <a className="underline hover:opacity-90" href="https://ssd.jpl.nasa.gov/tools/sbdb_query.html" target="_blank" rel="noreferrer noopener">NASA SBDB</a>.
        </p>
        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-foreground/70">
            This launchpad walks through the data sources and lets you queue new comets. Tap the cockpit to dive into the 3D mission console.
          </div>
          <div className="w-full max-w-md">
            <SlideToLaunch onComplete={handleLaunch} />
            <div className="mt-2 text-center text-[10px] uppercase tracking-[0.45em] text-cyan-100/60">Slide The Comet To Enter The Cockpit</div>
            {/* <div className="mt-1 text-center text-xs text-cyan-200/60">Launching the comet will jump straight into the mission cockpit.</div> */}
          </div>
        </div>

        <Tabs defaultValue="periodic" className="mt-12 space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.3em] text-foreground/50">Mission manifests</div>
              <h2 className="mt-1 text-2xl font-semibold text-white">Organize the fleet by trajectory</h2>
              <p className="mt-2 text-sm text-foreground/75">
                Switch between periodic commuters, luminous great comets, hyperbolic escapees, and asteroidal interlopers.
              </p>
            </div>
            <TabsList className="self-start sm:self-end">
              <TabsTrigger value="periodic">Type P</TabsTrigger>
              <TabsTrigger value="great">Type C</TabsTrigger>
              <TabsTrigger value="hyperbolic">Hyperbolic</TabsTrigger>
              <TabsTrigger value="other">Asteroids</TabsTrigger>
            </TabsList>
          </div>
          <div className="space-y-6">
            <TabsContent value="periodic">
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <CardTitle>Periodic Fleet · Type P</CardTitle>
                      <p className="mt-1 text-sm text-foreground/75">
                        These returning travelers define the heartbeat of astroKapsel and feed the mission cockpit.
                      </p>
                    </div>
                    <Badge variant="secondary" className="whitespace-nowrap text-[11px] uppercase tracking-[0.3em]">
                      {categories.periodic.length} tracked
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {renderCategoryList(
                    periodicPreview,
                    "No periodic comets logged yet. Launch the cockpit to queue your first mission."
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="space" onClick={goToCockpit}>
                      Enter the cockpit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleScrollToCatalog}>
                      View full catalog
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="great">
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <CardTitle>Great Comets · Type C</CardTitle>
                      <p className="mt-1 text-sm text-foreground/75">
                        Rare, long-period visitors that ignite the skies and now have their own sighting lab.
                      </p>
                    </div>
                    <Badge variant="secondary" className="whitespace-nowrap text-[11px] uppercase tracking-[0.3em]">
                      {categories.longPeriod.length} tracked
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {renderCategoryList(
                    longPeriodPreview,
                    "No long-period comets collected yet. Add a C-designation object to begin charting great apparitions."
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="space" onClick={goToGreatComets}>
                      Explore great comets
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleScrollToCatalog}>
                      View full catalog
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="hyperbolic">
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <CardTitle>Hyperbolic Encounters</CardTitle>
                      <p className="mt-1 text-sm text-foreground/75">
                        One-time visitors on unbound trajectories — catch them before they exit the solar stage.
                      </p>
                    </div>
                    <Badge variant="secondary" className="whitespace-nowrap text-[11px] uppercase tracking-[0.3em]">
                      {categories.hyperbolic.length} logged
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {renderCategoryList(
                    hyperbolicPreview,
                    "No hyperbolic objects yet — add a comet with a hyperbolic status to monitor their fly-through."
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="space" onClick={handleScrollToCatalog}>
                      Review trajectories
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="other">
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <CardTitle>Asteroids &amp; Other Objects</CardTitle>
                      <p className="mt-1 text-sm text-foreground/75">
                        Misfits, disrupted comets, and asteroidal bodies catalogued alongside the fleet.
                      </p>
                    </div>
                    <Badge variant="secondary" className="whitespace-nowrap text-[11px] uppercase tracking-[0.3em]">
                      {categories.other.length} archived
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {renderCategoryList(
                    otherPreview,
                    "No auxiliary objects recorded yet. Log D, X, A, or I designations to populate this dock."
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="space" onClick={handleScrollToCatalog}>
                      Inspect inventory
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>

        <Accordion className="mt-10 space-y-3">
          <AccordionItem
            defaultOpen
            header={(open) => (
              <div
                className={`flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-4 py-3 text-sm uppercase tracking-[0.3em] text-foreground/80 transition ${open ? "border-white/30 text-white" : ""
                  }`}
              >
                <span>What Is A Comet?</span>
                <span className="font-mono text-lg leading-none">{open ? "-" : "+"}</span>
              </div>
            )}
          >
            <div className="space-y-2 text-sm leading-relaxed text-foreground/80">
              <p>
                Comets are ancient icy bodies orbiting the Sun in long, stretched paths. When sunlight heats their frozen surfaces, gases and dust escape, creating bright tails that can stretch millions of kilometers. Each comet is both a traveler and a time capsule—carrying material from the dawn of our solar system.
              </p>
            </div>
          </AccordionItem>

          <AccordionItem
            header={(open) => (
              <div
                className={`flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-4 py-3 text-sm uppercase tracking-[0.3em] text-foreground/80 transition ${open ? "border-white/30 text-white" : ""
                  }`}
              >
                <span>Comet Families</span>
                <span className="font-mono text-lg leading-none">{open ? "-" : "+"}</span>
              </div>
            )}
          >
            <div className="space-y-2 text-sm leading-relaxed text-foreground/80">
              <p>
                Most comets belong to one of two great families. <strong>Short-period comets</strong>, born in the Kuiper Belt beyond Neptune, return every few decades—predictable visitors like Halley’s Comet. <strong>Long-period comets</strong> come from the faraway Oort Cloud, on journeys so vast they may take thousands of years to loop back. A comet’s family reveals its speed, composition, and the tilt of its orbit through space.
              </p>
            </div>
          </AccordionItem>

          <AccordionItem
            header={(open) => (
              <div
                className={`flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-4 py-3 text-sm uppercase tracking-[0.3em] text-foreground/80 transition ${open ? "border-white/30 text-white" : ""
                  }`}
              >
                <span>NASA SBDB In Action</span>
                <span className="font-mono text-lg leading-none">{open ? "-" : "+"}</span>
              </div>
            )}
          >
            <div className="space-y-2 text-sm leading-relaxed text-foreground/80">
              <p>
                The <strong>NASA Small-Body Database (SBDB)</strong> provides precise orbital data for thousands of comets and asteroids. AstroKapsel connects directly to this dataset to reconstruct each comet’s path in three dimensions. Every arc you see in the cockpit’s visualization reflects a real orbital trajectory within our solar system.
              </p>
            </div>
          </AccordionItem>

          <AccordionItem
            header={(open) => (
              <div
                className={`flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-4 py-3 text-sm uppercase tracking-[0.3em] text-foreground/80 transition ${open ? "border-white/30 text-white" : ""
                  }`}
              >
                <span>Why Perihelion?</span>
                <span className="font-mono text-lg leading-none">{open ? "-" : "+"}</span>
              </div>
            )}
          >
            <div className="space-y-2 text-sm leading-relaxed text-foreground/80">
              <p>
                Instead of tracking the comet’s minimum distance to Earth, AstroKapsel uses the <strong>perihelion</strong>—the moment a comet comes closest to the Sun. This point is stable and tied to the comet’s orbital energy, making it the most accurate reference for comparing different flybys. Each perihelion marks a fixed rhythm in the cosmos: a repeating heartbeat of ice and light.
              </p>
            </div>
          </AccordionItem>
        </Accordion>


        {/* Orbits first */}
        <OrbitView3D onlyIds={visibleCometIds ?? undefined} />

        <div id="fleet-catalog">
          <CometList onVisibleChange={setVisibleCometIds} />
        </div>

      </main>
    </div>
  );
}
