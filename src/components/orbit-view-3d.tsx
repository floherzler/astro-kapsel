"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import client from "@/lib/appwrite";
import { TablesDB, Query } from "appwrite";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";

type CometRow = {
  $id: string;
  name?: string | null;
  designation?: string | null;
  eccentricity?: number | null; // e
  semi_major_axis?: number | null; // a (AU)
  perihelion_distance?: number | null; // q (AU)
  last_perihelion_year?: number | null; // tp (JD)
  period_years?: number | null; // years
  inclination_deg?: number | null; // i (deg)
  ascending_node_deg?: number | null; // Ω (deg)
  arg_periapsis_deg?: number | null; // ω (deg)
  prefix?: string | null;
  comet_status?: string | null;
  is_viable?: boolean | null;
};

function jdNow(): number {
  return Date.now() / 86400000 + 2440587.5;
}

function solveKeplerEllipse(M: number, e: number): number {
  let E = M;
  for (let i = 0; i < 12; i++) {
    const f = E - e * Math.sin(E) - M;
    const fp = 1 - e * Math.cos(E);
    E -= f / fp;
  }
  return E;
}

type OrbitViewVariant = "default" | "compact";

export default function OrbitView3D({ onlyIds, variant = "default" }: { onlyIds?: string[]; variant?: OrbitViewVariant }) {
  const [rows, setRows] = useState<CometRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const orbitsGroupRef = useRef<THREE.Group | null>(null);
  const animationRef = useRef<number | null>(null);
  const interactivesRef = useRef<THREE.Object3D[]>([]);
  const raycasterRef = useRef(new THREE.Raycaster());
  const [tooltip, setTooltip] = useState<null | { label: string; x: number; y: number }>(null);
  const [showPlanets, setShowPlanets] = useState(true);
  const [showKuiper, setShowKuiper] = useState(true);
  const sunRef = useRef<THREE.Object3D | null>(null);

  const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || "astroDB";
  const tableId = process.env.NEXT_PUBLIC_APPWRITE_TABLE_COMETS || "comets";
  const tables = useMemo(() => new TablesDB(client), []);

  // Data load + realtime
  useEffect(() => {
    let unsub: (() => void) | undefined;
    async function load() {
      try {
        const res = await tables.listRows({ databaseId, tableId, queries: [Query.limit(100)] });
        setRows(res.rows as CometRow[]);
      } catch (e: unknown) {
        setError(String((e as Error)?.message ?? e));
      } finally {
        setLoading(false);
      }

      try {
        unsub = client.subscribe(`databases.${databaseId}.tables.${tableId}.rows`, (event: { events?: string[]; payload?: CometRow }) => {
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
        });
      } catch (e) {
        console.warn("Realtime subscribe failed (3D)", e);
      }
    }
    load();
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [databaseId, tableId, tables]);

  // Three.js setup
  useEffect(() => {
    const container = wrapRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;

    const targetHeight = variant === "compact" ? 200 : 420;
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / targetHeight, 0.1, 10000);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, 2));
    renderer.setSize(container.clientWidth, targetHeight);
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.willChange = "transform";

    const ambient = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.7);
    dir.position.set(5, 5, 5);
    scene.add(dir);
    const sunLight = new THREE.PointLight(0xfff59d, 1.1, 0, 2);
    sunLight.position.set(0, 0, 0);
    scene.add(sunLight);

    // Sun
    const sunGeom = new THREE.SphereGeometry(3, 28, 28);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffe082 });
    const sun = new THREE.Mesh(sunGeom, sunMat);
    sun.position.set(0, 0, 0);
    (sun as THREE.Object3D).userData = { label: "Sun" };
    sunRef.current = sun;
    scene.add(sun);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 5;
    controls.maxDistance = 2000;
    controlsRef.current = controls;

    function onResize() {
      if (!container || !cameraRef.current || !rendererRef.current) return;
      const w = container.clientWidth;
      const h = variant === "compact" ? 200 : 420;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    }
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();

    // Hover handling
    function onPointerMove(ev: PointerEvent) {
      if (!cameraRef.current || !rendererRef.current || !wrapRef.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = raycasterRef.current;
      // Increase hit test thresholds for easier hovering
      if (raycaster.params.Line) raycaster.params.Line.threshold = 6 as number;
      if (raycaster.params.Points) raycaster.params.Points.threshold = 10 as number;
      raycaster.setFromCamera(mouse, cameraRef.current);
      const objects = interactivesRef.current;
      const hits = raycaster.intersectObjects(objects, true);
      if (hits.length > 0) {
        const obj = hits[0].object as THREE.Object3D;
        const label: string | undefined = obj.userData?.label || obj.parent?.userData?.label;
        if (label) {
          const wrapRect = wrapRef.current.getBoundingClientRect();
          setTooltip({ label, x: ev.clientX - wrapRect.left + 12, y: ev.clientY - wrapRect.top + 12 });
          return;
        }
      }
      setTooltip(null);
    }

    function onPointerLeave() {
      setTooltip(null);
    }

    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [variant]);

  // Build orbits whenever rows change
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // remove previous
    if (orbitsGroupRef.current) {
      scene.remove(orbitsGroupRef.current);
      orbitsGroupRef.current.traverse((obj) => {
        if ((obj as THREE.Line).geometry) (obj as THREE.Line).geometry.dispose?.();
        if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose?.();
        if ((obj as THREE.Mesh).material) ((obj as THREE.Mesh).material as THREE.Material).dispose?.();
      });
      orbitsGroupRef.current = null;
    }

    // Scaling based on max semi-major axis among comets and planets
    const idsSet = onlyIds && onlyIds.length > 0 ? new Set(onlyIds) : null;
    const valid = rows
      .filter((r) => (r.semi_major_axis ?? null) && (r.eccentricity ?? null))
      .filter((r) => (idsSet ? idsSet.has(r.$id) : true));
    const maxAComets = valid.reduce((m, r) => Math.max(m, r.semi_major_axis || 0), 1);
    const maxAPlanets = showPlanets ? 30.1 : 0; // up to Neptune's ~30 AU
    const maxAKuiper = showKuiper ? 50 : 0;
    const maxA = Math.max(maxAComets, maxAPlanets, maxAKuiper);
    const viewHeight = variant === "compact" ? 200 : 420;
    const unitsPerAU = Math.max(12, (viewHeight * 0.45) / Math.max(1, maxA));

    const group = new THREE.Group();
    const nowJD = jdNow();
    const interactives: THREE.Object3D[] = [];
    if (sunRef.current) interactives.push(sunRef.current);

    // Position camera to fit
    if (cameraRef.current) {
      cameraRef.current.position.set(0, Math.max(10, maxA * unitsPerAU * 2.4), maxA * unitsPerAU * 2.4);
      cameraRef.current.lookAt(0, 0, 0);
    }

    const hues = [200, 160, 40, 300, 20, 120, 260, 0];

    // --- Planet orbits (hardcoded, 8 planets) ---
    if (showPlanets) {
      const planets = [
        { name: "Mercury", a: 0.3871, e: 0.2056, i: 7.005, O: 48.331, w: 29.124, color: 0xb0bec5 },
        { name: "Venus", a: 0.7233, e: 0.0068, i: 3.395, O: 76.680, w: 54.884, color: 0xffcc80 },
        { name: "Earth", a: 1.0000, e: 0.0167, i: 0.000, O: -11.26064, w: 102.9372, color: 0x90caf9 },
        { name: "Mars", a: 1.5237, e: 0.0934, i: 1.850, O: 49.558, w: 286.502, color: 0xff8a65 },
        { name: "Jupiter", a: 5.2044, e: 0.0489, i: 1.303, O: 100.464, w: 273.867, color: 0xfff59d },
        { name: "Saturn", a: 9.5826, e: 0.0565, i: 2.485, O: 113.665, w: 339.392, color: 0xa1887f },
        { name: "Uranus", a: 19.201, e: 0.0472, i: 0.773, O: 74.006, w: 96.998, color: 0x80deea },
        { name: "Neptune", a: 30.047, e: 0.0086, i: 1.770, O: 131.784, w: 273.187, color: 0x81d4fa },
      ];
      for (const p of planets) {
        const points: THREE.Vector3[] = [];
        const i = THREE.MathUtils.degToRad(p.i);
        const O = THREE.MathUtils.degToRad(p.O);
        const w = THREE.MathUtils.degToRad(p.w);
        const e = Math.min(0.9999, Math.max(0, p.e));
        for (let k = 0; k <= 360; k++) {
          const nu = (k / 360) * Math.PI * 2;
          const rlen = (p.a * (1 - e * e)) / (1 + e * Math.cos(nu));
          const x = rlen * Math.cos(nu);
          const y = rlen * Math.sin(nu);
          const v = new THREE.Vector3(x, y, 0);
          v.applyAxisAngle(new THREE.Vector3(0, 0, 1), w);
          v.applyAxisAngle(new THREE.Vector3(1, 0, 0), i);
          v.applyAxisAngle(new THREE.Vector3(0, 0, 1), O);
          v.multiplyScalar(unitsPerAU);
          points.push(v);
        }
        const geom = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(
          geom,
          new THREE.LineBasicMaterial({ color: new THREE.Color(p.color).offsetHSL(0, 0.1, 0.1), linewidth: 1 })
        );
        (line as THREE.Object3D).userData = { label: p.name };
        group.add(line);
        interactives.push(line);
      }
    }

    // --- Reference geometry: Kuiper Belt (30–50 AU annulus) ---
    if (showKuiper) {
      const inner = 30 * unitsPerAU;
      const outer = 50 * unitsPerAU;
      const ringGeom = new THREE.RingGeometry(inner, outer, 128);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x81d4fa, opacity: 0.25, transparent: true, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      // Keep Kuiper belt aligned with the ecliptic (XY plane): no rotation
      ring.userData = { label: "Kuiper Belt (30–50 AU)" };
      group.add(ring);

      // Outline edges for clarity
      const innerCircle = new THREE.RingGeometry(inner * 0.999, inner, 240);
      const outerCircle = new THREE.RingGeometry(outer, outer * 1.001, 240);
      const edgeMat = new THREE.MeshBasicMaterial({ color: 0x81d4fa, opacity: 0.5, transparent: true, side: THREE.DoubleSide });
      const innerMesh = new THREE.Mesh(innerCircle, edgeMat);
      const outerMesh = new THREE.Mesh(outerCircle, edgeMat);
      // Keep edge meshes in the ecliptic plane as well
      innerMesh.userData = { label: "Kuiper Belt (inner edge)" };
      outerMesh.userData = { label: "Kuiper Belt (outer edge)" };
      group.add(innerMesh);
      group.add(outerMesh);
      interactives.push(ring, innerMesh, outerMesh);
    }

    // --- Reference geometry: Oort Cloud (very large, faint wireframe) ---
    {
      // Using two shells for inner (~2,000 AU) and outer (~10,000 AU) visualization
      const radiiAU = [2000, 10000];
      const color = new THREE.Color(0xbbdefb);
      for (const rAU of radiiAU) {
        const r = rAU * unitsPerAU;
        const geom = new THREE.SphereGeometry(r, 24, 18);
        const wire = new THREE.WireframeGeometry(geom);
        const mat = new THREE.LineBasicMaterial({ color, opacity: rAU > 2000 ? 0.08 : 0.15, transparent: true });
        const line = new THREE.LineSegments(wire, mat);
        line.userData = { label: rAU >= 10000 ? "Oort Cloud (outer ~10,000 AU)" : "Oort Cloud (inner ~2,000 AU)" };
        group.add(line);
        interactives.push(line);
      }
    }

    for (let idx = 0; idx < valid.length; idx++) {
      const r = valid[idx];
      const a = r.semi_major_axis as number;
      const e = Math.min(0.9999, Math.max(0, (r.eccentricity as number) || 0));
      const iDeg = r.inclination_deg ?? 0; // if not available, keep in ecliptic plane
      const oDeg = r.ascending_node_deg ?? 0;
      const wDeg = r.arg_periapsis_deg ?? 0;

      const i = THREE.MathUtils.degToRad(iDeg);
      const O = THREE.MathUtils.degToRad(oDeg);
      const w = THREE.MathUtils.degToRad(wDeg);

      // Orbit curve in perifocal frame
      const points: THREE.Vector3[] = [];
      for (let k = 0; k <= 360; k++) {
        const nu = (k / 360) * Math.PI * 2;
        const rlen = (a * (1 - e * e)) / (1 + e * Math.cos(nu));
        const x = rlen * Math.cos(nu);
        const y = rlen * Math.sin(nu);
        const v = new THREE.Vector3(x, y, 0);
        // rotate perifocal -> ecliptic: Rz(Ω) Rx(i) Rz(ω)
        v.applyAxisAngle(new THREE.Vector3(0, 0, 1), w);
        v.applyAxisAngle(new THREE.Vector3(1, 0, 0), i);
        v.applyAxisAngle(new THREE.Vector3(0, 0, 1), O);
        v.multiplyScalar(unitsPerAU);
        points.push(v);
      }
      const curveGeom = new THREE.BufferGeometry().setFromPoints(points);
      const color = new THREE.Color().setHSL((hues[idx % hues.length] / 360), 0.9, 0.7);
      const line = new THREE.Line(
        curveGeom,
        new THREE.LineBasicMaterial({ color, linewidth: 1 })
      );
      line.userData = { label: r.name || r.designation || r.$id };
      group.add(line);
      interactives.push(line);

      // Current position marker if tp & P available
      if (r.last_perihelion_year && r.period_years) {
        const T = r.last_perihelion_year; // JD
        const Pdays = r.period_years * 365.25;
        if (Pdays > 0) {
          const M = ((2 * Math.PI * ((nowJD - T) / Pdays)) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
          const E = solveKeplerEllipse(M, e);
          const nu = Math.atan2(Math.sqrt(1 - e * e) * Math.sin(E), Math.cos(E) - e);
          const rlen = (a * (1 - e * e)) / (1 + e * Math.cos(nu));
          const pos = new THREE.Vector3(rlen * Math.cos(nu), rlen * Math.sin(nu), 0);
          pos.applyAxisAngle(new THREE.Vector3(0, 0, 1), w);
          pos.applyAxisAngle(new THREE.Vector3(1, 0, 0), i);
          pos.applyAxisAngle(new THREE.Vector3(0, 0, 1), O);
          pos.multiplyScalar(unitsPerAU);

          const markerGeom = new THREE.SphereGeometry(1.4, 16, 16);
          const markerMat = new THREE.MeshBasicMaterial({ color });
          const marker = new THREE.Mesh(markerGeom, markerMat);
          marker.position.copy(pos);
          marker.userData = { label: r.name || r.designation || r.$id };
          group.add(marker);
          interactives.push(marker);

          // Ion tail: tapered, pointing away from the Sun
          // Length scales inversely with heliocentric distance (longer nearer the Sun)
          const away = pos.clone().normalize();
          const rAU = pos.length() / Math.max(1e-6, unitsPerAU); // rough distance in AU (scene-scaled)
          const length = Math.max(10, unitsPerAU * (0.6 + 1.8 / Math.max(0.2, rAU)));
          const topRadius = 0.2; // near the nucleus
          const bottomRadius = Math.min(3.0, 0.4 + 1.2 / Math.max(0.2, rAU));
          const tailGeom = new THREE.CylinderGeometry(topRadius, bottomRadius, length, 12, 1, true);
          const tailMat = new THREE.MeshBasicMaterial({
            color: 0x81d4fa,
            transparent: true,
            opacity: 0.35,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          });
          const tail = new THREE.Mesh(tailGeom, tailMat);
          // Orient cylinder Y-axis along 'away'
          const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), away);
          tail.quaternion.copy(quat);
          // Position so the narrow end sits at the comet position
          tail.position.copy(pos.clone().add(away.clone().multiplyScalar(length / 2)));
          group.add(tail);
        }
      }
    }

    scene.add(group);
    orbitsGroupRef.current = group;
    interactivesRef.current = interactives;
  }, [rows, showPlanets, showKuiper, onlyIds, variant]);

  const controls = (
    <div className="flex items-center gap-3 text-xs text-foreground/80">
      <HoverCard>
        <HoverCardTrigger className="inline-flex items-center">
          <Switch
            label="Planets"
            checked={showPlanets}
            onCheckedChange={setShowPlanets}
            className="gap-1 [&>span:last-child]:text-[11px] [&>span:last-child]:uppercase [&>span:last-child]:tracking-[0.35em] [&>span:last-child]:text-cyan-200/80"
          />
        </HoverCardTrigger>
        <HoverCardContent
          sideOffset={12}
          className="max-w-xs border-cyan-500/20 bg-slate-950/95 text-[12px] leading-relaxed text-foreground/80 shadow-[0_18px_45px_-30px_rgba(59,130,246,0.55)]"
        >
          Toggle on the inner planets to get a grounded sense of scale and speed against real ephemerides from NASA/JPL.
        </HoverCardContent>
      </HoverCard>

      <HoverCard>
        <HoverCardTrigger className="inline-flex items-center">
          <Switch
            label="Kuiper Belt"
            checked={showKuiper}
            onCheckedChange={setShowKuiper}
            className="gap-1 [&>span:last-child]:text-[11px] [&>span:last-child]:uppercase [&>span:last-child]:tracking-[0.35em] [&>span:last-child]:text-cyan-200/80"
          />
        </HoverCardTrigger>
        <HoverCardContent
          sideOffset={12}
          className="max-w-xs border-cyan-500/20 bg-slate-950/95 text-[12px] leading-relaxed text-foreground/80 shadow-[0_18px_45px_-30px_rgba(59,130,246,0.55)]"
        >
          Highlights a ring of icy bodies at 30–50 AU so you can see which comets likely hail from the Kuiper Belt reservoir.
        </HoverCardContent>
      </HoverCard>
    </div>
  );

  const canvasWrapper = (
    <div ref={wrapRef} className="relative w-full" style={{ height: variant === "compact" ? 200 : 420 }}>
      {tooltip && (
        <div className="pointer-events-none absolute z-20" style={{ left: tooltip.x, top: tooltip.y }}>
          <Badge>{tooltip.label}</Badge>
        </div>
      )}
    </div>
  );

  if (variant === "compact") {
    return (
      <div className="flex h-full flex-col gap-4">
        {/* <div className="rounded-[1.4rem] border border-slate-800/70 bg-slate-950/75 px-4 py-3 text-[11px] uppercase tracking-[0.45em] text-cyan-100 shadow-[0_18px_45px_-40px_rgba(59,130,246,0.55)]">
          Orbits
        </div> */}
        <div className="relative flex-1 overflow-hidden rounded-[1.6rem] border border-slate-800/70 bg-slate-950/80">
          {canvasWrapper}
          {loading && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 text-xs uppercase tracking-[0.35em] text-foreground/70">
              Loading orbits…
            </div>
          )}
          {error && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-red-400">
              {error}
            </div>
          )}
          {!loading && !error && rows.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30 text-xs text-foreground/60">
              No comets to render.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle>Orbits (3D)</CardTitle>
          {controls}
        </div>
      </CardHeader>
      <CardContent>
        {loading && <p className="text-sm text-foreground/70">Loading orbits…</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {canvasWrapper}
        {!loading && !error && rows.length === 0 && (
          <p className="text-sm text-foreground/70 mt-2">No comets to render.</p>
        )}
      </CardContent>
    </Card>
  );
}
