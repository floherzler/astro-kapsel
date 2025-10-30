import { fal } from "@fal-ai/client";
import { Client, ID, Query, TablesDB } from "node-appwrite";
import type { Models } from "node-appwrite";

import { throwIfMissing, coerceNumber, extractRelationId } from "./utils.js";

type HandlerRequest = {
    method: string;
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
    flybyId: string;
    observerName: string | null;
    location: string | null;
    focus: string | null;
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
};

type SightingRow = Models.Document & {
    observer_name?: string;
    note?: string | null;
    flyby?: string | { $id?: string } | null;
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

    if (!cometId || !flybyId) {
        ctx.log("[generateSighting] invalid body payload");
        return null;
    }

    return {
        cometId,
        flybyId,
        observerName,
        location,
        focus,
    };
}

function buildPrompt(params: {
    cometName: string;
    cometDesignation?: string | null;
    year: number;
    observer: string;
    location?: string | null;
    focus?: string | null;
}) {
    const { cometName, cometDesignation, year, observer, location, focus } = params;
    const header = [`Compose an evocative observational log for a great comet sighting.`];
    const bullets = [
        `Comet: ${cometName}${cometDesignation ? ` (${cometDesignation})` : ""}`,
        `Year of perihelion passage: ${Math.round(year)}`,
        `Observer on duty: ${observer}`,
    ];
    if (location) {
        bullets.push(`Observation site: ${location}`);
    }
    bullets.push(
        `The sighting should convey atmosphere, sky conditions, and what made this apparition memorable to human history.`
    );
    bullets.push(
        `Write in the style of a field report blended with poetic awe, 130-180 words, no bullet points.`
    );
    bullets.push(
        `Highlight the comet's brightness, tail structure, motion, and a notable cultural or scientific response.`
    );
    if (focus) {
        bullets.push(`Additional context to weave in: ${focus}`);
    }

    header.push(...bullets.map((line) => `- ${line}`));
    header.push(`Return plain text only.`);
    return header.join("\n");
}

async function generateText(prompt: string, model: string = DEFAULT_TEXT_MODEL) {
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
    return { note: text, requestId: job.requestId, model };
}

function castDocument<T>(row: unknown): T {
    return row as unknown as T;
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
                error: "Invalid payload. Provide cometId and flybyId.",
            },
            400
        );
    }

    const observerName = normalized.observerName ?? "Gemini Observation Corps";
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
    const apiKey = process.env.APPWRITE_API_KEY;

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
        const flyby = await getFlyby(ctx, tables, {
            databaseId,
            tableId: tableFlybys,
            flybyId: normalized.flybyId,
        });

        if (!flyby) {
            return res.json({ ok: false, error: "Flyby not found." }, 404);
        }

        const cometId = extractRelationId(flyby.comet) ?? normalized.cometId;
        if (!cometId) {
            return res.json({ ok: false, error: "Flyby is missing comet relation." }, 400);
        }

        if (cometId !== normalized.cometId) {
            log(
                `[generateSighting] provided comet ${normalized.cometId} mismatched flyby relation ${cometId}, using relation`
            );
        }

        const comet = await getComet(ctx, tables, {
            databaseId,
            tableId: tableComets,
            cometId,
        });

        if (!comet) {
            return res.json({ ok: false, error: "Comet not found." }, 404);
        }

        const prefix = (comet.prefix ?? "").toString().toUpperCase();
        if (prefix !== "C") {
            return res.json(
                {
                    ok: false,
                    error: "Only long-period (type C) comets are supported for generateSighting.",
                },
                400
            );
        }

        const year = coerceNumber(flyby.year);
        if (year === null) {
            return res.json(
                { ok: false, error: "Flyby is missing a valid year value." },
                400
            );
        }

        const falApiKey = process.env.FAL_API_KEY;
        ensureFalClientConfigured(falApiKey!);

        const prompt = buildPrompt({
            cometName: comet.name ?? comet.$id ?? "Great Comet",
            cometDesignation: comet.designation,
            year,
            observer: observerName,
            location: normalized.location,
            focus: normalized.focus,
        });

        const { note, requestId, model } = await generateText(prompt);

        const flybyIdValue = flyby.$id;
        if (!flybyIdValue) {
            return res.json({ ok: false, error: "Flyby row missing identifier." }, 500);
        }

        const sighting = castDocument<SightingRow>(await tables.createRow({
            databaseId,
            tableId: tableSightings,
            rowId: ID.unique(),
            data: {
                flyby: flybyIdValue,
                observer_name: observerName,
                note,
            } as Record<string, unknown>,
        }));

        return res.json(
            {
                ok: true,
                sightingId: sighting.$id,
                flybyId: flyby.$id,
                cometId,
                year,
                observer: observerName,
                note,
                requestId,
                model,
            },
            201
        );
    } catch (err) {
        error(err);
        const message = err instanceof Error ? err.message : String(err);
        return res.json({ ok: false, error: message }, 500);
    }
}
