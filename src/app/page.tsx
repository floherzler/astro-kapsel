"use client";
import Link from "next/link";
import { useState } from "react";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import CometList from "@/components/comet-list";
import OrbitView3D from "@/components/orbit-view-3d";

export default function Home() {
  // Share visible IDs between list and 3D orbits
  const [visibleCometIds, setVisibleCometIds] = useState<string[] | null>(null);

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
          <Link
            href="/cockpit"
            className="group relative inline-flex w-full max-w-md items-center gap-0 overflow-hidden rounded-full border border-cyan-400/40 bg-gradient-to-r from-cyan-500/25 via-sky-400/20 to-indigo-500/25 px-6 py-3 text-sm uppercase tracking-[0.4em] text-white shadow-[0_0_30px_rgba(94,234,212,0.35)] backdrop-blur transition-all duration-300 hover:translate-y-[-2px] hover:border-cyan-300/70 hover:shadow-[0_0_45px_rgba(94,234,212,0.55)]"
          >
            <span className="pointer-events-none absolute inset-0 animate-[pulse_5s_infinite] bg-[radial-gradient(circle_at_20%_120%,rgba(56,189,248,0.35),transparent_55%)] opacity-70" aria-hidden />
            <span className="pointer-events-none absolute left-[-25%] top-1/2 h-[3px] w-[55%] -translate-y-1/2 rounded-full bg-gradient-to-r from-transparent via-cyan-200/80 to-transparent opacity-0 transition-all duration-600 group-hover:left-[110%] group-hover:opacity-100" aria-hidden />

            <span className="relative z-10 flex-1 flex items-center justify-center text-[10px] tracking-[0.55em] text-cyan-100/80">Enter</span>

            <span className="relative z-10 flex-1 flex items-center justify-center">
              <span className="relative flex h-9 w-9 items-center justify-center rounded-full border border-cyan-300/60 bg-black/30 shadow-[0_0_18px_rgba(59,130,246,0.45)]">
                <span className="absolute h-14 w-14 -translate-x-1/4 rounded-full bg-cyan-400/20 blur-2xl" aria-hidden />
                <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-rose-200/70 via-rose-500/80 to-orange-500/70 shadow-[0_0_18px_rgba(248,113,113,0.45)]">
                  <img src="/icons/comet.svg" alt="Comet icon" className="h-5 w-5" />
                </span>
              </span>
            </span>

            <span className="relative z-10 flex-1 flex items-center justify-center text-[10px] tracking-[0.55em] text-cyan-100/80">Cockpit</span>
          </Link>
        </div>

        <Accordion className="mt-12 space-y-3">
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

        <CometList onVisibleChange={setVisibleCometIds} />

      </main>
    </div>
  );
}
