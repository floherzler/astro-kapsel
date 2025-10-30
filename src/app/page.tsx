"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import CometList from "@/components/comet-list";
import OrbitView3D from "@/components/orbit-view-3d";
import SlideToLaunch from "@/components/slide-to-launch";

export default function Home() {
  // Share visible IDs between list and 3D orbits
  const [visibleCometIds, setVisibleCometIds] = useState<string[] | null>(null);
  const router = useRouter();
  const launchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleLaunch = useCallback(() => {
    if (launchTimeoutRef.current) {
      return;
    }
    launchTimeoutRef.current = setTimeout(() => {
      router.push("/cockpit");
      launchTimeoutRef.current = null;
    }, 220);
  }, [router]);

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
