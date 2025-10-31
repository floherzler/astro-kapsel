import { fal } from "@fal-ai/client";
import { Client, ID, Query, TablesDB } from "node-appwrite";
import type { Models } from "node-appwrite";

import { throwIfMissing, coerceNumber, extractRelationId } from "./utils.js";

type HandlerRequest = {
    method: string;
    headers?: Record<string, string | undefined>;
    json: () => Promise<unknown>;
    bodyJson?: unknown;
    bodyText?: string;
    payload?: string;
};

type HandlerResponse = {
    json: (body: unknown, status?: number, headers?: Record<string, string>) => unknown;
    text: (body: string, status?: number, headers?: Record<string, string>) => unknown;
};

type HandlerContext = {
    req: HandlerRequest;
    res: HandlerResponse;
    log: (message: unknown) => void;
    error: (error: unknown) => void;
};

type FalTextPayload = {
    output?: string | null;
    output_text?: string | null;
    text?: string | null;
    [key: string]: unknown;
};

type FalResult<TPayload> = {
    requestId: string;
    data: TPayload;
    logs?: unknown;
    [key: string]: unknown;
};

type SightingRequestBody = {
    cometId: string;
    flybyId?: string | null;
    observerName: string | null;
    location: string | null;
    focus: string | null;
    perihelionJD?: number | null;
};

type FlybyRow = Models.Document & {
    year?: number | string | null;
    comet?: { $id?: string; name?: string | null; designation?: string | null; prefix?: string | null } | string | null;
};

type CometRow = Models.Document & {
    name?: string | null;
    designation?: string | null;
    prefix?: string | null;
    comet_status?: string | null;
    last_perihelion_year?: number | string | null;
};

type SightingRow = Models.Document & {
    observer_name?: string;
    note?: string | null;
    flyby?: string | { $id?: string } | null;
    geo_lat?: number | null;
    geo_lon?: number | null;
};

const DEFAULT_TEXT_MODEL = "google/gemini-2.5-flash-lite";
const TEXT_ORCHESTRATOR_ID = "fal-ai/any-llm";

const DATABASE_FALLBACK = "astroDB";
const TABLE_COMETS_FALLBACK = "comets";
const TABLE_FLYBYS_FALLBACK = "flybys";
const TABLE_SIGHTINGS_FALLBACK = "sightings";

let falConfigured = false;

function ensureFalClientConfigured(apiKey: string) {
    if (!falConfigured) {
        fal.config({ credentials: apiKey });
        falConfigured = true;
    }
}

function logMessage(logger: HandlerContext["log"], message: string, data?: Record<string, unknown>) {
    if (data) {
        try {
            logger(`${message} ${JSON.stringify(data)}`);
        } catch {
            logger(message);
        }
    } else {
        logger(message);
    }
}

function extractTextOutput(data: FalTextPayload): string | null {
    if (typeof data.output === "string" && data.output.trim().length > 0) return data.output.trim();
    if (typeof data.output_text === "string" && data.output_text.trim().length > 0) return data.output_text.trim();
    if (typeof data.text === "string" && data.text.trim().length > 0) return data.text.trim();
    return null;
}

function parseBodyInput(ctx: HandlerContext): Record<string, unknown> {
    const { req, log } = ctx;
    if (req.bodyJson && typeof req.bodyJson === "object" && req.bodyJson !== null) {
        log("[generateSighting] using req.bodyJson");
        return req.bodyJson as Record<string, unknown>;
    }
    if (typeof req.bodyText === "string" && req.bodyText.length > 0) {
        log("[generateSighting] parsing req.bodyText");
        try {
            return JSON.parse(req.bodyText) as Record<string, unknown>;
        } catch {
            // ignore
        }
    }
    if (typeof req.payload === "string" && req.payload.length > 0) {
        log("[generateSighting] parsing req.payload");
        try {
            return JSON.parse(req.payload) as Record<string, unknown>;
        } catch {
            // ignore
        }
    }
    return {};
}

function normalizeSightingInput(ctx: HandlerContext, raw: unknown): SightingRequestBody | null {
    const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const cometId = typeof body.cometId === "string" ? body.cometId.trim() : "";
    const flybyId = typeof body.flybyId === "string" ? body.flybyId.trim() : "";
    const observerName =
        typeof body.observerName === "string" && body.observerName.trim().length > 0
            ? body.observerName.trim()
            : null;
    const location =
        typeof body.location === "string" && body.location.trim().length > 0
            ? body.location.trim()
            : null;
    const focus =
        typeof body.focus === "string" && body.focus.trim().length > 0 ? body.focus.trim() : null;
    const perihelionJD = coerceNumber(body.perihelionJD ?? null);

    if (!cometId) {
        ctx.log("[generateSighting] invalid body payload");
        return null;
    }

    return {
        cometId,
        flybyId: flybyId || null,
        observerName,
        location,
        focus,
        perihelionJD,
    };
}

