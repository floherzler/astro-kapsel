"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import client from "@/lib/appwrite";
import { TablesDB, Functions, Query } from "appwrite";
import type { Models } from "appwrite";
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
  image_url?: string | null;
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

function getYearValue(row: FlybyRow): number {
  if (typeof row.year === "number" && Number.isFinite(row.year)) return row.year;
  const numeric = Number(row.year);
  return Number.isFinite(numeric) ? numeric : Number.NEGATIVE_INFINITY;
}

function sortFlybys(rows: FlybyRow[]) {
  return rows.slice().sort((a, b) => {
    const ay = getYearValue(a);
    const by = getYearValue(b);
    return ay - by;
  });
}

function buildWindows(flybys: FlybyRow[]): FlybyWindow[] {
  if (flybys.length < 2) return [];
  const sorted = sortFlybys(flybys);
  const windows: FlybyWindow[] = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const candidates = [sorted[i], sorted[i + 1]].sort((a, b) => getYearValue(a) - getYearValue(b));
    const from = candidates[0];
    const to = candidates[1];
    windows.push({
      id: makeWindowKey(from.$id, to.$id),
      from,
      to,
    });
  }
  return windows.sort((a, b) => getYearValue(b.from) - getYearValue(a.from));
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

type SummaryPanelContextValue = {
  comets: CometRow[];
  selectedCometId: string;
  setSelectedCometId: (id: string) => void;
  flybyWindows: FlybyWindow[];
  summaryByWindow: Map<string, SummaryRecord>;
  selectedWindowId: string;
  setSelectedWindowId: (id: string) => void;
  selectedSummary: SummaryRecord | null;
  selectedWindow: FlybyWindow | null;
  statusMessage: string | null;
  panelError: string | null;
  loading: boolean;
  pendingWindowId: string | null;
  handleGenerate: (windowToUse: FlybyWindow | null) => Promise<void>;
  clearStatus: () => void;
  refresh: () => Promise<void>;
};

const SummaryPanelContext = createContext<SummaryPanelContextValue | null>(null);

function useSummaryPanelState(): SummaryPanelContextValue {
  const databaseId =
    process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || "astroDB";
  const tableComets =
    process.env.NEXT_PUBLIC_APPWRITE_TABLE_COMETS || process.env.APPWRITE_TABLE_COMETS || "comets";
  const tableFlybys =
    process.env.NEXT_PUBLIC_APPWRITE_TABLE_FLYBYS || process.env.APPWRITE_TABLE_FLYBYS || "flybys";
  const tableSummaries =
    process.env.NEXT_PUBLIC_APPWRITE_TABLE_SUMMARIES ||
    process.env.APPWRITE_TABLE_SUMMARIES ||
    "summaries";
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
      if (rows.length > 0) {
        setSelectedCometId((prev) => prev || rows[0].$id);
      }
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
                "image_url",
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

        // Restore last selection for this comet from localStorage if available
        let restoredId = "";
        try {
          if (typeof window !== "undefined") {
            const key = `cockpit:selectedWindow:${cometId}`;
            const val = window.localStorage.getItem(key);
            if (val && windows.some((w) => w.id === val)) restoredId = val;
          }
        } catch {
          // ignore storage errors
        }
        const defaultWindowId = restoredId || windows[0]?.id || "";
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
              queries: [Query.select(["comet.$id"])],
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

  const selectedSummary = useMemo(
    () => (selectedWindowId ? summaryByWindow.get(selectedWindowId) ?? null : null),
    [selectedWindowId, summaryByWindow]
  );

  const selectedWindow = useMemo(
    () => (selectedWindowId ? flybyWindows.find((window) => window.id === selectedWindowId) ?? null : null),
    [selectedWindowId, flybyWindows]
  );

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
      setStatusMessage("Generating briefing and visualization…");
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
    [
      databaseId,
      functionId,
      functions,
      loadCometData,
      pendingWindowId,
      selectedCometId,
      tableSummaries,
      tables,
    ]
  );

  const clearStatus = useCallback(() => {
    setStatusMessage(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!selectedCometId) return;
    await loadCometData(selectedCometId);
  }, [selectedCometId, loadCometData]);

  return useMemo(
    () => ({
      comets,
      selectedCometId,
      setSelectedCometId,
      flybyWindows,
      summaryByWindow,
      selectedWindowId,
      setSelectedWindowId,
      selectedSummary,
      selectedWindow,
      statusMessage,
      panelError,
      loading,
      pendingWindowId,
      handleGenerate,
      clearStatus,
      refresh,
    }),
    [
      comets,
      selectedCometId,
      flybyWindows,
      summaryByWindow,
      selectedWindowId,
      selectedSummary,
      selectedWindow,
      statusMessage,
      panelError,
      loading,
      pendingWindowId,
      handleGenerate,
      clearStatus,
      refresh,
    ]
  );
}

