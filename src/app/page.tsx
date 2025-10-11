"use client";
import CometList from "@/components/comet-list";
import OrbitView3D from "@/components/orbit-view-3d";

export default function Home() {
  // Page-level state remains minimal; form moved into CometList

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

        {/* Orbits first */}
        <OrbitView3D />

        <CometList />

      </main>
    </div>
  );
}