function buildPrompt(params: {
    cometName: string;
    cometDesignation?: string | null;
    year: number;
    location?: string | null;
    focus?: string | null;
    observerHint?: string | null;
}) {
    const { cometName, cometDesignation, year, location, focus, observerHint } = params;

    const instructions = [
        `You are chronicling how people on Earth witnessed a great comet.`,
        `Comet designation: ${cometName}${cometDesignation ? ` (${cometDesignation})` : ""}.`,
        `The perihelion year is ${Math.round(year)} — embed references to the era's culture, art, and public mood.`,
        `Describe atmosphere, sky conditions, tail structure, and how communities reacted (festivals, art, fears, scholarship, media).`,
        `Write in vivid but factual prose as if an archivist recorded a citizen's field report. Target length: 160-220 words.`,
        `Return STRICT JSON with keys: observer_name (string), note (string), geo_lat (number or null), geo_lon (number or null), location_hint (string).`,
        `If coordinates are unknown, set geo_lat and geo_lon to null. Use decimal degrees if you provide them.`,
    ];
    if (location) instructions.push(`Suggested location context: ${location}.`);
    if (focus) instructions.push(`Additional thematic focus: ${focus}.`);
    if (observerHint) instructions.push(`If it helps, you may base the observer on: ${observerHint}.`);
    instructions.push(`Ensure note centres on Earth-bound cultural experience.`);
    return instructions.join("\n");
}

async function generateText(prompt: string, model: string = DEFAULT_TEXT_MODEL): Promise<{ raw: string; requestId: string; model: string }> {
    const job = (await fal.subscribe(TEXT_ORCHESTRATOR_ID, {
        input: {
            model: model as any,
            prompt,
        },
        logs: true,
    })) as FalResult<FalTextPayload>;

    const text = extractTextOutput(job.data);
    if (!text) {
        throw new Error("Fal generation returned no text output");
    }
    return { raw: text, requestId: job.requestId, model };
}

function castDocument<T>(row: unknown): T {
    return row as unknown as T;
}

function parseSightingOutput(raw: string): {
    observerName?: string;
    note?: string;
    geoLat?: number | null;
    geoLon?: number | null;
    locationHint?: string;
} {
    if (!raw) return {};
    let content = raw.trim();
    if (content.startsWith("```")) {
        const fenced = content.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
        if (fenced && fenced[1]) content = fenced[1].trim();
        else content = content.replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
    }
    try {
        const parsed = JSON.parse(content);
        const observerName = typeof parsed?.observer_name === "string" && parsed.observer_name.trim().length > 0
            ? parsed.observer_name.trim()
            : undefined;
        const note = typeof parsed?.note === "string" && parsed.note.trim().length > 0
            ? parsed.note.trim()
            : undefined;
        const geoLat = coerceNumber(parsed?.geo_lat);
        const geoLon = coerceNumber(parsed?.geo_lon);
        const locationHint = typeof parsed?.location_hint === "string" && parsed.location_hint.trim().length > 0
            ? parsed.location_hint.trim()
            : undefined;
        return {
            observerName,
            note,
            geoLat: typeof geoLat === "number" ? geoLat : null,
            geoLon: typeof geoLon === "number" ? geoLon : null,
            locationHint,
        };
    } catch {
        return {};
    }
}

function jdToDate(value: unknown): Date | null {
    const numeric = coerceNumber(value);
    if (numeric === null) return null;
    const year = 2000 + (numeric - 2451545.0) / 365.25;
    if (!Number.isFinite(year)) return null;
    const ms = (numeric - 2440587.5) * 86400000;
    return new Date(ms);
}

async function findOrCreateFlyby(params: {
    tables: TablesDB;
    databaseId: string;
    tableId: string;
    cometId: string;
    targetYear: number;
}): Promise<FlybyRow> {
    const { tables, databaseId, tableId, cometId, targetYear } = params;
    const res = await tables.listRows({
        databaseId,
        tableId,
        queries: [
            Query.equal("comet.$id", [cometId]),
            Query.select(["$id", "year", "description", "comet.$id"]),
            Query.limit(50),
        ],
    });

    const rows = Array.isArray(res.rows) ? res.rows : [];
    const existing = rows
        .map((row) => castDocument<FlybyRow>(row))
        .find((row) => {
            const y = coerceNumber(row.year);
            return typeof y === "number" && Math.abs(y - targetYear) <= 0.25;
        });

    if (existing) return existing;

    const created = await tables.createRow({
        databaseId,
        tableId,
        rowId: ID.unique(),
        data: {
            comet: cometId,
            year: targetYear,
            description: "Perihelion passage",
        } as Record<string, unknown>,
    });

    return castDocument<FlybyRow>(created);
}