export function SummaryProvider({ children }: { children: ReactNode }) {
  const value = useSummaryPanelState();
  return <SummaryPanelContext.Provider value={value}>{children}</SummaryPanelContext.Provider>;
}

export default SummaryProvider;

function useSummaryPanelContext() {
  const ctx = useContext(SummaryPanelContext);
  if (!ctx) {
    throw new Error("Summary panel components must be wrapped in <SummaryProvider />");
  }
  return ctx;
}

// Expose lightweight layout info for outer layouts without leaking full context
export function useSummaryLayoutInfo() {
  const { selectedWindow } = useSummaryPanelContext();
  const duration = useMemo(() => {
    if (!selectedWindow) return null;
    return Math.abs(getYearValue(selectedWindow.to) - getYearValue(selectedWindow.from));
  }, [selectedWindow]);
  const orientation = duration != null && duration > 100 ? "poster" : "wide"; // wide covers 16:9 and 21:9
  const aspect = useMemo(() => {
    if (duration == null) return "16 / 9";
    if (duration < 10) return "16 / 9";
    if (duration <= 100) return "21 / 9";
    return "9 / 16";
  }, [duration]);
  const type = aspect === "21 / 9" ? "21:9" : aspect === "9 / 16" ? "9:16" : "16:9";
  const ratio = type === "21:9" ? 21 / 9 : type === "9:16" ? 9 / 16 : 16 / 9;
  return { orientation, aspect, duration, type, ratio } as const;
}

export function SummaryFlybyPanel({ className = "" }: { className?: string }) {
  const {
    comets,
    selectedCometId,
    setSelectedCometId,
    flybyWindows,
    summaryByWindow,
    selectedWindowId,
    setSelectedWindowId,
    handleGenerate,
    pendingWindowId,
    loading,
    panelError,
    clearStatus,
  } = useSummaryPanelContext();

  // Persist selected window per comet
  useEffect(() => {
    if (!selectedCometId || !selectedWindowId) return;
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          `cockpit:selectedWindow:${selectedCometId}`,
          selectedWindowId
        );
      }
    } catch {
      // ignore
    }
  }, [selectedCometId, selectedWindowId]);

  const currentIndex = useMemo(() => {
    const idx = flybyWindows.findIndex((w) => w.id === selectedWindowId);
    return idx >= 0 ? idx : 0;
  }, [flybyWindows, selectedWindowId]);

  const go = useCallback(
    (dir: 1 | -1) => {
      if (flybyWindows.length === 0) return;
      const next = (currentIndex + dir + flybyWindows.length) % flybyWindows.length;
      const win = flybyWindows[next];
      setSelectedWindowId(win.id);
      clearStatus();
    },
    [currentIndex, flybyWindows, setSelectedWindowId, clearStatus]
  );

  return (
    <div
      className={`flex min-h-0 flex-col rounded-2xl border border-slate-800/60 bg-slate-950/80 p-4 text-xs text-slate-200/80 ${className}`}
    >
      {/* Compact header */}
      <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.45em] text-cyan-200/80">Summary Uplink</p>
          <p className="text-[10px] uppercase tracking-[0.35em] text-slate-300/70">Select flyby window</p>
        </div>
        <Dropdown
          value={selectedCometId}
          onChange={(value) => {
            setSelectedCometId(value);
            clearStatus();
          }}
          items={
            comets.length > 0
              ? comets.map((row) => ({ value: row.$id, label: formatCometLabel(row) }))
              : [{ value: "", label: "No comets available" }]
          }
          className="min-w-[13rem]"
        />
      </div>

      {panelError ? (
        <div className="mb-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-200">
          {panelError}
        </div>
      ) : null}

      {/* Carousel-like selector with arrows (minified) */}
      <div className="mt-1 flex items-center gap-2">
        <Button
          size="sm"
          variant="space"
          onClick={() => go(-1)}
          disabled={flybyWindows.length === 0}
          aria-label="Previous window"
        >
          ←
        </Button>

        <div className="flex-1">
          {flybyWindows.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center text-[11px] text-slate-300/80">
              {loading ? "Loading…" : "No flybys found for this comet."}
            </div>
          ) : (
            (() => {
              const window = flybyWindows[currentIndex];
              const summary = summaryByWindow.get(window.id);
              const isPending = pendingWindowId === window.id;
              return (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedWindowId(window.id);
                      clearStatus();
                    }}
                    className="flex flex-1 flex-col text-left"
                  >
                    <span className="text-[11px] uppercase tracking-[0.3em] text-cyan-100">
                      {formatYear(window.from.year)} → {formatYear(window.to.year)}
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
            })()
          )}
        </div>

        <Button
          size="sm"
          variant="space"
          onClick={() => go(1)}
          disabled={flybyWindows.length === 0}
          aria-label="Next window"
        >
          →
        </Button>
      </div>
    </div>
  );
}

