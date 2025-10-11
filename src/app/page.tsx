"use client";

import { useState } from "react";
import { Functions } from "appwrite";
import client from "@/lib/appwrite";

export default function Home() {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cometID = value.trim();
    if (!cometID) return;
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const functionId =
        (process.env.APPWRITE_ADD_COMET as string | undefined) ||
        (process.env.NEXT_PUBLIC_APPWRITE_ADD_COMET as string | undefined);
      if (!functionId) throw new Error("Missing APPWRITE_ADD_COMET env variable");

      const functions = new Functions(client);
      const exec = await functions.createExecution({ functionId: functionId, body: JSON.stringify({ cometID }) });
      setMessage(exec.status === "completed" ? "Request sent to add comet." : `Execution status: ${exec.status}`);
      setValue("");
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setLoading(false);
    }
  }

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

        <form onSubmit={onSubmit} className="mt-6 flex flex-col sm:flex-row gap-3">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder='e.g. "1P" or "1P/Halley"'
            className="flex-1 rounded-md bg-black/30 border border-white/15 px-4 py-3 outline-none focus:ring-2 focus:ring-accent/60"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-md px-5 py-3 bg-accent text-black font-medium hover:brightness-110 disabled:opacity-60"
          >
            {loading ? "Submitting…" : "Submit"}
          </button>
        </form>

        {message && <p className="mt-3 text-sm text-emerald-300/90">{message}</p>}
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      </main>
    </div>
  );
}
