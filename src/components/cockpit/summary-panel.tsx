"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import Image from "next/image";
import client from "@/lib/appwrite";
import { TablesDB, Functions, Query } from "appwrite";
import type { Models } from "appwrite";
import { Dropdown } from "@/components/ui/dropdown";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type CometRow = {
  $id: string;
  name?: string | null;
  designation?: string | null;
  prefix?: string | null;
  comet_status?: string | null;
  is_viable?: boolean | null;
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

const FAL_AUDIO_URL = "https://fra.cloud.appwrite.io/v1/storage/buckets/summaryImages/files/falFemale/view?project=68ea4bc00031046d613e";

function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-[1.5px] border-cyan-200/70 border-t-transparent"
      aria-hidden="true"
    />
  );
}

function PlayIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`h-3.5 w-3.5 ${className}`}
    >
      <path d="M8 5.143c0-1.316 1.43-2.093 2.57-1.39l8.09 4.857c1.127.677 1.127 2.103 0 2.78l-8.09 4.857C9.43 17.95 8 17.173 8 15.857z" />
    </svg>
  );
}

function PauseIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`h-3.5 w-3.5 ${className}`}
    >
      <path d="M7 5.25c0-.69.56-1.25 1.25-1.25h1.5C10.44 4 11 4.56 11 5.25v13.5c0 .69-.56 1.25-1.25 1.25h-1.5C7.56 20 7 19.44 7 18.75zM13 5.25C13 4.56 13.56 4 14.25 4h1.5C16.44 4 17 4.56 17 5.25v13.5c0 .69-.56 1.25-1.25 1.25h-1.5c-.69 0-1.25-.56-1.25-1.25z" />
    </svg>
  );
}

type PointerPosition = { x: number; y: number };

function distanceBetween(a: PointerPosition, b: PointerPosition) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function midpointBetween(a: PointerPosition, b: PointerPosition) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

const MIN_IMAGE_SCALE = 1;
const MAX_IMAGE_SCALE = 4;

function clampScale(value: number) {
  return Math.min(MAX_IMAGE_SCALE, Math.max(MIN_IMAGE_SCALE, value));
}

function InteractiveImage({ src, alt }: { src: string; alt?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [transform, setTransform] = useState<{ x: number; y: number; scale: number }>({
    x: 0,
    y: 0,
    scale: 1,
  });
  const transformRef = useRef(transform);
  const pointersRef = useRef<Map<number, PointerPosition>>(new Map());
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  const updateScaleAtPoint = useCallback((nextScale: number, point: PointerPosition) => {
    setTransform((prev) => {
      const clampedScale = clampScale(nextScale);
      if (!containerRef.current) return { ...prev, scale: clampedScale };
      const rect = containerRef.current.getBoundingClientRect();
      const px = point.x - rect.left;
      const py = point.y - rect.top;
      const scaleRatio = clampedScale / prev.scale;
      return {
        scale: clampedScale,
        x: px - scaleRatio * (px - prev.x),
        y: py - scaleRatio * (py - prev.y),
      };
    });
  }, []);

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      const { clientX, clientY, deltaY } = event;
      const currentScale = transformRef.current.scale;
      const scaleFactor = deltaY > 0 ? 0.9 : 1.1;
      const nextScale = clampScale(currentScale * scaleFactor);
      if (nextScale === currentScale) return;
      updateScaleAtPoint(nextScale, { x: clientX, y: clientY });
    },
    [updateScaleAtPoint]
  );

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    containerRef.current?.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 1) {
      isDraggingRef.current = true;
    } else if (pointersRef.current.size === 2) {
      const points = Array.from(pointersRef.current.values());
      pinchRef.current = {
        distance: distanceBetween(points[0], points[1]),
        scale: transformRef.current.scale,
      };
    }
  }, []);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    const prevPoint = pointersRef.current.get(event.pointerId);
    if (!prevPoint) return;
    const nextPoint = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, nextPoint);

    if (pointersRef.current.size === 2) {
      isDraggingRef.current = true;
      const [p1, p2] = Array.from(pointersRef.current.values());
      const pinchState = pinchRef.current;
      if (!pinchState) {
        pinchRef.current = {
          distance: distanceBetween(p1, p2),
          scale: transformRef.current.scale,
        };
        return;
      }
      const newDistance = distanceBetween(p1, p2);
      if (newDistance <= 0) return;
      const scaleMultiplier = newDistance / pinchState.distance;
      const nextScale = clampScale(pinchState.scale * scaleMultiplier);
      const midpoint = midpointBetween(p1, p2);
      updateScaleAtPoint(nextScale, midpoint);
      pinchRef.current = { distance: newDistance, scale: nextScale };
    } else if (pointersRef.current.size === 1 && isDraggingRef.current) {
      const dx = nextPoint.x - prevPoint.x;
      const dy = nextPoint.y - prevPoint.y;
      if (dx === 0 && dy === 0) return;
      setTransform((prev) => ({
        ...prev,
        x: prev.x + dx,
        y: prev.y + dy,
      }));
    }
  }, [updateScaleAtPoint]);

  const endPointer = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.delete(event.pointerId);
    }
    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }
    isDraggingRef.current = pointersRef.current.size > 0;
    containerRef.current?.releasePointerCapture(event.pointerId);
  }, []);

  const handleDoubleClick = useCallback(() => {
    setTransform({ x: 0, y: 0, scale: 1 });
    pinchRef.current = null;
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 cursor-grab overflow-hidden rounded-3xl"
      style={{ touchAction: "none" }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointer}
      onPointerLeave={endPointer}
      onPointerCancel={endPointer}
      onDoubleClick={handleDoubleClick}
    >
      <div
        className="relative h-full w-full"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: "0 0",
          willChange: "transform",
          transition: isDraggingRef.current ? "none" : "transform 120ms ease-out",
        }}
      >
        <Image
          src={src}
          alt={alt ?? ""}
          fill
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="select-none object-contain"
          draggable={false}
          unoptimized
        />
      </div>
      <div className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/40 px-2 py-1 text-[10px] uppercase tracking-[0.3em] text-white/70">
        {transform.scale.toFixed(2)}x
      </div>
    </div>
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
  const base = name && designation && name !== designation ? `${name} · ${designation}` : name ?? designation ?? row.$id;
  const prefix = row.prefix?.trim();
  return prefix ? `${prefix} · ${base}` : base;
}

