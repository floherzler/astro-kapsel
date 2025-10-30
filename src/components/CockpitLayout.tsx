"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Switch } from "@/components/ui/switch";
import SummaryProvider, {
  SummaryDetailsPanel,
  SummaryFlybyPanel,
  SummaryVisualizationPanel,
  useSummaryLayoutInfo,
} from "@/components/cockpit/summary-panel";

type CockpitLayoutProps = {
  children?: ReactNode;
};

const AMBIENCE_AUDIO_SRC =
  "https://fra.cloud.appwrite.io/v1/storage/buckets/summaryImages/files/ambienceV1/view?project=68ea4bc00031046d613e";
const AMBIENCE_CROSS_FADE_SEC = 4;

const describePlaybackError = (err: unknown) => {
  if (err instanceof DOMException) {
    return err.message ? `${err.name}: ${err.message}` : err.name;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return typeof err === "string" ? err : String(err ?? "unknown error");
};

export function CockpitLayout({ children }: CockpitLayoutProps) {
  return (
    <SummaryProvider>
      <div className="relative flex min-h-screen w-full items-stretch justify-center bg-[#050607] text-slate-100">
        <div className="flex min-h-screen w-full max-w-7xl flex-col gap-6 px-6 py-6 lg:h-screen lg:px-10">
          <MainView>{children}</MainView>
        </div>
      </div>
    </SummaryProvider>
  );
}

function MainView({ children }: { children?: ReactNode }) {
  // Desktop layout uses a fixed 3x2 cell grid; mobile stacks panels.
  const { orientation } = useSummaryLayoutInfo();
  const [muted, setMuted] = useState(true);
  const [ambientError, setAmbientError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Cross-fading loop implementation using two audio elements.
  // We keep internal state in loopRef so we don't need to change the earlier audioRef declaration.
  type LoopState = {
    audios: [HTMLAudioElement, HTMLAudioElement];
    current: 0 | 1;
    nextTimer?: number;
    raf?: number;
  };
  const loopRef = useRef<LoopState | null>(null);
  const ambientUnlockedRef = useRef(false);

  const ensureAmbientLoop = useCallback((): LoopState | null => {
    if (!AMBIENCE_AUDIO_SRC) return null;
    let state = loopRef.current;
    if (state) return state;

    const a1 = new Audio(AMBIENCE_AUDIO_SRC);
    const a2 = new Audio(AMBIENCE_AUDIO_SRC);
    [a1, a2].forEach((a) => {
      a.preload = "auto";
      a.loop = false; // we manage looping manually for crossfade
      a.volume = 0;
      a.muted = false;
      // Hint Chrome to allow inline playback without fullscreen requirements
      // @ts-expect-error playsInline exists on HTMLMediaElement in supporting browsers
      a.playsInline = true;
    });

    state = { audios: [a1, a2], current: 0 };
    loopRef.current = state;
    return state;
  }, []);

  const clearAmbientLoopTimers = useCallback(() => {
    const state = loopRef.current;
    if (!state) return;
    if (state.nextTimer) {
      window.clearTimeout(state.nextTimer);
      state.nextTimer = undefined;
    }
    if (state.raf) {
      cancelAnimationFrame(state.raf);
      state.raf = undefined;
    }
  }, []);

  const pauseAmbientLoop = useCallback(() => {
    const state = loopRef.current;
    if (!state) return;
    state.audios.forEach((a) => {
      try {
        a.pause();
        a.currentTime = 0;
      } catch {
        // ignore pause failures
      }
    });
  }, []);

  const silenceAmbientLoop = useCallback(() => {
    const state = loopRef.current;
    if (!state) return;
    state.audios.forEach((a) => {
      a.muted = true;
      a.volume = 0;
    });
  }, []);

  const disposeAmbientLoop = useCallback(() => {
    const state = loopRef.current;
    if (!state) return;
    clearAmbientLoopTimers();
    pauseAmbientLoop();
    state.audios.forEach((a) => {
      try {
        a.src = "";
      } catch {
        // ignore
      }
    });
    loopRef.current = null;
  }, [clearAmbientLoopTimers, pauseAmbientLoop]);

  const handleAmbientToggle = useCallback(
    (checked: boolean) => {
      const state = ensureAmbientLoop();
      if (!state) {
        setAmbientError("Ambience unavailable.");
        return;
      }

      if (checked) {
        // Prime playback if needed (muted so Chrome allows it).
        state.audios.forEach((audio) => {
          if (audio.paused) {
            audio.muted = true;
            audio.volume = 0;
            const playPromise = audio.play();
            if (playPromise && typeof playPromise.then === "function") {
              playPromise.catch((err) => {
                console.error("[ambience] play() failed", err);
                setAmbientError(`Audio playback failed: ${describePlaybackError(err)}`);
              });
            }
          }
        });

        // Make current track audible.
        const current = state.audios[state.current];
        current.muted = false;
        current.volume = 1;
        setAmbientError(null);
        setMuted(false);
      } else {
        clearAmbientLoopTimers();
        silenceAmbientLoop();
        setAmbientError(null);
        setMuted(true);
      }
    },
    [clearAmbientLoopTimers, ensureAmbientLoop, silenceAmbientLoop]
  );

  useEffect(() => {
    return () => {
      disposeAmbientLoop();
      // Also clean up legacy single audioRef if it was used
      const legacy = audioRef.current;
      if (legacy) {
        try {
          legacy.pause();
        } catch {
          // ignore
        }
        audioRef.current = null;
      }
    };
  }, [disposeAmbientLoop]);

  useEffect(() => {
    if (ambientUnlockedRef.current) return;
    if (typeof window === "undefined") return;

    const unlock = () => {
      if (ambientUnlockedRef.current) return;
      ambientUnlockedRef.current = true;
      const state = ensureAmbientLoop();
      if (!state) return;
      state.audios.forEach((audio) => {
        audio.muted = true;
        audio.volume = 0;
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch((err) => {
            console.warn("[ambience] unlock play failed", err);
          });
        }
      });
    };

    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [ensureAmbientLoop]);

  useEffect(() => {
    if (muted) {
      clearAmbientLoopTimers();
      silenceAmbientLoop();
      return;
    }

    const state = ensureAmbientLoop();
    if (!state) return;

    let cancelled = false;

    const scheduleNext = (currentIdx: 0 | 1) => {
      if (cancelled) return;
      const current = state.audios[currentIdx];
      const other = state.audios[1 - currentIdx];

      const trySchedule = () => {
        const duration = current.duration || 0;
        if (!isFinite(duration) || duration <= 0) return;
        const delay = Math.max(
          (duration - AMBIENCE_CROSS_FADE_SEC - current.currentTime) * 1000,
          0
        );
        if (state.nextTimer) window.clearTimeout(state.nextTimer);
        state.nextTimer = window.setTimeout(() => {
          other.currentTime = 0;
          other.volume = 0;
          other.muted = false;
          const playPromise = other.play();
          if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch((err) => {
              console.error("[ambience] crossfade play() failed", err);
              clearAmbientLoopTimers();
              silenceAmbientLoop();
              setAmbientError(`Audio playback failed: ${describePlaybackError(err)}`);
              setMuted(true);
            });
          }

          const fadeStart = performance.now();
          const fade = (ts: number) => {
            if (cancelled) return;
            const elapsed = (ts - fadeStart) / 1000;
            const t = Math.min(1, Math.max(0, elapsed / AMBIENCE_CROSS_FADE_SEC));
            if (t >= 1) {
              current.volume = 0;
              current.muted = true;
              other.volume = 1;
              try {
                current.currentTime = 0;
              } catch {
                // ignore
              }
              state.current = (1 - currentIdx) as 0 | 1;
              scheduleNext(state.current);
              return;
            }
            current.volume = Math.max(0, 1 - t);
            other.volume = Math.min(1, t);
            state.raf = requestAnimationFrame(fade);
          };
          state.raf = requestAnimationFrame(fade);
        }, delay);
      };

      if (!current.duration || !isFinite(current.duration) || current.duration <= 0) {
        const onMeta = () => {
          if (!cancelled) trySchedule();
        };
        current.addEventListener("loadedmetadata", onMeta, { once: true });
        trySchedule();
      } else {
        trySchedule();
      }
    };

    const curIdx = state.current;
    const cur = state.audios[curIdx];
    if (cur.paused) {
      cur.volume = 1;
      cur.currentTime = 0;
      const playPromise = cur.play();
      if (playPromise && typeof playPromise.then === "function") {
        playPromise
          .then(() => {
            scheduleNext(curIdx);
          })
          .catch((err) => {
            console.error("[ambience] initial play() failed", err);
            clearAmbientLoopTimers();
            silenceAmbientLoop();
            setAmbientError(`Audio playback failed: ${describePlaybackError(err)}`);
            setMuted(true);
          });
      } else {
        scheduleNext(curIdx);
      }
    } else {
      scheduleNext(curIdx);
    }

    return () => {
      cancelled = true;
      if (state.nextTimer) {
        window.clearTimeout(state.nextTimer);
        state.nextTimer = undefined;
      }
      if (state.raf) {
        cancelAnimationFrame(state.raf);
        state.raf = undefined;
      }
    };
  }, [clearAmbientLoopTimers, ensureAmbientLoop, muted, silenceAmbientLoop]);

  return (
    <div className="flex flex-col gap-6 lg:flex-1 lg:min-h-0">
      <header className="px-2 py-2 sm:px-4">
        <div className="flex flex-col gap-3 sm:hidden">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.35em] text-cyan-200/80">
            <span className="text-sm font-semibold tracking-[0.4em] text-cyan-100">astroKapsel</span>
            <Link
              href="/"
              className="rounded-full border border-slate-600/70 bg-slate-900/70 px-4 py-1.5 text-[11px] uppercase tracking-[0.35em] text-slate-200/80 shadow-[0_0_15px_rgba(59,130,246,0.35)] transition hover:border-cyan-500/50 hover:text-white"
            >
              Exit
            </Link>
          </div>
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.35em] text-cyan-200/80">
            <span>Cockpit</span>
            <div className="flex items-center gap-2 rounded-full border border-slate-600/70 bg-slate-900/60 px-3 py-1.5 text-[10px] uppercase tracking-[0.35em] text-slate-200/80 shadow-[0_0_15px_rgba(59,130,246,0.35)]">
              <span>Ambience</span>
              <Switch
                checked={!muted}
                onCheckedChange={(checked) => {
                  handleAmbientToggle(checked);
                }}
                aria-label="Toggle ambience audio"
              />
            </div>
          </div>
          {ambientError ? (
            <div className="text-[11px] text-red-300/80" role="status" aria-live="polite">
              {ambientError}
            </div>
          ) : null}
        </div>
        <div className="hidden items-center justify-between sm:flex">
          <div className="flex items-center gap-4 text-xs uppercase tracking-[0.35em] text-cyan-200/80">
            <span className="text-sm font-semibold tracking-[0.4em] text-cyan-100">astroKapsel</span>
            <span>Cockpit</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-slate-600/70 bg-slate-900/60 px-3 py-1.5 text-[10px] uppercase tracking-[0.35em] text-slate-200/80 shadow-[0_0_15px_rgba(59,130,246,0.35)]">
              <span>Ambience</span>
              <Switch
                checked={!muted}
                onCheckedChange={(checked) => {
                  handleAmbientToggle(checked);
                }}
                aria-label="Toggle ambience audio"
              />
            </div>
            <Link
              href="/"
              className="rounded-full border border-slate-600/70 bg-slate-900/70 px-4 py-1.5 text-[11px] uppercase tracking-[0.35em] text-slate-200/80 shadow-[0_0_15px_rgba(59,130,246,0.35)] transition hover:border-cyan-500/50 hover:text-white"
            >
              Exit
            </Link>
          </div>
          {ambientError ? (
            <div className="text-right text-[11px] text-red-300/80" role="status" aria-live="polite">
              {ambientError}
            </div>
          ) : null}
        </div>
      </header>

      {/* Mobile: stack in order flyby -> image -> briefing -> earth */}
      <div className="flex flex-col gap-6 lg:hidden">
        <SummaryFlybyPanel className="rounded-2xl border border-slate-900/70 bg-[#06080e]" />
        {/* Ensure visualization panel is above other panels on mobile */}
        <SummaryVisualizationPanel className="min-h-0 overflow-auto rounded-2xl border border-slate-900/70 bg-[#06080e] cockpit-panel-glow" />
        <SummaryDetailsPanel className="min-h-0 overflow-auto rounded-2xl border border-slate-900/70 bg-[#06080e]" />
        <div className="relative z-10 h-64 w-full overflow-hidden rounded-2xl border border-slate-900/70 bg-[#06080e] cockpit-panel-glow">
          {children ? (
            <div className="absolute inset-0">{children}</div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-[11px] uppercase tracking-[0.35em] text-cyan-200/80">
              <span className="text-sm">No module loaded</span>
              <span className="text-[11px] text-slate-300/70">Inject visualization component</span>
            </div>
          )}
        </div>
      </div>

      {/* Desktop: simple 3 columns x 2 rows grid using available space.
          Wide image order:
            s | f | e
            s | i | i
          Poster image order:
            s | f | i
            s | e | i
      */}
      <div className="hidden lg:flex lg:flex-1 lg:items-stretch">
        {/* Sizer keeps 3:2 area inside available space so cells are square */}
        <GridSizer>
          {({ style }) => (
            <div className="mx-auto grid h-full w-full grid-cols-3 grid-rows-2 gap-6" style={style}>
              {/* Summary spans two rows, first column */}
              <SummaryDetailsPanel className="min-h-0 overflow-auto rounded-2xl border border-slate-900/70 bg-[#06080e] lg:col-start-1 lg:row-span-2" />

              {/* Top-middle: Flyby selector */}
              <SummaryFlybyPanel className="rounded-2xl border border-slate-900/70 bg-[#06080e] lg:col-start-2 lg:row-start-1" />

              {orientation === "poster" ? (
                <>
                  {/* Poster: Image spans two rows on the right */}
                  <SummaryVisualizationPanel className="rounded-2xl border border-slate-900/70 bg-[#06080e] cockpit-panel-glow lg:col-start-3 lg:row-span-2" />
                  {/* Bottom-middle: Earth */}
                  <div className="relative overflow-hidden rounded-2xl border border-slate-900/70 bg-[#06080e] cockpit-panel-glow lg:col-start-2 lg:row-start-2">
                    {children ? (
                      <div className="absolute inset-0">{children}</div>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-[11px] uppercase tracking-[0.35em] text-cyan-200/80">
                        <span className="text-sm">No module loaded</span>
                        <span className="text-[11px] text-slate-300/70">Inject visualization component</span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* Wide: Top-right Earth */}
                  <div className="relative overflow-hidden rounded-2xl border border-slate-900/70 bg-[#06080e] cockpit-panel-glow lg:col-start-3 lg:row-start-1">
                    {children ? (
                      <div className="absolute inset-0">{children}</div>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-[11px] uppercase tracking-[0.35em] text-cyan-200/80">
                        <span className="text-sm">No module loaded</span>
                        <span className="text-[11px] text-slate-300/70">Inject visualization component</span>
                      </div>
                    )}
                  </div>
                  {/* Bottom image spans middle + right */}
                  <SummaryVisualizationPanel className="rounded-2xl border border-slate-900/70 bg-[#06080e] cockpit-panel-glow lg:col-start-2 lg:col-span-2 lg:row-start-2" />
                </>
              )}
            </div>
          )}
        </GridSizer>
      </div>
    </div>
  );
}
function GridSizer({ children }: { children: (args: { style: React.CSSProperties }) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr) setSize({ w: cr.width, h: cr.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const style = useMemo(() => {
    const W = size.w || 0;
    const H = size.h || 0;
    if (!W || !H) return { width: "100%", height: "100%" } as React.CSSProperties;
    // Fit 3:2 area inside the available box (no scroll), so each cell is square
    const maxWidthByHeight = H * 1.5;
    const width = Math.min(W, maxWidthByHeight);
    const height = Math.min(H, (width * 2) / 3);
    return { width, height } as React.CSSProperties;
  }, [size.w, size.h]);
  return (
    <div ref={ref} className="relative h-full w-full">
      <div className="absolute inset-0 mx-auto flex items-center justify-center">
        {children({ style })}
      </div>
    </div>
  );
}

export default CockpitLayout;