async function getComet(ctx: HandlerContext, tables: TablesDB, params: { databaseId: string; tableId: string; cometId: string }) {
    const { databaseId, tableId, cometId } = params;
    const comet = castDocument<CometRow>(await tables.getRow({
        databaseId,
        tableId,
        rowId: cometId,
        queries: [Query.select(["$id", "name", "designation", "prefix", "comet_status"])],
    }));
    if (!comet || !comet.$id) {
        ctx.log(`[generateSighting] comet not found: ${cometId}`);
        return null;
    }
    return comet;
}

async function getFlyby(ctx: HandlerContext, tables: TablesDB, params: { databaseId: string; tableId: string; flybyId: string }) {
    const { databaseId, tableId, flybyId } = params;
    const flyby = castDocument<FlybyRow>(await tables.getRow({
        databaseId,
        tableId,
        rowId: flybyId,
        queries: [Query.select(["$id", "year", "comet.$id"])],
    }));
    if (!flyby || !flyby.$id) {
        ctx.log(`[generateSighting] flyby not found: ${flybyId}`);
        return null;
    }
    return flyby;
}

export default async function handler(ctx: HandlerContext) {
    const { req, res, log, error } = ctx;

    try {
        throwIfMissing(process.env as Record<string, unknown>, ["FAL_API_KEY"] as const);
    } catch (err) {
        error(err);
        return res.json({ ok: false, error: String(err) }, 500);
    }

    if (req.method === "GET") {
        return res.json(
            {
                ok: true,
                message: "generateSighting ready",
            },
            200
        );
    }

    let body: Record<string, unknown> = {};
    try {
        const parsed = await req.json();
        if (parsed && typeof parsed === "object") {
            body = parsed as Record<string, unknown>;
        }
    } catch {
        body = parseBodyInput(ctx);
    }

    const normalized = normalizeSightingInput(ctx, body);
    if (!normalized) {
        return res.json(
            {
                ok: false,
                error: "Invalid payload. Provide cometId.",
            },
            400
        );
    }

    const observerNameHint = normalized.observerName ?? "Earth Observation Corps";
    const databaseId =
        process.env.APPWRITE_DATABASE_ID ||
        process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID ||
        DATABASE_FALLBACK;
    const tableComets =
        process.env.APPWRITE_TABLE_COMETS ||
        process.env.NEXT_PUBLIC_APPWRITE_TABLE_COMETS ||
        TABLE_COMETS_FALLBACK;
    const tableFlybys =
        process.env.APPWRITE_TABLE_FLYBYS ||
        process.env.NEXT_PUBLIC_APPWRITE_TABLE_FLYBYS ||
        TABLE_FLYBYS_FALLBACK;
    const tableSightings =
        process.env.APPWRITE_TABLE_SIGHTINGS ||
        process.env.NEXT_PUBLIC_APPWRITE_TABLE_SIGHTINGS ||
        TABLE_SIGHTINGS_FALLBACK;

    const endpoint =
        process.env.APPWRITE_FUNCTION_API_ENDPOINT ||
        process.env.APPWRITE_FUNCTION_ENDPOINT;
    const project =
        process.env.APPWRITE_FUNCTION_PROJECT_ID ||
        process.env.APPWRITE_PROJECT_ID;
    const apiKey =
        req.headers?.["x-appwrite-key"] ??
        process.env.APPWRITE_API_KEY ??
        process.env.APPWRITE_FUNCTION_API_KEY;

    if (!endpoint || !project) {
        return res.json(
            {
                ok: false,
                error: "Missing Appwrite endpoint or project configuration.",
            },
            500
        );
    }

    const client = new Client().setEndpoint(endpoint).setProject(project);
    if (apiKey) client.setKey(apiKey);
    const tables = new TablesDB(client);

    try {
        logMessage(log, "[generateSighting] payload normalized", {
            cometId: normalized.cometId,
            flybyId: normalized.flybyId ?? null,
            focus: normalized.focus ?? null,
            perihelionJD: normalized.perihelionJD ?? null,
        });

        let cometId = normalized.cometId;
        let flyby: FlybyRow | null = null;

        if (normalized.flybyId) {
            logMessage(log, `[generateSighting] fetching provided flyby ${normalized.flybyId}`);
            flyby = await getFlyby(ctx, tables, {
                databaseId,
                tableId: tableFlybys,
                flybyId: normalized.flybyId,
            });

            if (!flyby) {
                logMessage(log, "[generateSighting] flyby lookup failed");
                return res.json({ ok: false, error: "Flyby not found." }, 404);
            }

            const relationId = extractRelationId(flyby.comet);
            if (!relationId) {
                logMessage(log, "[generateSighting] flyby missing comet relation");
                return res.json({ ok: false, error: "Flyby is missing comet relation." }, 400);
            }
            if (relationId !== cometId) {
                logMessage(log, `[generateSighting] provided comet ${cometId} mismatched flyby relation ${relationId}, using relation`);
                cometId = relationId;
            }
        }

        const comet = await getComet(ctx, tables, {
            databaseId,
            tableId: tableComets,
            cometId,
        });

        if (!comet) {
            logMessage(log, "[generateSighting] comet not found");
            return res.json({ ok: false, error: "Comet not found." }, 404);
        }
        logMessage(log, "[generateSighting] comet retrieved", { cometId, prefix: comet.prefix, name: comet.name ?? null });

        const prefix = (comet.prefix ?? "").toString().toUpperCase();
        if (prefix !== "C") {
            logMessage(log, "[generateSighting] comet prefix not C", { cometId, prefix });
            return res.json(
                {
                    ok: false,
                    error: "Only long-period (type C) comets are supported for generateSighting.",
                },
                400
            );
        }

        let year: number | null = flyby ? coerceNumber(flyby.year) : null;

        if (!flyby) {
            const perihelionSource = normalized.perihelionJD ?? comet.last_perihelion_year;
            const perihelionDate = jdToDate(perihelionSource);
            if (!perihelionDate) {
                logMessage(log, "[generateSighting] missing perihelion data");
                return res.json(
                    { ok: false, error: "Comet is missing perihelion timing data." },
                    400
                );
            }
            year = perihelionDate.getUTCFullYear();
            logMessage(log, "[generateSighting] derived perihelion year", { cometId, year, date: perihelionDate.toISOString() });
            flyby = await findOrCreateFlyby({
                tables,
                databaseId,
                tableId: tableFlybys,
                cometId,
                targetYear: year,
            });
            logMessage(log, "[generateSighting] using flyby", { flybyId: flyby.$id ?? null, flybyYear: flyby.year ?? null });
        }

        if (year === null) {
            logMessage(log, "[generateSighting] missing flyby year after derivation");
            return res.json(
                { ok: false, error: "Unable to determine flyby year." },
                400
            );
        }

        const falApiKey = process.env.FAL_API_KEY as string | undefined;
        ensureFalClientConfigured(falApiKey!);

        logMessage(log, "[generateSighting] building Gemini prompt", { cometId, year, focus: normalized.focus ?? null });
        const prompt = buildPrompt({
            cometName: comet.name ?? comet.$id ?? "Great Comet",
            cometDesignation: comet.designation,
            year,
            location: normalized.location,
            focus: normalized.focus,
            observerHint: observerNameHint,
        });

        logMessage(log, "[generateSighting] requesting text generation");
        const generation = await generateText(prompt);
        const parsed = parseSightingOutput(generation.raw);
        const note = parsed.note ?? generation.raw;
        const observerName = parsed.observerName ?? observerNameHint;
        const geoLat = parsed.geoLat ?? null;
        const geoLon = parsed.geoLon ?? null;
        const locationHint = parsed.locationHint ?? normalized.location ?? null;
        logMessage(log, "[generateSighting] generation complete", {
            requestId: generation.requestId,
            model: generation.model,
            noteLength: note.length,
            observerName,
            geoLat,
            geoLon,
            locationHint,
        });

        const flybyIdValue = flyby?.$id;
        if (!flybyIdValue) {
            logMessage(log, "[generateSighting] flyby missing id on write");
            return res.json({ ok: false, error: "Flyby row missing identifier." }, 500);
        }

        logMessage(log, "[generateSighting] creating sighting row");
        const sighting = castDocument<SightingRow>(await tables.createRow({
            databaseId,
            tableId: tableSightings,
            rowId: ID.unique(),
            data: {
                flyby: flybyIdValue,
                observer_name: observerName,
                note,
                geo_lat: geoLat,
                geo_lon: geoLon,
            } as Record<string, unknown>,
        }));

        return res.json(
            {
                ok: true,
                sightingId: sighting.$id,
                flybyId: flybyIdValue,
                cometId,
                year,
                observer: observerName,
                note,
                geoLat,
                geoLon,
                locationHint,
                requestId: generation.requestId,
                model: generation.model,
            },
            201
        );
    } catch (err) {
        logMessage(log, "[generateSighting] error encountered", { message: (err as Error)?.message ?? String(err) });
        error(err);
        const message = err instanceof Error ? err.message : String(err);
        return res.json({ ok: false, error: message }, 500);
    }
}
