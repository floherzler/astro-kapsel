"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

  useEffect(() => {
    return () => {
      const s = loopRef.current;
      if (s) {
        if (s.nextTimer) window.clearTimeout(s.nextTimer);
        if (s.raf) cancelAnimationFrame(s.raf);
        s.audios.forEach((a) => {
          try {
            a.pause();
            a.src = "";
          } catch { }
        });
        loopRef.current = null;
      }
      // Also clean up legacy single audioRef if it was used
      const legacy = audioRef.current;
      if (legacy) {
        try {
          legacy.pause();
        } catch { }
        audioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const src =
      "https://fra.cloud.appwrite.io/v1/storage/buckets/summaryImages/files/ambienceV1/view?project=68ea4bc00031046d613e&mode=admin";
    if (!src) return;

    const CROSS_FADE_SEC = 4;

    // stop + reset if muted
    if (muted) {
      const s = loopRef.current;
      if (s) {
        if (s.nextTimer) window.clearTimeout(s.nextTimer);
        if (s.raf) cancelAnimationFrame(s.raf);
        s.audios.forEach((a) => {
          try {
            a.pause();
            a.currentTime = 0;
          } catch { }
        });
      }
      return;
    }

    // ensure loopRef exists
    let s = loopRef.current;
    if (!s) {
      const a1 = new Audio(src);
      const a2 = new Audio(src);
      [a1, a2].forEach((a) => {
        a.preload = "auto";
        a.loop = false; // we manage looping manually for crossfade
        a.volume = 0;
        a.muted = false;
      });
      loopRef.current = { audios: [a1, a2], current: 0 };
      s = loopRef.current;
    }

    let cancelled = false;

    const scheduleNext = (currentIdx: 0 | 1) => {
      if (cancelled) return;
      const current = s!.audios[currentIdx];
      const other = s!.audios[1 - currentIdx];

      const trySchedule = () => {
        const duration = current.duration || 0;
        if (!isFinite(duration) || duration <= 0) return;
        // delay until we should start other (ms)
        const delay = Math.max((duration - CROSS_FADE_SEC - current.currentTime) * 1000, 0);
        if (s!.nextTimer) window.clearTimeout(s!.nextTimer);
        s!.nextTimer = window.setTimeout(() => {
          // start other and crossfade
          other.currentTime = 0;
          other.volume = 0;
          void other.play().catch(() => {
            // autoplay blocked / problem -> mute control
            setMuted(true);
          });

          const startTime = performance.now();
          const fade = () => {
            const t = (performance.now() - startTime) / (CROSS_FADE_SEC * 1000);
            if (t >= 1) {
              current.volume = 0;
              other.volume = 1;
              try {
                current.pause();
                current.currentTime = 0;
              } catch { }
              s!.current = (1 - currentIdx) as 0 | 1;
              // schedule the next crossfade when the now-current has metadata
              scheduleNext(s!.current);
              return;
            }
            current.volume = Math.max(0, 1 - t);
            other.volume = Math.min(1, t);
            s!.raf = requestAnimationFrame(fade);
          };
          s!.raf = requestAnimationFrame(fade);
        }, delay);
      };

      // if we don't know duration yet, listen for loadedmetadata on current
      if (!current.duration || !isFinite(current.duration) || current.duration <= 0) {
        const onMeta = () => {
          if (!cancelled) trySchedule();
        };
        current.addEventListener("loadedmetadata", onMeta, { once: true });
        // also try immediately in case duration is already available
        trySchedule();
      } else {
        trySchedule();
      }
    };

    // start playback on the current audio if needed
    const curIdx = s.current;
    const cur = s.audios[curIdx];
    if (cur.paused) {
      cur.volume = 1;
      cur.currentTime = 0;
      void cur
        .play()
        .then(() => {
          // schedule based on metadata / duration
          scheduleNext(curIdx);
        })
        .catch(() => {
          setMuted(true);
        });
    } else {
      // already playing (edge cases), ensure schedule is present
      scheduleNext(curIdx);
    }

    return () => {
      cancelled = true;
      if (s!.nextTimer) {
        window.clearTimeout(s!.nextTimer);
        s!.nextTimer = undefined;
      }
      if (s!.raf) {
        cancelAnimationFrame(s!.raf);
        s!.raf = undefined;
      }
    };
  }, [muted]);

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
                onCheckedChange={(checked) => setMuted(!checked)}
                aria-label="Toggle ambience audio"
              />
            </div>
          </div>
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
                onCheckedChange={(checked) => setMuted(!checked)}
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
