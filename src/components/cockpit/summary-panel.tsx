"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import client from "@/lib/appwrite";
import { TablesDB, Functions, Query } from "appwrite";
import type { Models } from "appwrite";
import { CockpitPanel, CockpitPanelHeader } from "@/components/cockpit/panel";
import { Dropdown } from "@/components/ui/dropdown";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

type CometRow = {
  $id: string;
  name?: string | null;
  designation?: string | null;
};

type FlybyRow = {
  $id: string;
  year?: number | null;
  description?: string | null;
  comet?: unknown;
};

export type SummaryRecord = {
  $id: string;
  title?: string | null;
  summary?: string | null;
  generated_at?: string | null;
  comet?: unknown;
  from_flyby?: unknown;
  to_flyby?: unknown;
  llm_model_used?: string | null;
};

type FlybyWindow = {
  id: string;
  from: FlybyRow;
  to: FlybyRow;
};

function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-[1.5px] border-cyan-200/70 border-t-transparent"
      aria-hidden="true"
    />
  );
}

function getRelationId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) {
    const entry = value[0];
    if (typeof entry === "string") return entry;
    if (entry && typeof entry === "object" && typeof (entry as { $id?: string }).$id === "string") {
      return (entry as { $id?: string }).$id ?? null;
    }
  }
  if (typeof value === "object") {
    const doc = value as { $id?: string; data?: unknown; rows?: unknown; documents?: unknown };
    if (typeof doc.$id === "string") return doc.$id;
    const collections = [doc.data, doc.rows, doc.documents];
    for (const set of collections) {
      if (Array.isArray(set) && set.length > 0) {
        const entry = set[0] as { $id?: string } | string;
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object" && typeof entry.$id === "string") return entry.$id;
      }
    }
  }
  return null;
}

function formatCometLabel(row: CometRow) {
  const name = row.name?.trim();
  const designation = row.designation?.trim();
  if (name && designation && name !== designation) return `${name} · ${designation}`;
  return name ?? designation ?? row.$id;
}

function formatYear(value?: number | null): string {
  if (value == null) return "Unknown";
  if (Number.isFinite(value)) return Number(value).toFixed(1);
  return String(value);
}

function makeWindowKey(a: string, b: string) {
  return [a, b].sort().join("::");
}

function sortFlybys(rows: FlybyRow[]) {
  return rows.slice().sort((a, b) => {
    const ay = typeof a.year === "number" ? a.year : Number(a.year ?? 0);
    const by = typeof b.year === "number" ? b.year : Number(b.year ?? 0);
    return by - ay;
  });
}

function buildWindows(flybys: FlybyRow[]): FlybyWindow[] {
  if (flybys.length < 2) return [];
  const sorted = sortFlybys(flybys);
  const windows: FlybyWindow[] = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const from = sorted[i];
    const to = sorted[i + 1];
    windows.push({
      id: makeWindowKey(from.$id, to.$id),
      from,
      to,
    });
  }
  return windows;
}

function getExecutionOutput(execution: Models.Execution): string | null {
  const execWithOutput = execution as Models.Execution & {
    response?: unknown;
    stdout?: unknown;
  };
  const rawOutput = execWithOutput.response ?? execWithOutput.stdout;
  if (rawOutput == null) return null;
  return typeof rawOutput === "string" ? rawOutput : String(rawOutput);
}