export function SummaryDetailsPanel({ className = "" }: { className?: string }) {
  const {
    selectedSummary,
    selectedWindow,
    statusMessage,
    panelError,
    pendingWindowId,
    selectedWindowId,
  } = useSummaryPanelContext();

  const isPending = Boolean(pendingWindowId && pendingWindowId === selectedWindowId);
  const generatedAt = selectedSummary?.generated_at
    ? new Date(selectedSummary.generated_at).toLocaleString()
    : null;

  return (
    <div
      className={`flex min-h-0 flex-col p-6 text-sm text-slate-200/90 ${className}`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.45em] text-cyan-200/80">AI Briefing {selectedWindow
            ? `Window ${formatYear(selectedWindow.from.year)} → ${formatYear(selectedWindow.to.year)}`
            : "Select a window to review"}
          </p>
        </div>
        {statusMessage ? (
          <span className="text-[10px] uppercase tracking-[0.35em] text-cyan-200/70">
            {statusMessage}
          </span>
        ) : null}
      </div>

      {panelError ? (
        <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-[11px] text-red-200">
          {panelError}
        </div>
      ) : null}

      {isPending ? (
        <div className="mt-4 flex items-center gap-3 text-[11px] uppercase tracking-[0.35em] text-cyan-200/70">
          <Spinner />
          Generating content…
        </div>
      ) : null}

      <div className="mt-5 flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-white/5">
        <div className="flex items-start justify-between gap-3 px-4 py-3 text-[11px] uppercase tracking-[0.3em] text-cyan-100">
          <span>{selectedSummary?.title ?? "Summary"}</span>
          {generatedAt ? <span className="text-[10px] text-cyan-200/70">{generatedAt}</span> : null}
        </div>
        <ScrollArea className="flex-1 px-4 pb-4 pr-6 text-[13px] leading-relaxed text-slate-200/90">
          <p className="whitespace-pre-wrap">
            {selectedSummary?.summary ??
              (selectedWindow
                ? "No summary exists yet for this window. Generate one from the flyby list above."
                : "Select a flyby window to view or generate its mission briefing.")}
          </p>
        </ScrollArea>
        <div className="flex items-center justify-between px-4 pb-3 text-[10px] uppercase tracking-[0.3em] text-cyan-200/60">
          <span>Model: {selectedSummary?.llm_model_used ?? "Unknown"}</span>
          {selectedSummary ? (
            <span className="rounded-md border border-emerald-400/60 bg-emerald-500/15 px-2 py-1 text-[9px] tracking-[0.45em] text-emerald-100">
              AI GENERATED
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function SummaryVisualizationPanel({ className = "" }: { className?: string }) {
  const { selectedSummary, selectedWindow, handleGenerate, pendingWindowId } = useSummaryPanelContext();
  const isPending = selectedWindow ? pendingWindowId === selectedWindow.id : false;
  const isDisabled = !selectedWindow || (pendingWindowId && pendingWindowId !== selectedWindow?.id);

  // Choose aspect ratio by flyby duration
  const aspect = useMemo(() => {
    if (!selectedWindow) return "16 / 9";
    const from = getYearValue(selectedWindow.from);
    const to = getYearValue(selectedWindow.to);
    const delta = Math.abs(to - from);
    if (delta < 10) return "16 / 9"; // standard
    if (delta <= 100) return "21 / 9"; // panoramic
    return "9 / 16"; // poster
  }, [selectedWindow]);
  const isPoster = aspect === "9 / 16";

  return (
    <div className={`relative flex h-full w-full items-center justify-center overflow-hidden p-3 ${className}`}>
      <div className="relative h-full w-full overflow-hidden rounded-xl border border-white/10 bg-white/5 shadow-inner">
        {selectedSummary?.image_url ? (
          <img
            src={selectedSummary.image_url}
            alt={selectedSummary.title ?? "Generated comet visualization"}
            className="h-full w-full object-contain"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center px-4 text-center text-[12px] text-slate-300/70">
            <div className="max-w-[22rem]">
              <span className="text-[11px] uppercase tracking-[0.35em] text-cyan-200/70">Visualization pending</span>
              <p className="mt-2 text-sm text-slate-300/80">
                {selectedWindow
                  ? "Generate the visualization for the selected window."
                  : "Select a flyby window and request a visualization."}
              </p>
            </div>
          </div>
        )}
        {selectedSummary?.image_url ? (
          <a href={selectedSummary.image_url} target="_blank" rel="noreferrer" className="absolute right-3 top-3">
            <Button size="sm" variant="space">
              Open
            </Button>
          </a>
        ) : null}
        <div className="absolute inset-x-0 bottom-3 flex justify-center">
          <Button
            size="sm"
            variant="space"
            onClick={() => handleGenerate(selectedWindow ?? null)}
            disabled={isDisabled || isPending}
          >
            {selectedSummary?.image_url ? null : isPending ? (
              <span className="flex items-center gap-2">
                <Spinner />
                Generating…
              </span>
            ) : (
              "Generate Visualization"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
