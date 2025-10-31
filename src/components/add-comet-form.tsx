"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Functions, type Models } from "appwrite";
import client from "@/lib/appwrite";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type ExecutionWithExtras = Models.Execution & {
  statusCode?: unknown;
  response?: unknown;
  stdout?: unknown;
  result?: unknown;
  responseBody?: unknown;
  responseStatusCode?: unknown;
};

type CometSummary = {
  name?: string | null;
  designation?: string | null;
  prefix?: string | null;
  comet_status?: string | null;
  is_viable?: boolean | null;
};

type AddCometFormProps = {
  className?: string;
  onAdded?: (payload: { comet?: CometSummary; message?: string }) => void;
};

type CometSuggestion = {
  designation?: string | null;
  name?: string | null;
  suggestion_label: string;
};

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

function formatCometLabelFromPayload(row: Partial<CometSummary> | undefined): string | null {
  if (!row) return null;
  const name = row.name?.trim();
  const designation = row.designation?.trim();
  if (name && designation && name !== designation) return `${name} · ${designation}`;
  return name ?? designation ?? null;
}

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
    <span
      className={`inline-flex min-w-[1.75rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.32em] ${classes}`}
    >
      {upper}
    </span>
  );
}

export function AddCometForm({ className = "", onAdded }: AddCometFormProps) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<CometSuggestion[]>([]);
  const [blast, setBlast] = useState(false);
  const [latestComet, setLatestComet] = useState<CometSummary | null>(null);

  const functions = useMemo(() => new Functions(client), []);

  const resetFeedback = useCallback(() => {
    setStatusMessage(null);
    setErrorMessage(null);
    setNotice(null);
    setSuggestions([]);
  }, []);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const cometID = value.trim();
      if (!cometID) return;

      setSubmitting(true);
      resetFeedback();

      try {
        const functionId = "addComet";
        if (!functionId) throw new Error("Missing APPWRITE_ADD_COMET env variable");

        let exec = (await functions.createExecution({
          functionId,
          body: JSON.stringify({ cometID }),
        })) as ExecutionWithExtras;

        if (exec.status !== "completed") {
          setStatusMessage(`Execution status: ${exec.status}. Processing…`);
          exec = await pollExecutionCompletion(functions, functionId, exec.$id, exec, (status) => {
            setStatusMessage(`Execution status: ${status}. Processing…`);
          });
        }

        if (exec.status !== "completed") {
          setStatusMessage(`Execution status: ${exec.status}`);
          setValue("");
          return;
        }

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
          setErrorMessage(responseMessage ?? `Execution failed with status ${statusCode}`);
          setSuggestions(multiMatch ? (parsed!.suggestions as CometSuggestion[]) : []);
          setNotice(null);
        } else {
          const comet = parsed?.comet as CometSummary | undefined;
          const label = formatCometLabelFromPayload(comet);
          const successMsg =
            parsedMessage && parsedMessage.length > 0
              ? parsedMessage
              : label
                ? `☄️ ${label} ready for the cockpit`
                : "☄️ Comet added successfully";
          setStatusMessage(successMsg);
          setBlast(true);
          setTimeout(() => setBlast(false), 1200);
          setSuggestions([]);

          if (comet) {
            if (comet.is_viable === false) {
              setNotice("Note: This object is catalogued, but is not a returning comet. Visualizations and summaries are limited.");
            } else {
              setNotice(null);
            }
            onAdded?.({ comet, message: successMsg });
            setLatestComet(comet);
          } else {
            setNotice(null);
            onAdded?.({ message: successMsg });
            setLatestComet(null);
          }
        }
        setValue("");
      } catch (err: unknown) {
        setErrorMessage(String((err as Error)?.message ?? err));
        setNotice(null);
        setSuggestions([]);
        setLatestComet(null);
      } finally {
        setSubmitting(false);
      }
    },
    [functions, onAdded, resetFeedback, value]
  );

  useEffect(() => {
    if (statusMessage) {
      const t = setTimeout(() => setStatusMessage(null), 4500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [statusMessage]);

  useEffect(() => {
    if (errorMessage) {
      const t = setTimeout(() => setErrorMessage(null), 6000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [errorMessage]);

  const multipleMatchText = useMemo(() => {
    if (suggestions.length === 0) return null;
    const labels = suggestions.map((s) => s.suggestion_label || s.designation || s.name || "unknown");
    return `Multiple matches found: ${labels.join(", ")}`;
  }, [suggestions]);

  return (
    <div className={className}>
      <form onSubmit={handleSubmit} className="flex flex-col items-center gap-3">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder='Add comet ID, e.g. "1P" or "1P/Halley"'
          aria-label="Comet ID"
          className="w-full max-w-md text-center"
        />
        <Button type="submit" disabled={submitting} variant="space" className="relative overflow-hidden">
          <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-r from-accent/15 via-transparent to-transparent" />
          <span className="mr-1">☄️</span>
          {submitting ? "Adding…" : "Add Comet"}
          {blast && <span className="comet-fx" aria-hidden />}
        </Button>
      </form>

      {(statusMessage || latestComet) && (
        <div className="mt-2 flex flex-col items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-center text-sm text-emerald-200/90 shadow-[0_0_20px_rgba(34,197,94,0.15)]">
          {statusMessage && <span>{statusMessage}</span>}
          {latestComet && (
            <span className="flex items-center gap-2 text-xs text-emerald-100/80">
              <PrefixBadge prefix={latestComet.prefix ?? undefined} />
              <span className="uppercase tracking-[0.25em]">
                {latestComet.comet_status ? latestComet.comet_status.replace(/-/g, " ") : "catalogued"}
              </span>
            </span>
          )}
        </div>
      )}

      {errorMessage && (
        <div className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-center text-sm text-red-200 shadow-[0_0_20px_rgba(239,68,68,0.15)]">
          {errorMessage}
          {multipleMatchText && <div className="mt-1 text-xs text-red-100/80">{multipleMatchText}</div>}
        </div>
      )}

      {notice && (
        <div className="mt-2 rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100 shadow-[0_0_20px_rgba(245,158,11,0.15)]">
          {notice}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mt-2 space-y-2">
          {suggestions.map((s, idx) => (
            <button
              key={`${s.designation ?? s.name ?? idx}`}
              type="button"
              onClick={() => {
                setValue(s.designation || s.name || "");
                setSuggestions([]);
              }}
              className="flex w-full flex-col items-start rounded-md border border-cyan-400/30 bg-black/20 px-3 py-2 text-left text-sm text-cyan-50/90 transition hover:border-cyan-300/60 hover:bg-black/30"
            >
              <span className="font-semibold">{s.suggestion_label}</span>
              {s.designation && <span className="text-xs text-cyan-100/70">{s.designation}</span>}
              {s.name && s.name !== s.suggestion_label && (
                <span className="text-xs text-cyan-100/70">{s.name}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default AddCometForm;