export default function SummaryPanel() {
  const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || "astroDB";
  const tableComets =
    process.env.NEXT_PUBLIC_APPWRITE_TABLE_COMETS || process.env.APPWRITE_TABLE_COMETS || "comets";
  const tableFlybys =
    process.env.NEXT_PUBLIC_APPWRITE_TABLE_FLYBYS || process.env.APPWRITE_TABLE_FLYBYS || "flybys";
  const tableSummaries =
    process.env.NEXT_PUBLIC_APPWRITE_TABLE_SUMMARIES || process.env.APPWRITE_TABLE_SUMMARIES || "summaries";
  const functionId =
    process.env.NEXT_PUBLIC_APPWRITE_QUERY_FAL || process.env.APPWRITE_QUERY_FAL || "queryFAL";

  const tables = useMemo(() => new TablesDB(client), []);
  const functions = useMemo(() => new Functions(client), []);

  const [comets, setComets] = useState<CometRow[]>([]);
  const [selectedCometId, setSelectedCometId] = useState<string>("");
  const [flybyWindows, setFlybyWindows] = useState<FlybyWindow[]>([]);
  const [summaryByWindow, setSummaryByWindow] = useState<Map<string, SummaryRecord>>(new Map());
  const [selectedWindowId, setSelectedWindowId] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingWindowId, setPendingWindowId] = useState<string | null>(null);

  const loadComets = useCallback(async () => {
    try {
      const res = await tables.listRows({
        databaseId,
        tableId: tableComets,
        queries: [Query.orderAsc("name"), Query.limit(200)],
      });
      const rows = (res.rows as CometRow[]).slice().sort((a, b) => {
        const labelA = formatCometLabel(a).toLowerCase();
        const labelB = formatCometLabel(b).toLowerCase();
        return labelA.localeCompare(labelB);
      });
      setComets(rows);
      if (rows.length > 0) setSelectedCometId((prev) => prev || rows[0].$id);
    } catch (err) {
      setPanelError(`Failed to load comets: ${String((err as Error)?.message ?? err)}`);
    }
  }, [databaseId, tableComets, tables]);

  useEffect(() => {
    loadComets();
  }, [loadComets]);

  const loadCometData = useCallback(
    async (cometId: string) => {
      setPanelError(null);
      setLoading(true);
      try {
        const [flybyRes, summaryRes] = await Promise.all([
          tables.listRows({
            databaseId,
            tableId: tableFlybys,
            queries: [
              Query.equal("comet.$id", [cometId]),
              Query.select(["$id", "year", "description", "comet.$id"]),
              Query.orderDesc("year"),
              Query.limit(200),
            ],
          }),
          tables.listRows({
            databaseId,
            tableId: tableSummaries,
            queries: [
              Query.equal("comet.$id", [cometId]),
              Query.select([
                "$id",
                "title",
                "summary",
                "generated_at",
                "llm_model_used",
                "comet.$id",
                "from_flyby.$id",
                "from_flyby.year",
                "to_flyby.$id",
                "to_flyby.year",
              ]),
              Query.orderDesc("generated_at"),
              Query.limit(200),
            ],
          }),
        ]);

        const flybyRows = flybyRes.rows as FlybyRow[];
        const filteredFlybys = sortFlybys(
          flybyRows.filter((row) => {
            const relationId = getRelationId(row.comet);
            return relationId === cometId || (typeof row.comet === "string" && row.comet === cometId);
          })
        );
        const windows = buildWindows(filteredFlybys);
        setFlybyWindows(windows);

        const map = new Map<string, SummaryRecord>();
        const summaries = summaryRes.rows as SummaryRecord[];
        const maybeEnriched = await Promise.all(
          summaries.map(async (summary) => {
            const fromId = getRelationId(summary.from_flyby);
            const toId = getRelationId(summary.to_flyby);
            const cometRelation = getRelationId(summary.comet);
            if (fromId && toId && cometRelation) return summary;
            try {
              const enriched = (await tables.getRow({
                databaseId,
                tableId: tableSummaries,
                rowId: summary.$id,
              })) as SummaryRecord;
              return enriched;
            } catch {
              return summary;
            }
          })
        );

        maybeEnriched
          .filter((summary) => getRelationId(summary.comet) === cometId)
          .forEach((summary) => {
            const fromId = getRelationId(summary.from_flyby);
            const toId = getRelationId(summary.to_flyby);
            if (fromId && toId) map.set(makeWindowKey(fromId, toId), summary);
          });
        setSummaryByWindow(map);

        const defaultWindowId = windows[0]?.id ?? "";
        setSelectedWindowId((prev) => (prev && windows.some((w) => w.id === prev) ? prev : defaultWindowId));
        setStatusMessage(null);
        if (process.env.NODE_ENV !== "production") {
          console.debug("[SummaryPanel] flybys", flybyRows);
          console.debug("[SummaryPanel] summaries", maybeEnriched);
          console.debug("[SummaryPanel] summary windows", Array.from(map.keys()));
        }
      } catch (err) {
        setPanelError(`Failed to load comet data: ${String((err as Error)?.message ?? err)}`);
        setFlybyWindows([]);
        setSummaryByWindow(new Map());
        setSelectedWindowId("");
      } finally {
        setLoading(false);
      }
    },
    [databaseId, tableFlybys, tableSummaries, tables]
  );

  useEffect(() => {
    if (!selectedCometId) return;
    loadCometData(selectedCometId);
  }, [selectedCometId, loadCometData]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    const channels = [`databases.${databaseId}.tables.${tableComets}.rows`];
    try {
      unsubscribe = client.subscribe(channels, () => {
        loadComets();
      });
    } catch (err) {
      console.warn("Realtime subscribe failed for comets", err);
    }
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [databaseId, tableComets, loadComets]);

  useEffect(() => {
    if (!selectedCometId) return;
    let unsubscribe: (() => void) | undefined;
    const channels = [
      `databases.${databaseId}.tables.${tableSummaries}.rows`,
      `databases.${databaseId}.tables.${tableFlybys}.rows`,
    ];
    const handler = async (event: { events?: string[]; payload?: SummaryRecord | FlybyRow }) => {
      const events = event.events ?? [];
      const isSummaryEvent = events.some((evt) => evt.includes(`tables.${tableSummaries}.rows`));
      const isFlybyEvent = events.some((evt) => evt.includes(`tables.${tableFlybys}.rows`));
      if (!isSummaryEvent && !isFlybyEvent) return;
      const hasMutation = events.some((evt) => /\.(create|update|delete)$/i.test(evt));
      if (!hasMutation) return;
      const payload = event.payload as SummaryRecord | FlybyRow | undefined;
      const cometFromPayload = payload
        ? getRelationId((payload as SummaryRecord).comet ?? (payload as FlybyRow).comet)
        : null;
      if (cometFromPayload && cometFromPayload !== selectedCometId) return;
      if (!cometFromPayload && payload?.$id) {
        try {
          if (isSummaryEvent) {
            const row = (await tables.getRow({
              databaseId,
              tableId: tableSummaries,
              rowId: payload.$id,
              queries: [
                Query.select(["comet.$id"]),
              ],
            })) as SummaryRecord;
            const cometId = getRelationId(row.comet);
            if (cometId && cometId !== selectedCometId) return;
          } else if (isFlybyEvent) {
            const row = (await tables.getRow({
              databaseId,
              tableId: tableFlybys,
              rowId: payload.$id,
              queries: [Query.select(["comet.$id"])],
            })) as FlybyRow;
            const cometId = getRelationId(row.comet);
            if (cometId && cometId !== selectedCometId) return;
          }
        } catch (err) {
          console.warn("Realtime lookup failed", err);
        }
      }
      await loadCometData(selectedCometId);
    };
    try {
      unsubscribe = client.subscribe(channels, handler);
    } catch (err) {
      console.warn("Realtime subscribe failed for summaries/flybys", err);
    }
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [databaseId, tableSummaries, tableFlybys, selectedCometId, tables, loadCometData]);

  const selectedSummary = selectedWindowId ? summaryByWindow.get(selectedWindowId) ?? null : null;
  const selectedWindow = selectedWindowId
    ? flybyWindows.find((window) => window.id === selectedWindowId) ?? null
    : null;

  const handleGenerate = useCallback(
    async (windowToUse: FlybyWindow | null) => {
      if (!windowToUse || !selectedCometId) {
        setPanelError("Select a comet and flyby window first.");
        return;
      }
      if (pendingWindowId) return;
      setPanelError(null);
      setStatusMessage(null);
      setPendingWindowId(windowToUse.id);
      setStatusMessage("Generating summary…");
      try {
        const exec = await functions.createExecution({
          functionId,
          body: JSON.stringify({
            modelType: "summary",
            cometId: selectedCometId,
            fromFlybyId: windowToUse.from.$id,
            toFlybyId: windowToUse.to.$id,
          }),
        });

        const execResponse = getExecutionOutput(exec);

        if (exec.status !== "completed") {
          setStatusMessage(`Execution status: ${exec.status}`);
          return;
        }

        if (!execResponse) {
          setStatusMessage("Summary requested. Waiting for update…");
          await loadCometData(selectedCometId);
          return;
        }

        try {
          const parsed = JSON.parse(String(execResponse));
          const summaryId = parsed?.summaryId ?? parsed?.summary_id;
          if (summaryId) {
            const row = (await tables.getRow({
              databaseId,
              tableId: tableSummaries,
              rowId: summaryId,
            })) as SummaryRecord;
            const fromId = getRelationId(row.from_flyby) ?? windowToUse.from.$id;
            const toId = getRelationId(row.to_flyby) ?? windowToUse.to.$id;
            if (fromId && toId) {
              const key = makeWindowKey(fromId, toId);
              setSummaryByWindow((prev) => new Map(prev).set(key, row));
              setSelectedWindowId(key);
            }
            setStatusMessage("Summary generated successfully.");
          } else {
            setStatusMessage(parsed?.message ?? "Summary generated. Waiting for update…");
            await loadCometData(selectedCometId);
          }
        } catch {
          setStatusMessage(String(execResponse));
          await loadCometData(selectedCometId);
        }
      } catch (err) {
        setPanelError(`Generation failed: ${String((err as Error)?.message ?? err)}`);
        setStatusMessage(null);
      } finally {
        setPendingWindowId(null);
      }
    },
    [databaseId, functionId, functions, loadCometData, pendingWindowId, selectedCometId, tableSummaries, tables]
  );

  return (
    <CockpitPanel className="h-full">
      <CockpitPanelHeader
        title="Summary Uplink"
        subtitle="Generate historical briefing"
        actions={
          <Dropdown
            value={selectedCometId}
            onChange={setSelectedCometId}
            items={
              comets.length > 0
                ? comets.map((row) => ({ value: row.$id, label: formatCometLabel(row) }))
                : [{ value: "", label: "No comets available" }]
            }
            className="min-w-[14rem]"
          />
        }
      />

      <div className="flex h-full flex-col gap-4 p-6 text-xs text-slate-200/80">
        {panelError ? (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-[11px] text-red-200">
            {panelError}
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.35em] text-cyan-200/70">Flyby Windows</span>
              {loading ? <span className="text-[10px] uppercase tracking-[0.3em] text-cyan-200/60">Loading…</span> : null}
            </div>
            <ScrollArea className="mt-3 flex-1 pr-3">
              <div className="space-y-2 pb-4">
                {flybyWindows.length === 0 ? (
                  <div className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[11px] text-slate-300/80">
                    No flybys found for this comet.
                  </div>
                ) : (
                  flybyWindows.map((window) => {
                    const summary = summaryByWindow.get(window.id);
                    const isSelected = selectedWindowId === window.id;
                    const isPending = pendingWindowId === window.id;
                    return (
                      <div
                        key={window.id}
                        className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 transition ${isSelected
                            ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-100"
                            : "border-white/10 bg-white/5 text-slate-200/80"
                          }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedWindowId(window.id);
                            setStatusMessage(null);
                          }}
                          className="flex flex-1 flex-col text-left"
                        >
                          <span className="text-[11px] uppercase tracking-[0.3em]">
                            {formatYear(window.from.year)} → {formatYear(window.to.year)}
                          </span>
                          <span className="text-[10px] text-slate-300/70">
                            IDs {window.from.$id.slice(0, 8)}… / {window.to.$id.slice(0, 8)}…
                          </span>
                          <span className={`text-[10px] ${summary ? "text-emerald-300/80" : "text-cyan-200/60"}`}>
                            {summary ? "Summary available" : "Summary missing"}
                          </span>
                        </button>
                        {!summary ? (
                          <Button
                            size="sm"
                            variant="space"
                            onClick={() => handleGenerate(window)}
                            disabled={Boolean(pendingWindowId) && pendingWindowId !== window.id}
                          >
                            {isPending ? (
                              <span className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em]">
                                <Spinner />
                                Generating
                              </span>
                            ) : (
                              "Generate"
                            )}
                          </Button>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-start justify-between gap-3 text-[10px] uppercase tracking-[0.35em] text-cyan-200/70">
              <div className="flex flex-col gap-1">
                <span>AI Generated Summary</span>
                {selectedWindow ? (
                  <span className="text-[10px] text-slate-300/70">
                    Window {formatYear(selectedWindow.from.year)} → {formatYear(selectedWindow.to.year)}
                  </span>
                ) : null}
              </div>
              {statusMessage ? <span className="text-[10px] text-cyan-200/70">{statusMessage}</span> : null}
            </div>
            <div className="mt-3 flex flex-1 flex-col overflow-hidden">
              {selectedSummary ? (
                <>
                  <div className="flex items-start justify-between gap-3 text-[11px] uppercase tracking-[0.3em] text-cyan-100">
                    <span>{selectedSummary.title ?? "Summary"}</span>
                    <span className="text-[10px] text-cyan-200/70">
                      {selectedSummary.generated_at ? new Date(selectedSummary.generated_at).toLocaleString() : ""}
                    </span>
                  </div>
                  <ScrollArea className="mt-3 flex-1 pr-3 text-[13px] leading-relaxed text-slate-200/90">
                    <p className="whitespace-pre-wrap">{selectedSummary.summary ?? "No summary available."}</p>
                  </ScrollArea>
                  <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-cyan-200/60">
                    <span>Model: {selectedSummary.llm_model_used ?? "Unknown"}</span>
                    <span className="rounded-md border border-emerald-400/60 bg-emerald-500/15 px-2 py-1 text-[9px] tracking-[0.45em] text-emerald-100">
                      AI GENERATED
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center text-center text-[11px] text-slate-300/70">
                  {selectedWindow ? "No summary exists yet for this window." : "Select a flyby window to view its briefing."}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </CockpitPanel>
  );
}