function formatYear(value?: number | null): string {
  if (value == null) return "Unknown";
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return Math.round(numeric).toString();
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
  return windows.sort((a, b) => getYearValue(a.from) - getYearValue(b.from));
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

  const selectedComet = useMemo(
    () => comets.find((row) => row.$id === selectedCometId) ?? null,
    [comets, selectedCometId]
  );
  const isSelectedViable = Boolean(selectedComet?.is_viable);

  const falAudioRef = useRef<HTMLAudioElement | null>(null);
  const falAudioCleanupRef = useRef<(() => void) | null>(null);
  const falAudioUnlockedRef = useRef(false);
  const [isFalAudioPlaying, setIsFalAudioPlaying] = useState(false);
  const [isFalAudioLoading, setIsFalAudioLoading] = useState(false);
  const [falAudioError, setFalAudioError] = useState<string | null>(null);

  const describePlaybackError = useCallback((err: unknown) => {
    if (err instanceof DOMException) {
      return err.message ? `${err.name}: ${err.message}` : err.name;
    }
    if (err instanceof Error) {
      return err.message;
    }
    if (typeof err === "string") return err;
    return String(err ?? "unknown error");
  }, []);


  const ensureFalAudio = useCallback(() => {
    if (falAudioRef.current) return falAudioRef.current;

    if (falAudioCleanupRef.current) {
      falAudioCleanupRef.current();
      falAudioCleanupRef.current = null;
    }

    const audio = new Audio(FAL_AUDIO_URL);
    audio.preload = "auto";
    audio.loop = false;
    // @ts-expect-error playsInline exists on HTMLMediaElement in supporting browsers
    audio.playsInline = true;

    const handlePlaying = () => {
      setIsFalAudioLoading(false);
      setIsFalAudioPlaying(true);
      setFalAudioError(null);
      audio.muted = false;
      audio.volume = 1;
    };
    const handlePause = () => {
      setIsFalAudioLoading(false);
      setIsFalAudioPlaying(false);
    };
    const handleEnded = () => {
      setIsFalAudioLoading(false);
      setIsFalAudioPlaying(false);
      audio.currentTime = 0;
    };
    const handleError = () => {
      setIsFalAudioLoading(false);
      setIsFalAudioPlaying(false);
      audio.currentTime = 0;
    };

    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    falAudioCleanupRef.current = () => {
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };

    falAudioRef.current = audio;
    return audio;
  }, [setFalAudioError, setIsFalAudioLoading, setIsFalAudioPlaying]);

  const handleFalAudioToggle = useCallback(() => {
    const audio = ensureFalAudio();
    if (!audio) return;

    if (!audio.paused && !audio.ended) {
      setIsFalAudioLoading(false);
      setIsFalAudioPlaying(false);
      setFalAudioError(null);
      audio.pause();
      audio.currentTime = 0;
      return;
    }

    setIsFalAudioLoading(true);
    audio.currentTime = 0;
    setFalAudioError(null);
    audio.muted = true;
    audio.volume = 1;
    const start = audio.play();

    const onSuccess = () => {
      window.setTimeout(() => {
        audio.muted = false;
      }, 40);
    };

    const onFailure = (err?: unknown) => {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
      audio.volume = 1;
      setIsFalAudioLoading(false);
      setIsFalAudioPlaying(false);
      if (err) {
        console.error("[FAL] play() failed", err);
      }
      setFalAudioError(`Audio playback failed: ${describePlaybackError(err)}`);
    };

    if (start && typeof start.then === "function") {
      start.then(onSuccess).catch((err) => onFailure(err));
    } else {
      onSuccess();
    }
  }, [describePlaybackError, ensureFalAudio, setFalAudioError, setIsFalAudioLoading, setIsFalAudioPlaying]);

  useEffect(() => {
    return () => {
      if (falAudioCleanupRef.current) {
        falAudioCleanupRef.current();
        falAudioCleanupRef.current = null;
      }
      const audio = falAudioRef.current;
      if (audio) {
        audio.pause();
        falAudioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (falAudioUnlockedRef.current) return;
    if (typeof window === "undefined") return;

    const unlock = () => {
      if (falAudioUnlockedRef.current) return;
      const audio = ensureFalAudio();
      if (!audio) return;
      falAudioUnlockedRef.current = true;
      audio.muted = true;
      const reset = () => {
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch {
          // ignore
        }
        audio.muted = false;
      };
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.then === "function") {
        playPromise.then(reset).catch(reset);
      } else {
        reset();
      }
    };

    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [ensureFalAudio]);

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

  const activeWindow = flybyWindows[currentIndex] ?? null;
  const summary = activeWindow ? summaryByWindow.get(activeWindow.id) : undefined;
  const isPending = activeWindow ? pendingWindowId === activeWindow.id : false;
  const fromY = activeWindow ? getYearValue(activeWindow.from) : Number.NEGATIVE_INFINITY;
  const toY = activeWindow ? getYearValue(activeWindow.to) : Number.NEGATIVE_INFINITY;
  const delta = Number.isFinite(fromY) && Number.isFinite(toY) ? Math.abs(toY - fromY) : 0;
  const deltaRounded = Math.round(delta);

  if (!activeWindow) {
    return (
      <Card
        className={`aspect-square w-full flex min-h-0 flex-col overflow-visible rounded-2xl border border-slate-800/60 bg-gradient-to-b from-slate-950/85 via-slate-950/70 to-slate-950/85 text-xs text-slate-200/85 cockpit-panel-glow ${className}`}
      >
        <div className="flex h-full flex-col items-center justify-center gap-6 px-4 py-6 text-center">
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
            className="w-full max-w-xs text-center"
          />
          <div className="text-[12px] text-slate-300/80">
            {loading ? "Loading…" : "No flybys found for this comet."}
          </div>
        </div>
      </Card>
    );
  }

  const hasSummary = Boolean(summary);
  const generationBlocked = !isSelectedViable;
  const otherWindowPending = Boolean(pendingWindowId) && pendingWindowId !== activeWindow.id;
  const buttonDisabled = generationBlocked || hasSummary || otherWindowPending;
  const shouldPulse = !generationBlocked && !hasSummary && !isPending;

  return (
    <Card
      className={`relative aspect-square w-full flex min-h-0 flex-col overflow-visible rounded-2xl border border-slate-800/60 bg-gradient-to-b from-slate-950/85 via-slate-950/70 to-slate-950/85 text-xs text-slate-200/85 cockpit-panel-glow ${className}`}
    >
      {panelError ? (
        <div className="absolute top-4 right-4 rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-1.5 text-[11px] text-red-200/90 shadow-[0_0_18px_rgba(248,113,113,0.35)]">
          {panelError}
        </div>
      ) : null}

      <div className="grid h-full grid-rows-7 items-center justify-items-center gap-3 px-4 py-6 sm:gap-4 sm:px-6 sm:py-8">
        <div className="flex w-full max-w-xs flex-col items-center justify-center gap-2 sm:max-w-sm">
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
            className="w-full min-w-0 text-center"
          />
        </div>

        <div className="text-[11px] uppercase tracking-[0.35em] text-cyan-200/75">
          Δ {deltaRounded}y
        </div>

        <div className="text-center text-base font-medium tracking-[0.5em] text-cyan-100 sm:text-lg">
          {formatYear(activeWindow.from.year)}
          <span className="px-2 text-cyan-300/80">→</span>
          {formatYear(activeWindow.to.year)}
        </div>

        <div className="relative flex items-center justify-center">
          <span
            className="fal-orb-glow absolute h-12 w-12 rounded-full bg-red-500/20 blur-2xl sm:h-16 sm:w-16"
            aria-hidden="true"
          />
          <span className="absolute h-10 w-10 rounded-full border border-red-400/40 bg-gradient-to-br from-red-500 via-red-600 to-red-700 shadow-[0_0_25px_rgba(248,113,113,0.55)] sm:h-12 sm:w-12" aria-hidden="true" />
          <span className="fal-orb-core relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-red-500 via-red-600 to-red-700 shadow-[0_0_35px_rgba(248,113,113,0.65)] sm:h-12 sm:w-12">
            <span className="h-2.5 w-2.5 rounded-full bg-red-200/90 shadow-[0_0_18px_rgba(248,113,113,0.9)] sm:h-3 sm:w-3" />
          </span>
        </div>

        <div className="relative flex w-full items-center justify-center gap-2">
          <HoverCard>
            <HoverCardTrigger className="group inline-flex items-center text-[11px] uppercase tracking-[0.35em] text-red-200/85 transition hover:text-red-100">
              <span className="whitespace-nowrap cursor-help select-none">FAL</span>
            </HoverCardTrigger>
            <HoverCardContent
              align="center"
              side="center"
              sideOffset={-6}
              className="min-w-[16rem] border-red-500/0 bg-slate-950/95 shadow-[0_28px_70px_-38px_rgba(248,113,113,0.6)] sm:min-w-[18rem]"
            >
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="relative flex h-10 w-10 items-center justify-center sm:h-12 sm:w-12">
                  <span className="absolute h-16 w-16 rounded-full bg-red-500/25 blur-2xl sm:h-20 sm:w-20" aria-hidden="true" />
                  <span className="absolute h-8 w-8 rounded-full border border-red-400/40 bg-red-600/30 shadow-[0_0_25px_rgba(248,113,113,0.55)] sm:h-12 sm:w-12" aria-hidden="true" />
                  <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-red-500 via-red-600 to-red-700 shadow-[0_0_30px_rgba(248,113,113,0.65)] sm:h-12 sm:w-12">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-200/90 shadow-[0_0_18px_rgba(248,113,113,0.9)] sm:h-3 sm:w-3" />
                  </span>
                </div>
                <div className="space-y-2 text-left text-[12px] leading-relaxed tracking-normal text-slate-200/90">
                  <p className="text-[11px] uppercase tracking-[0.45em] text-red-200/85">
                    fal.ai Operations
                  </p>
                  <p className="text-xs sm:text-sm">
                    Our fal.ai stack taps Gemini 2.5 Flash Lite for flyby briefings and Nano Banana image generation via Google models.
                  </p>
                  <p className="text-xs sm:text-sm">
                    Outputs are written back to Appwrite so the cockpit instantly reflects each generated window.
                  </p>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleFalAudioToggle();
            }}
            disabled={isFalAudioLoading}
            aria-label={isFalAudioPlaying ? "Pause FAL audio" : "Play FAL audio"}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-400/40 bg-slate-950/80 text-red-200/85 shadow-[0_0_10px_rgba(248,113,113,0.4)] transition hover:text-red-100 hover:border-red-300/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70 ${isFalAudioLoading ? "opacity-70" : ""
              }`}
          >
            {isFalAudioPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          {falAudioError ? (
            <span className="text-[11px] text-red-300/80" role="status" aria-live="polite">
              {falAudioError}
            </span>
          ) : null}
        </div>

        <div className="flex w-full max-w-[18rem] justify-center sm:max-w-[20rem]">
          <Button
            size="sm"
            variant="space"
            onClick={() => handleGenerate(activeWindow)}
            disabled={buttonDisabled}
            className={`w-full justify-center ${
              hasSummary
                ? "cursor-default border-cyan-400/25 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/15"
                : generationBlocked
                  ? "cursor-not-allowed border-slate-700/60 bg-slate-900/40 text-slate-300/70"
                  : shouldPulse
                    ? "animate-pulse"
                    : ""
            }`}
            style={shouldPulse ? { animationDuration: "2.4s" } : undefined}
          >
            {hasSummary ? (
              <span className="flex w-full items-center justify-center gap-2 text-[11px] uppercase tracking-[0.3em] text-cyan-200/85 sm:text-[12px]">
                Briefing ready
              </span>
            ) : generationBlocked ? (
              <span className="flex w-full items-center justify-center gap-2 text-[11px] uppercase tracking-[0.3em] text-slate-300/75 sm:text-[12px]">
                No recurring perihelion cycle
              </span>
            ) : isPending ? (
              <span className="flex w-full items-center justify-center gap-2 text-[11px] uppercase tracking-[0.3em] text-cyan-200/80 sm:text-[12px]">
                <Spinner /> Contacting FAL…
              </span>
            ) : (
              <span className="flex w-full items-center justify-center gap-2 text-[11px] uppercase tracking-[0.3em] text-cyan-200/85 sm:text-[12px]">
                Generate with FAL
              </span>
            )}
          </Button>
        </div>

        <div className="flex w-full items-center justify-center">
          <div className="flex items-center gap-3">
            {flybyWindows.map((win, dotIndex) => {
              const hasSummary = summaryByWindow.has(win.id);
              const dotSelected = selectedWindowId === win.id;
              const glowClasses = hasSummary
                ? "bg-emerald-400/80 shadow-[0_0_14px_rgba(52,211,153,0.6)]"
                : "bg-slate-500/60 shadow-[0_0_10px_rgba(148,163,184,0.35)]";
              return (
                <button
                  key={win.id}
                  type="button"
                  onClick={() => {
                    if (selectedWindowId !== win.id) {
                      setSelectedWindowId(win.id);
                      clearStatus();
                    }
                  }}
                  className={`group relative flex h-6 w-6 items-center justify-center rounded-full transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 ${dotSelected ? "ring-2 ring-cyan-300/70" : "ring-0 hover:scale-110"}`}
                  aria-label={`Select window ${dotIndex + 1}${hasSummary ? " – briefing ready" : " – no briefing yet"}`}
                >
                  <span
                    className={`block h-2.5 w-2.5 rounded-full transition-all duration-200 ${glowClasses} ${dotSelected ? "scale-125" : "opacity-70 group-hover:opacity-100"
                      }`}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function SummaryDetailsPanel({ className = "" }: { className?: string }) {
  const {
    selectedSummary,
    selectedWindow,
    statusMessage,
    pendingWindowId,
    selectedWindowId,
  } = useSummaryPanelContext();

  const isPending = Boolean(pendingWindowId && pendingWindowId === selectedWindowId);
  const generatedDate = selectedSummary?.generated_at ? new Date(selectedSummary.generated_at) : null;
  const generatedAtDisplay = generatedDate
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(generatedDate)
    : null;
  const hasSummary = Boolean(selectedSummary);
  const modelLabel = selectedSummary?.llm_model_used ?? "Unknown";

  const fallbackSummary = selectedWindow
    ? "No summary exists yet for this window. Generate one from the flyby list above."
    : "Select a flyby window to view or generate its mission briefing.";
  const summaryText = selectedSummary?.summary ?? fallbackSummary;
  const parsedSummaryParagraphs = summaryText
    .split(/\n{2,}/)
    .map((segment) => segment.replace(/\n+/g, " ").trim())
    .filter(Boolean);
  const normalizedSummaryParagraphs =
    parsedSummaryParagraphs.length > 0 ? parsedSummaryParagraphs : [summaryText.trim()];
  const pendingQuote =
    '"For a moment, nothing happened. Then, after a second or so, nothing continued to happen." - Douglas Adams, The Hitchhiker\'s Guide to the Galaxy';
  const summaryParagraphs =
    isPending && !hasSummary
      ? [...normalizedSummaryParagraphs, pendingQuote]
      : normalizedSummaryParagraphs;
  const statusIndicator = isPending ? (
    <Badge variant="secondary" className="flex items-center gap-2 border-cyan-400/40 bg-cyan-500/15 px-3 py-1.5 text-xs text-cyan-100">
      <Spinner />
      Generating
    </Badge>
  ) : statusMessage ? (
    <Badge variant="secondary" className="border-cyan-400/40 bg-cyan-500/15 px-3 py-1.5 text-xs text-cyan-100">
      {statusMessage}
    </Badge>
  ) : null;

  const summaryBody = hasSummary ? (
    <ScrollArea className="flex-1 px-4 pb-5 pr-6">
      <div className="space-y-4 text-[13px] leading-relaxed text-slate-200/90">
        {summaryParagraphs.map((paragraph, idx) => (
          <p key={idx}>{paragraph}</p>
        ))}
      </div>
    </ScrollArea>
  ) : (
    <div className="flex flex-1 items-center justify-center px-6 py-10 text-center">
      <div className="max-w-sm space-y-4 text-[13px] leading-relaxed text-slate-300/80">
        {summaryParagraphs.map((paragraph, idx) => (
          <p key={idx}>{paragraph}</p>
        ))}
      </div>
    </div>
  );

  return (
    <div className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-950/60 cockpit-panel-glow ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/5 px-4 py-3">
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-200/70">
            {hasSummary ? "Summary" : "Summary missing"}
          </p>
          <h2 className="max-w-xl text-lg font-medium tracking-[0.18em] text-slate-100 sm:text-xl">
            {selectedSummary?.title ?? "Awaiting AI briefing"}
          </h2>
        </div>
        {generatedAtDisplay ? (
          <span className="text-[11px] uppercase tracking-[0.3em] text-cyan-200/70">
            {generatedAtDisplay}
          </span>
        ) : null}
      </div>

      {summaryBody}

      <div className="flex flex-wrap items-center justify-center gap-3 border-t border-white/5 bg-slate-950/70 px-4 py-3">
        <Badge
          variant="secondary"
          className={`rounded-full px-3 py-1 text-[10px] tracking-[0.3em] ${hasSummary ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100" : "border-slate-500/40 bg-transparent text-slate-300"}`}
        >
          {hasSummary ? modelLabel : "no generations yet"}
        </Badge>
        {statusIndicator}
      </div>
    </div>
  );
}

export function SummaryVisualizationPanel({ className = "" }: { className?: string }) {
  const { selectedSummary, selectedWindow } = useSummaryPanelContext();

  return (
    <div className={`flex h-full w-full flex-col justify-between ${className}`}>
      <div className="relative flex-1 min-h-[220px] overflow-hidden">
        {selectedSummary?.image_url ? (
          <InteractiveImage
            src={selectedSummary.image_url}
            alt={selectedSummary.title ?? "Generated comet visualization"}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center px-6 text-center text-[12px] text-slate-300/70">
            <div className="w-full max-w-[22rem] space-y-3">
              <span className="text-[11px] uppercase tracking-[0.35em] text-cyan-200/70">
                Visualization pending
              </span>
              <p className="text-sm text-slate-300/80">
                {selectedWindow
                  ? "Generate the visualization for the selected window."
                  : "Select a flyby window and request a visualization."}
              </p>
            </div>
          </div>
        )}
      </div>

      {selectedSummary?.image_url ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-slate-950/70 px-4 py-3 text-[10px] uppercase tracking-[0.35em]">
          <Badge
            variant="secondary"
            className="border-cyan-400/35 bg-cyan-500/15 text-cyan-100"
          >
            google/nano-banana
          </Badge>
          <a href={selectedSummary.image_url} target="_blank" rel="noreferrer">
            <Button size="sm" variant="space">
              Open
            </Button>
          </a>
        </div>
      ) : null}
    </div>
  );
}
