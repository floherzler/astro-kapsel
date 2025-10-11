"use client";

import { useState } from "react";
import { Functions } from "appwrite";
import client from "@/lib/appwrite";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import CometList from "@/components/comet-list";

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

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Add Comet</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-3">
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder='e.g. "1P" or "1P/Halley"'
                aria-label="Comet ID"
              />
              <Button type="submit" disabled={loading} size="lg">
                {loading ? "Submitting…" : "Submit"}
              </Button>
            </form>

            {message && <p className="mt-3 text-sm text-emerald-300/90">{message}</p>}
            {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
          </CardContent>
        </Card>

        <CometList />

      </main>
    </div>
  );
}
