"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TablesDB, Query, Functions, type Models } from "appwrite";

import client from "@/lib/appwrite";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dropdown } from "@/components/ui/dropdown";
import { Textarea } from "@/components/ui/textarea";

type CometRow = Models.Document & {
  name?: string | null;
  designation?: string | null;
  prefix?: string | null;
  last_perihelion_year?: number | string | null;
};

type FlybyRelation = {
  $id?: string;
  year?: number | string | null;
  description?: string | null;
  comet?: {
    $id?: string;
    name?: string | null;
    designation?: string | null;
    prefix?: string | null;
  } | string | null;
};

type SightingRow = Models.Document & {
  observer_name?: string | null;
  note?: string | null;
  flyby?: FlybyRelation | string | null;
  geo_lat?: number | null;
  geo_lon?: number | null;
};

type SightingDisplay = {
  id: string;
  cometLabel: string;
  observer: string;
  note: string;
  yearDisplay: string;
  yearNumeric: number | null;
  flybyDescription: string | null;
  createdAt: string;
  geoLat?: number | null;
  geoLon?: number | null;
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

function formatCometLabel(row: { $id?: string; name?: string | null; designation?: string | null; prefix?: string | null }) {
  const name = row.name?.trim();
  const designation = row.designation?.trim();
  const base =
    name && designation && name !== designation
      ? `${name} · ${designation}`
      : name ?? designation ?? row.$id ?? "Unknown comet";
  const prefix = row.prefix?.trim();
  return prefix ? `${prefix} · ${base}` : base;
}

function mapSightingRow(row: SightingRow): SightingDisplay | null {
  const flyby = row.flyby && typeof row.flyby === "object" ? (row.flyby as FlybyRelation) : null;
  if (!flyby || !flyby.comet || typeof flyby.comet !== "object") return null;
  const comet = flyby.comet as { $id?: string; name?: string | null; designation?: string | null; prefix?: string | null };
  const prefix = comet.prefix?.toUpperCase();
  if (prefix !== "C") return null;

  const yearNumeric = coerceNumber(flyby.year);
  return {
    id: row.$id,
    cometLabel: formatCometLabel({ ...comet }),
    observer: row.observer_name?.trim() || "Unknown observer",
    note: (row.note ?? "").trim(),
    flybyDescription: flyby.description?.trim() ?? null,
    yearDisplay: yearNumeric != null ? Math.round(yearNumeric).toString() : "Unknown year",
    yearNumeric: yearNumeric ?? null,
    createdAt: row.$createdAt ?? "",
    geoLat: typeof row.geo_lat === "number" ? row.geo_lat : null,
    geoLon: typeof row.geo_lon === "number" ? row.geo_lon : null,
  };
}

function getExecutionOutput(execution: Models.Execution): string | null {
  const execWithOutput = execution as Models.Execution & { response?: unknown; stdout?: unknown };
  const payload = execWithOutput.response ?? execWithOutput.stdout;
  if (payload == null) return null;
  return typeof payload === "string" ? payload : String(payload);
}

export default function GreatCometsPage() {
  const router = useRouter();
  const tables = useMemo(() => new TablesDB(client), []);
  const functions = useMemo(() => new Functions(client), []);

  const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || "astroDB";
  const tableComets = process.env.NEXT_PUBLIC_APPWRITE_TABLE_COMETS || process.env.APPWRITE_TABLE_COMETS || "comets";
  const tableSightings = process.env.NEXT_PUBLIC_APPWRITE_TABLE_SIGHTINGS || process.env.APPWRITE_TABLE_SIGHTINGS || "sightings";
  const functionId = "generateSighting";

  const [comets, setComets] = useState<CometRow[]>([]);
  const [cometsLoading, setCometsLoading] = useState(true);
  const [cometsError, setCometsError] = useState<string | null>(null);
  const [selectedCometId, setSelectedCometId] = useState<string>("");

  const [focusPrompt, setFocusPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [sightings, setSightings] = useState<SightingDisplay[]>([]);
  const [sightingsLoading, setSightingsLoading] = useState(true);
  const [sightingsError, setSightingsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadComets() {
      setCometsLoading(true);
      setCometsError(null);
      try {
        const res = await tables.listRows({
          databaseId,
          tableId: tableComets,
          queries: [Query.equal("prefix", ["C"]), Query.orderDesc("last_perihelion_year"), Query.limit(200)],
        });
        if (cancelled) return;
        const rows = Array.isArray(res.rows) ? (res.rows as CometRow[]) : [];
        rows.sort((a, b) => {
          const ay = jdToDate(a.last_perihelion_year)?.getTime() ?? Number.NEGATIVE_INFINITY;
          const by = jdToDate(b.last_perihelion_year)?.getTime() ?? Number.NEGATIVE_INFINITY;
          return by - ay;
        });
        setComets(rows);
        setSelectedCometId((prev) => {
          if (prev && rows.some((row) => row.$id === prev)) return prev;
          return rows[0]?.$id ?? "";
        });
      } catch (err) {
        if (cancelled) return;
        setCometsError(`Unable to load great comets: ${(err as Error)?.message ?? err}`);
      } finally {
        if (!cancelled) setCometsLoading(false);
      }
    }
    loadComets();
    return () => {
      cancelled = true;
    };
  }, [tables, databaseId, tableComets]);

  const loadSightings = useCallback(async () => {
    setSightingsLoading(true);
    setSightingsError(null);
    try {
      const res = await tables.listRows({
        databaseId,
        tableId: tableSightings,
        queries: [
          Query.limit(400),
          Query.select([
            "$id",
            "observer_name",
            "note",
            "$createdAt",
            "geo_lat",
            "geo_lon",
            "flyby.$id",
            "flyby.year",
            "flyby.description",
            "flyby.comet.$id",
            "flyby.comet.name",
            "flyby.comet.designation",
            "flyby.comet.prefix",
          ]),
        ],
      });

      const rows = Array.isArray(res.rows) ? (res.rows as SightingRow[]) : [];
      const mapped = rows
        .map(mapSightingRow)
        .filter((entry): entry is SightingDisplay => entry !== null)
        .sort((a, b) => {
          if (b.yearNumeric === a.yearNumeric) return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
          return (b.yearNumeric ?? Number.NEGATIVE_INFINITY) - (a.yearNumeric ?? Number.NEGATIVE_INFINITY);
        });

      setSightings(mapped);
    } catch (err) {
      setSightingsError(`Unable to load sightings: ${(err as Error)?.message ?? err}`);
    } finally {
      setSightingsLoading(false);
    }
  }, [tables, databaseId, tableSightings]);

  useEffect(() => {
    loadSightings();
  }, [loadSightings]);

  const cometOptions = useMemo(
    () => comets.map((row) => ({ value: row.$id, label: formatCometLabel(row) })),
    [comets]
  );
  const selectedComet = useMemo(
    () => (selectedCometId ? comets.find((row) => row.$id === selectedCometId) ?? null : null),
    [comets, selectedCometId]
  );
  const perihelionDate = useMemo(() => jdToDate(selectedComet?.last_perihelion_year), [selectedComet]);
  const perihelionLabel = perihelionDate ? formatUTCDate(perihelionDate) : null;
  const perihelionJD = selectedComet?.last_perihelion_year ?? null;

  const handleGenerate = useCallback(async () => {
    if (!selectedCometId) {
      setStatusMessage("Select a great comet first.");
      return;
    }
    if (!perihelionDate) {
      setStatusMessage("This comet does not have perihelion data yet.");
      return;
    }
    setGenerating(true);
    setStatusMessage("Generating sighting with Gemini 2.5 Flash Lite…");
      try {
        const payload: Record<string, unknown> = {
          cometId: selectedCometId,
        };
        if (focusPrompt.trim()) payload.focus = focusPrompt.trim();
        if (perihelionJD != null) payload.perihelionJD = perihelionJD;

      const execution = await functions.createExecution({
        functionId,
        body: JSON.stringify(payload),
      });

      const output = getExecutionOutput(execution);
      if (execution.status !== "completed") {
        setStatusMessage(`Function status: ${execution.status}`);
        return;
      }

      if (output) {
        try {
          const parsed = JSON.parse(output) as { ok?: boolean; message?: string; error?: string } | undefined;
          if (parsed?.ok) {
            setStatusMessage("Sighting logged successfully.");
          } else {
            setStatusMessage(parsed?.error || parsed?.message || "Sighting generated.");
          }
        } catch {
          setStatusMessage(output);
        }
      } else {
        setStatusMessage("Sighting requested. Refreshing log…");
      }

      await loadSightings();
    } catch (err) {
      setStatusMessage(`Generation failed: ${(err as Error)?.message ?? err}`);
    } finally {
      setGenerating(false);
    }
  }, [selectedCometId, perihelionDate, focusPrompt, functions, functionId, loadSightings]);

  return (
    <div className="relative min-h-dvh">
      <div className="starfield" />
      <main className="relative z-10 mx-auto max-w-4xl px-6 py-16">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-foreground/50">Great Comets Lab</div>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">Long-period legends, logged</h1>
            <p className="mt-3 max-w-2xl text-sm text-foreground/80">
              Chronicle the brightest apparitions in human memory. Generate fresh observation notes with Gemini 2.5 Flash Lite and keep a historical ledger of type C comet sightings across centuries.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push("/")}>Back to launchpad</Button>
            <Button variant="space" size="sm" onClick={() => router.push("/cockpit")}>Open cockpit</Button>
          </div>
        </header>

        <section className="mt-10 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="shadow-[0_0_30px_rgba(30,64,120,0.35)]">
            <CardHeader>
              <CardTitle>Generate a new sighting</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {cometsError && (
                <div className="rounded-md border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                  {cometsError}
                </div>
              )}
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-[0.3em] text-foreground/60">Great comet</div>
                <Dropdown
                  value={selectedCometId}
                  onChange={(value) => {
                    setSelectedCometId(value);
                  }}
                  items={cometOptions}
                  className="max-w-md"
                />
                {cometsLoading && <div className="text-xs text-foreground/60">Loading comet roster…</div>}
              </div>

              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-[0.3em] text-foreground/60">Perihelion anchor</div>
                <div className="rounded-md border border-white/10 bg-white/5 px-4 py-3 text-sm text-foreground/80">
                  {perihelionLabel ? (
                    <>
                      <span className="font-medium text-white">{perihelionLabel}</span>
                      <span className="ml-2 text-xs uppercase tracking-[0.3em] text-foreground/60">Derived from last perihelion</span>
                    </>
                  ) : (
                    "No perihelion data available yet — add orbital elements to enable sightings."
                  )}
                </div>
              </div>

              <label className="space-y-1 text-sm">
                <span className="text-[11px] uppercase tracking-[0.3em] text-foreground/60">Focus (optional)</span>
                <Textarea
                  value={focusPrompt}
                  onChange={(event) => setFocusPrompt(event.target.value)}
                  placeholder="Add flavour — e.g. southern aurora, indigenous storytelling, spectroscopy notes"
                  className="leading-relaxed"
                  rows={3}
                />
                <p className="text-[11px] uppercase tracking-[0.2em] text-foreground/50">This guides the tone of the generated log.</p>
              </label>

              <div className="flex items-center gap-3">
                <Button variant="space" onClick={handleGenerate} disabled={generating || !selectedCometId || !perihelionDate}>
                  {generating ? "Generating…" : "Generate sighting"}
                </Button>
                {statusMessage && <div className="text-xs text-foreground/70">{statusMessage}</div>}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-[0_0_30px_rgba(45,24,68,0.35)]">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>Latest great comet sightings</CardTitle>
                  <p className="mt-1 text-sm text-foreground/75">
                    Sorted by apparition year — from recent spectacles like Hale-Bopp back into the 19th century and beyond.
                  </p>
                </div>
                <Badge variant="secondary" className="whitespace-nowrap text-[11px] uppercase tracking-[0.3em]">
                  {sightings.length} entries
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="h-full">
              {sightingsError && (
                <div className="rounded-md border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                  {sightingsError}
                </div>
              )}
              {sightingsLoading ? (
                <div className="rounded-md border border-white/10 bg-white/5 px-4 py-5 text-sm text-foreground/70">
                  Retrieving historical ledger…
                </div>
              ) : sightings.length === 0 ? (
                <div className="rounded-md border border-white/10 bg-white/5 px-4 py-5 text-sm text-foreground/70">
                  No great comet sightings yet — generate one to start the record.
                </div>
              ) : (
                <ScrollArea className="h-[28rem]">
                  <div className="space-y-4 pr-1">
                    {sightings.map((entry, idx) => {
                      const highlight = idx === 0;
                      return (
                        <div
                          key={entry.id}
                          className={`rounded-lg border px-4 py-4 transition ${
                            highlight
                              ? "border-accent/60 bg-accent/10 shadow-[0_0_18px_rgba(110,203,255,0.35)]"
                              : "border-white/10 bg-[#0f1528]/80"
                          }`}
                        >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <Badge variant={highlight ? "default" : "secondary"}>{entry.yearDisplay}</Badge>
                        <span className="text-[11px] uppercase tracking-[0.3em] text-foreground/60">
                          {entry.observer}
                        </span>
                      </div>
                      {(entry.geoLat != null || entry.geoLon != null) && (
                        <div className="mt-1 text-[11px] uppercase tracking-[0.25em] text-foreground/50">
                          {entry.geoLat != null ? entry.geoLat.toFixed(2) : "?"}°, {entry.geoLon != null ? entry.geoLon.toFixed(2) : "?"}°
                        </div>
                      )}
                      <div className="mt-2 text-sm font-medium text-white">{entry.cometLabel}</div>
                          {entry.flybyDescription && (
                            <div className="text-xs text-foreground/60">{entry.flybyDescription}</div>
                          )}
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
                            {entry.note || "—"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
