"use client";

import { useEffect, useState, useMemo } from "react";
import client from "@/lib/appwrite";
import { TablesDB, Query } from "appwrite";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type CometRow = {
  $id: string;
  name?: string | null;
  designation?: string | null;
  orbit_class?: string | null;
  period_years?: number | null;
  source?: string | null;
};

export default function CometList() {
  const [comets, setComets] = useState<CometRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || "astroDB";
  const tableId = process.env.NEXT_PUBLIC_APPWRITE_TABLE_COMETS || "comets";

  const tables = useMemo(() => new TablesDB(client), []);

  useEffect(() => {
    let unsub: (() => void) | undefined;

    async function init() {
      try {
        // Initial load
        const res = await tables.listRows({ databaseId, tableId, queries: [Query.limit(50)] });
        setComets(res.rows as any);
      } catch (e: any) {
        setError(String(e?.message ?? e));
      } finally {
        setLoading(false);
      }

      try {
        // Subscribe to realtime changes on this table
        unsub = client.subscribe(
          `databases.${databaseId}.tables.${tableId}.rows`,
          (event: any) => {
            const type: string = event.events?.[0] ?? "";
            const row: CometRow | undefined = event.payload as any;
            if (!row?.$id) return;

            setComets((prev) => {
              const idx = prev.findIndex((c) => c.$id === row.$id);
              if (type.includes(".create")) {
                if (idx >= 0) return prev; // already present
                return [row, ...prev];
              }
              if (type.includes(".update")) {
                if (idx === -1) return prev;
                const copy = prev.slice();
                copy[idx] = row;
                return copy;
              }
              if (type.includes(".delete")) {
                if (idx === -1) return prev;
                const copy = prev.slice();
                copy.splice(idx, 1);
                return copy;
              }
              return prev;
            });
          }
        );
      } catch (e) {
        // Swallow subscribe errors silently to prevent UI breakage
        console.warn("Realtime subscribe failed", e);
      }
    }

    init();
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [databaseId, tableId, tables]);

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>Comets</CardTitle>
      </CardHeader>
      <CardContent>
        {loading && <p className="text-sm text-foreground/70">Loading comets…</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {!loading && !error && comets.length === 0 && (
          <p className="text-sm text-foreground/70">No comets yet. Add one above.</p>
        )}
        <ul className="divide-y divide-white/10">
          {comets.map((c) => (
            <li key={c.$id} className="py-3 flex items-center justify-between">
              <div>
                <div className="font-medium">{c.name ?? c.designation ?? c.$id}</div>
                <div className="text-xs text-foreground/70">
                  {c.designation ? `${c.designation}` : ""}
                  {c.orbit_class ? ` • ${c.orbit_class}` : ""}
                  {c.period_years ? ` • P≈${Number(c.period_years).toFixed(2)}y` : ""}
                </div>
              </div>
              {c.source && <span className="text-[10px] uppercase tracking-wide text-foreground/60">{c.source}</span>}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
