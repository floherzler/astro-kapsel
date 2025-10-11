"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import client from "@/lib/appwrite";
import { TablesDB, Query } from "appwrite";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type CometRow = {
  $id: string;
  name?: string | null;
  designation?: string | null;
  eccentricity?: number | null;
  semi_major_axis?: number | null; // AU
  perihelion_distance?: number | null; // AU
  last_perihelion_year?: number | null; // actually JD of perihelion (tp)
  period_years?: number | null; // years
};

function jdNow(): number {
  // Convert current time to Julian Date
  return Date.now() / 86400000 + 2440587.5;
}

function solveKeplerEllipse(M: number, e: number): number {
  // Newton-Raphson to solve M = E - e sin E for E
  let E = M;
  for (let i = 0; i < 12; i++) {
    const f = E - e * Math.sin(E) - M;
    const fp = 1 - e * Math.cos(E);
    E -= f / fp;
  }
  return E;
}

export default function OrbitView() {
  const [rows, setRows] = useState<CometRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);

  const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || "astroDB";
  const tableId = process.env.NEXT_PUBLIC_APPWRITE_TABLE_COMETS || "comets";

  const tables = useMemo(() => new TablesDB(client), []);

  useEffect(() => {
    let unsub: (() => void) | undefined;

    async function load() {
      try {
        const res = await tables.listRows({ databaseId, tableId, queries: [Query.limit(50)] });
        setRows(res.rows as CometRow[]);
      } catch (e: unknown) {
        setError(String((e as Error)?.message ?? e));
      } finally {
        setLoading(false);
      }

      try {
        unsub = client.subscribe(
          `databases.${databaseId}.tables.${tableId}.rows`,
          (event: { events?: string[]; payload?: CometRow }) => {
            const type: string = event.events?.[0] ?? "";
            const row: CometRow | undefined = event.payload;
            if (!row?.$id) return;
            setRows((prev) => {
              const idx = prev.findIndex((c) => c.$id === row.$id);
              if (type.includes(".create")) {
                if (idx >= 0) return prev;
                return [row, ...prev];
              }
              if (type.includes(".update")) {
                if (idx === -1) return prev;
                const cp = prev.slice();
                cp[idx] = row;
                return cp;
              }
              if (type.includes(".delete")) {
                if (idx === -1) return prev;
                const cp = prev.slice();
                cp.splice(idx, 1);
                return cp;
              }
              return prev;
            });
          }
        );
      } catch (e) {
        console.warn("Realtime subscribe failed (orbits)", e);
      }
    }

    load();
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [databaseId, tableId, tables]);

  // Observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        setDims({ w: Math.max(0, cr.width), h: Math.max(240, cr.height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Compute drawable ellipses
  const ellipses = useMemo(() => {
    const filtered = rows.filter((r) => (r.semi_major_axis ?? null) && (r.eccentricity ?? null));
    const maxA = filtered.reduce((m, r) => Math.max(m, r.semi_major_axis || 0), 1);
    const maxB = filtered.reduce((m, r) => {
      const a = r.semi_major_axis || 0;
      const e = r.eccentricity || 0;
      const b = a * Math.sqrt(Math.max(0, 1 - e * e));
      return Math.max(m, b);
    }, 1);

    const pad = 16; // px padding
    const cx = dims.w / 2;
    const cy = Math.max(240, dims.h) / 2;
    const sx = (cx - pad) / Math.max(1e-6, maxA);
    const sy = (cy - pad) / Math.max(1e-6, maxB);
    const S = Math.min(sx, sy);

    const JD = jdNow();

    return filtered.map((r, idx) => {
      const a = r.semi_major_axis as number; // AU
      const e = Math.min(0.9999, Math.max(0, (r.eccentricity as number) || 0));
      const b = a * Math.sqrt(Math.max(0, 1 - e * e));
      const c = e * a; // AU

      // Position marker (if we have period and perihelion JD)
      let pos: { x: number; y: number } | null = null;
      if (r.last_perihelion_year && r.period_years) {
        const T = r.last_perihelion_year; // JD of last perihelion
        const Pdays = r.period_years * 365.25;
        if (Pdays > 0) {
          const M = ((2 * Math.PI * ((JD - T) / Pdays)) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
          const E = solveKeplerEllipse(M, e);
          const rx = a * (1 - e * Math.cos(E));
          const nu = Math.atan2(Math.sqrt(1 - e * e) * Math.sin(E), Math.cos(E) - e);
          const x = rx * Math.cos(nu);
          const y = rx * Math.sin(nu);
          pos = { x, y };
        }
      }

      // Color by index (simple palette)
      const hues = [200, 160, 40, 300, 20, 120, 260, 0];
      const hue = hues[idx % hues.length];

      return {
        id: r.$id,
        name: r.name || r.designation || r.$id,
        a,
        b,
        c,
        e,
        centerX: cx + S * c,
        centerY: cy,
        rx: S * a,
        ry: S * b,
        pos: pos ? { x: cx + S * pos.x, y: cy - S * pos.y } : null,
        stroke: `hsl(${hue} 80% 60%)`,
      };
    });
  }, [rows, dims]);

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Orbits (top-down)</CardTitle>
      </CardHeader>
      <CardContent>
        {loading && <p className="text-sm text-foreground/70">Loading orbits…</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div ref={containerRef} className="w-full" style={{ minHeight: 320 }}>
          <svg width={dims.w} height={Math.max(240, dims.h)} className="block w-full h-auto">
            {/* Background grid */}
            <defs>
              <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />

            {/* Sun at center */}
            <circle cx={dims.w / 2} cy={Math.max(240, dims.h) / 2} r={6} fill="#fdd835" stroke="#ffd54f" strokeWidth={2} />

            {/* Ellipses */}
            {ellipses.map((el) => (
              <g key={el.id}>
                <ellipse
                  cx={el.centerX}
                  cy={el.centerY}
                  rx={el.rx}
                  ry={el.ry}
                  fill="none"
                  stroke={el.stroke}
                  strokeWidth={1.25}
                />
                {el.pos && (
                  <g>
                    <circle cx={el.pos.x} cy={el.pos.y} r={3} fill={el.stroke} />
                    {/* Label */}
                    <text x={el.pos.x + 6} y={el.pos.y - 6} className="text-[10px]" fill="rgba(255,255,255,0.85)">
                      {el.name}
                    </text>
                  </g>
                )}
              </g>
            ))}
          </svg>
        </div>
        {!loading && !error && ellipses.length === 0 && (
          <p className="text-sm text-foreground/70 mt-2">No orbital parameters available to render.</p>
        )}
      </CardContent>
    </Card>
  );
}
