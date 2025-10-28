import { fal } from "@fal-ai/client";
import { Client, ID, TablesDB, Storage } from "node-appwrite";
import { InputFile } from "node-appwrite/file";

import { throwIfMissing } from "./utils.js";

type ModelType = "text" | "image" | "summary";

type SummaryInput = {
    cometId: string;
    fromFlybyId: string;
    toFlybyId: string;
};

type FalImagePayload = {
    images?: Array<{ url?: string | null }>;
    [key: string]: unknown;
};

type FalTextPayload = {
    output?: string | null;
    output_text?: string | null;
    text?: string | null;
    [key: string]: unknown;
};

interface HandlerRequest {
    method: string;
    headers: Record<string, string | undefined>;
    json: () => Promise<unknown>;
    bodyJson?: {
        prompt?: unknown;
        modelType?: unknown;
    };
    bodyText?: string;
    payload?: string;
}

interface HandlerResponse {
    json(body: unknown, status?: number, headers?: Record<string, string>): unknown;
    text(body: string, status?: number, headers?: Record<string, string>): unknown;
}

interface HandlerContext {
    req: HandlerRequest;
    res: HandlerResponse;
    log: (message: unknown) => void;
    error: (error: unknown) => void;
}

type HandlerSuccessResponse =
    | {
        ok: true;
        type: "image";
        requestId: string;
        src: string | null;
    }
    | {
        ok: true;
        type: "text";
        requestId: string;
        output: string | null;
    }
    | {
        ok: true;
        type: "summary";
        requestId: string;
        summaryId: string;
        title: string;
        summary: string;
        cometId: string;
        fromFlybyId: string;
        toFlybyId: string;
        model?: string;
        imageUrl?: string | null;
    };

type FalResult<TPayload> = {
    requestId: string;
    data: TPayload;
    logs?: unknown;
    [key: string]: unknown;
};

const IMAGE_MODEL_ID = "fal-ai/flux-pro/kontext/text-to-image";
const TEXT_ORCHESTRATOR_ID = "fal-ai/any-llm";
const DEFAULT_TEXT_MODEL = "google/gemini-2.5-flash-lite";

const DATABASE_ID = "astroDB";
const TABLE_COMETS = "comets";
const TABLE_FLYBYS = "flybys";
const TABLE_SUMMARIES = "summaries";
const SUMMARY_IMAGES_BUCKET_ID = "summaryImages";

let falConfigured = false;

function ensureFalClientConfigured(apiKey: string) {
    if (!falConfigured) {
        fal.config({ credentials: apiKey });
        falConfigured = true;
    }
}

function normalizeModelType(value: unknown): ModelType {
    if (typeof value === "string") {
        const normalized = value.toLowerCase();
        if (normalized === "image") return "image";
        if (normalized === "summary") return "summary";
    }
    return "text";
}

function normalizePrompt(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function extractTextOutput(data: FalTextPayload): string | null {
    if (typeof data.output === "string" && data.output.length > 0) {
        return data.output;
    }
    if (typeof data.output_text === "string" && data.output_text.length > 0) {
        return data.output_text;
    }
    if (typeof data.text === "string" && data.text.length > 0) {
        return data.text;
    }
    return null;
}

function parseSummaryOutput(raw: string): { title?: string; summary?: string } {
    if (!raw) return {};
    let content = raw.trim();

    if (content.startsWith("```")) {
        const fencedMatch = content.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
        if (fencedMatch && fencedMatch[1]) {
            content = fencedMatch[1].trim();
        } else {
            content = content.replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
        }
    }

    try {
        const parsed = JSON.parse(content);
        const title =
            typeof parsed?.title === "string" && parsed.title.trim().length > 0
                ? parsed.title.trim()
                : undefined;
        const summary =
            typeof parsed?.summary === "string" && parsed.summary.trim().length > 0
                ? parsed.summary.trim()
                : undefined;
        return { title, summary };
    } catch {
        return {};
    }
}

function normalizeSummaryInput(body: unknown): SummaryInput | null {
    if (typeof body !== "object" || body === null) return null;
    const maybeSummary = body as Record<string, unknown>;

    const cometId = typeof maybeSummary.cometId === "string" ? maybeSummary.cometId.trim() : "";
    const fromFlybyId =
        typeof maybeSummary.fromFlybyId === "string" ? maybeSummary.fromFlybyId.trim() : "";
    const toFlybyId =
        typeof maybeSummary.toFlybyId === "string" ? maybeSummary.toFlybyId.trim() : "";

    if (!cometId || !fromFlybyId || !toFlybyId) {
        return null;
    }

    return { cometId, fromFlybyId, toFlybyId };
}

function buildSummaryPrompt(cometName: string, firstFlyby: number, secondFlyby: number): string {
    const startYear = Math.min(firstFlyby, secondFlyby);
    const endYear = Math.max(firstFlyby, secondFlyby);

    return `
You are a scientific historian and chronicler of human civilization. Write a precise, factually accurate overview of key historical developments between two comet flybys.

Context:
- Comet: ${cometName}
- Earlier flyby: ${Math.round(startYear)}
- Later flyby: ${Math.round(endYear)}

Instructions:
1. Do **not** describe the comet or its movement. Focus entirely on human events, inventions, and societal change.
2. Present the period as a chronological narrative spanning ${Math.abs(endYear - startYear)} years.
3. Include:
   - Major **political** and **cultural** shifts (empires, wars, reforms, revolutions)
   - Influential **figures** in science, philosophy, art, and exploration
   - Key **inventions** or **technological milestones**
   - Important **medical events**, **epidemics**, or **scientific discoveries**
   - Transformations in **society**, **economy**, or **belief systems**
4. Use real historical dates where possible (e.g., "In 1492, Columbus reached the Americas").
5. Maintain a scholarly but engaging tone — clear, factual, and accessible.
6. Keep it balanced globally — not only Western history unless the timeframe is regionally limited.
7. Length: 250-350 words.
8. Write in a cohesive narrative form, not bullet points.

Return a JSON object:
{
  "title": "A concise, era-representative title",
  "summary": "The full historical overview text."
}
`;
}


function buildSummaryImagePrompt(
    cometName: string,
    startYear: number,
    endYear: number,
    summary: string
): string {
    const condensedSummary = summary.length > 900 ? `${summary.slice(0, 897)}…` : summary;

    return [
        `Depict a richly detailed historical scene inspired by humanity’s progress between ${Math.round(startYear)} and ${Math.round(endYear)}.`,
        `The image should visually reflect the key events, cultures, and inventions described below.`,
        `Each element must appear historically grounded — accurate architecture, clothing, and environment for its period.`,
        `Avoid futuristic, sci-fi, or abstract compositions.`,
        `Art style: cinematic realism, painterly lighting, natural color grading, detailed atmosphere.`,
        `Composition: focus on storytelling, showing people, tools, structures, and environments relevant to the summary.`,
        `Comet reference (${cometName}) can be subtle, as a symbolic element in the sky if appropriate.`,
        `Summary context:`,
        condensedSummary,
    ].join("\n");
}


function getExtensionFromMime(mimeType?: string | null): string {
    if (!mimeType) return "png";
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("gif")) return "gif";
    return "jpg";
}

async function uploadSummaryImage(params: {
    storage: Storage;
    endpoint: string;
    projectId: string;
    summaryId: string;
    imageUrl: string;
}) {
    const { storage, endpoint, projectId, summaryId, imageUrl } = params;
    const response = await fetch(imageUrl);
    if (!response.ok) {
        throw new Error(`Failed to download generated image (status ${response.status})`);
    }
    const mimeType = response.headers.get("content-type");
    const extension = getExtensionFromMime(mimeType);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileId = ID.unique();
    await storage.createFile({
        bucketId: SUMMARY_IMAGES_BUCKET_ID,
        fileId,
        file: InputFile.fromBuffer(buffer, `${summaryId}.${extension}`),
    });
    const base = endpoint.replace(/\/+$/, "");
    return `${base}/storage/buckets/${SUMMARY_IMAGES_BUCKET_ID}/files/${fileId}/view?project=${projectId}`;
}

function getErrorCode(err: unknown): number | undefined {
    if (typeof err === "object" && err !== null && "code" in err) {
        const value = (err as { code?: unknown }).code;
        return typeof value === "number" ? value : undefined;
    }
    return undefined;
}

async function generateImage(prompt: string): Promise<FalResult<FalImagePayload>> {
    const job = await fal.subscribe(IMAGE_MODEL_ID, {
        input: {
            prompt,
            aspect_ratio: "16:9",
            guidance_scale: 6.9,
            num_images: 1,
        },
        logs: true,
    });

    return job as FalResult<FalImagePayload>;
}

async function generateText(
    prompt: string,
    model: string = DEFAULT_TEXT_MODEL
): Promise<FalResult<FalTextPayload>> {
    const job = await fal.subscribe(TEXT_ORCHESTRATOR_ID, {
        input: {
            model: model as any,
            prompt,
        },
        logs: true,
    });

    return job as FalResult<FalTextPayload>;
}

export default async ({ req, res, log, error }: HandlerContext) => {
    throwIfMissing(process.env, ["FAL_API_KEY"] as const);

    if (req.method === "GET") {
        return res.json(
            {
                ok: true,
                message: "queryFAL function ready",
            },
            200
        );
    }

    let body: Record<string, unknown> = {};
    try {
        const parsed = (await req.json()) as Record<string, unknown>;
        if (parsed && typeof parsed === "object") {
            body = parsed;
        }
    } catch {
        if (
            req.bodyJson &&
            typeof req.bodyJson === "object" &&
            !Array.isArray(req.bodyJson)
        ) {
            body = req.bodyJson as Record<string, unknown>;
        } else if (typeof req.bodyText === "string" && req.bodyText.length > 0) {
            try {
                body = JSON.parse(req.bodyText) as Record<string, unknown>;
            } catch {
                log("[queryFAL] bodyText could not be parsed as JSON");
            }
        } else if (typeof req.payload === "string" && req.payload.length > 0) {
            try {
                body = JSON.parse(req.payload) as Record<string, unknown>;
            } catch {
                log("[queryFAL] payload could not be parsed as JSON");
            }
        }
    }
    const modelType = normalizeModelType(body.modelType);

    ensureFalClientConfigured(process.env.FAL_API_KEY);

    if (modelType === "summary") {
        const summaryInput = normalizeSummaryInput(body);
        if (!summaryInput) {
            return res.json(
                { ok: false, error: "Missing required fields: cometId, fromFlybyId, toFlybyId" },
                400
            );
        }

        const endpoint =
            process.env.APPWRITE_FUNCTION_API_ENDPOINT ??
            process.env.APPWRITE_FUNCTION_ENDPOINT ??
            process.env.APPWRITE_ENDPOINT ??
            "";
        const projectId =
            process.env.APPWRITE_FUNCTION_PROJECT_ID ??
            process.env.APPWRITE_PROJECT_ID ??
            (typeof req.headers?.["x-appwrite-project"] === "string"
                ? req.headers["x-appwrite-project"]
                : "");
        const apiKeyHeader =
            typeof req.headers?.["x-appwrite-key"] === "string"
                ? (req.headers["x-appwrite-key"] as string)
                : "";
        const apiKey = apiKeyHeader || process.env.APPWRITE_API_KEY || "";

        try {
            throwIfMissing({ endpoint, projectId, apiKey }, ["endpoint", "projectId", "apiKey"] as const);
        } catch (missingErr) {
            error(missingErr);
            return res.json(
                { ok: false, error: "Missing Appwrite credentials for summary generation" },
                500
            );
        }

        const client = new Client()
            .setEndpoint(endpoint)
            .setProject(projectId)
            .setKey(apiKey);
        const tablesDB = new TablesDB(client);
        const storage = new Storage(client);
        const fetchRow = async (tableId: string, rowId: string, label: string) => {
            try {
                return await tablesDB.getRow({ databaseId: DATABASE_ID, tableId, rowId });
            } catch (fetchErr) {
                const code = getErrorCode(fetchErr);
                if (code === 404) {
                    throw new Error(`${label} not found`);
                }
                throw fetchErr;
            }
        };

        let cometRow: Record<string, any>;
        let fromFlybyRow: Record<string, any>;
        let toFlybyRow: Record<string, any>;
        try {
            [cometRow, fromFlybyRow, toFlybyRow] = await Promise.all([
                fetchRow(TABLE_COMETS, summaryInput.cometId, "Comet"),
                fetchRow(TABLE_FLYBYS, summaryInput.fromFlybyId, "Starting flyby"),
                fetchRow(TABLE_FLYBYS, summaryInput.toFlybyId, "Ending flyby"),
            ]);
        } catch (fetchErr) {
            if (fetchErr instanceof Error && fetchErr.message.includes("not found")) {
                return res.json({ ok: false, error: fetchErr.message }, 404);
            }
            error(fetchErr);
            return res.json({ ok: false, error: "Failed to load Appwrite data" }, 500);
        }

        const cometName =
            typeof cometRow.name === "string" && cometRow.name.trim().length > 0
                ? cometRow.name
                : "Unknown Comet";
        const fromYear = Number(fromFlybyRow.year);
        const toYear = Number(toFlybyRow.year);

        if (!Number.isFinite(fromYear) || !Number.isFinite(toYear)) {
            return res.json(
                { ok: false, error: "Flyby rows must contain numeric year values" },
                422
            );
        }

        const prompt = buildSummaryPrompt(cometName, fromYear, toYear);

        try {
            const modelUsed = DEFAULT_TEXT_MODEL;
            const { data, requestId } = await generateText(prompt, modelUsed);
            const output = extractTextOutput(data);
            if (!output) {
                return res.json(
                    { ok: false, error: "Summary model returned an empty response" },
                    502
                );
            }

            const parsedFields = parseSummaryOutput(output);
            const title = parsedFields.title ?? "Comet Era Summary";
            const summaryText = parsedFields.summary ?? output;

            let summaryRow: Record<string, any>;
            try {
                summaryRow = await tablesDB.createRow({
                    databaseId: DATABASE_ID,
                    tableId: TABLE_SUMMARIES,
                    rowId: ID.unique(),
                    data: {
                        comet: cometRow.$id,
                        from_flyby: fromFlybyRow.$id,
                        to_flyby: toFlybyRow.$id,
                        title,
                        summary: summaryText,
                        llm_model_used: modelUsed,
                        generated_at: new Date().toISOString(),
                    } as Record<string, any>,
                });
            } catch (createErr) {
                error(createErr);
                return res.json({ ok: false, error: "Failed to store summary" }, 500);
            }

            let storedImageUrl: string | null = null;
            try {
                const imagePrompt = buildSummaryImagePrompt(cometName, fromYear, toYear, summaryText);
                const { data: imageData } = await generateImage(imagePrompt);
                const generatedUrl = imageData.images?.[0]?.url;
                if (typeof generatedUrl === "string" && generatedUrl.length > 0) {
                    storedImageUrl = await uploadSummaryImage({
                        storage,
                        endpoint,
                        projectId,
                        summaryId: summaryRow.$id,
                        imageUrl: generatedUrl,
                    });
                    const updatedRow = await tablesDB.updateRow({
                        databaseId: DATABASE_ID,
                        tableId: TABLE_SUMMARIES,
                        rowId: summaryRow.$id,
                        data: { image_url: storedImageUrl } as Record<string, any>,
                    });
                    summaryRow = updatedRow ?? summaryRow;
                }
            } catch (imageErr) {
                error(imageErr);
            }

            const response: HandlerSuccessResponse = {
                ok: true,
                type: "summary",
                requestId,
                summaryId: summaryRow.$id,
                title,
                summary: summaryText,
                cometId: cometRow.$id,
                fromFlybyId: fromFlybyRow.$id,
                toFlybyId: toFlybyRow.$id,
                model: modelUsed,
                imageUrl: storedImageUrl,
            };

            return res.json(response, 200);
        } catch (falErr) {
            error(falErr);
            return res.json({ ok: false, error: "Failed to generate summary" }, 502);
        }
    }

    const prompt = normalizePrompt(body.prompt);

    if (!prompt) {
        return res.json({ ok: false, error: "Missing required field `prompt`" }, 400);
    }

    try {
        if (modelType === "image") {
            const { data, requestId } = await generateImage(prompt);
            const imageUrl = data.images?.[0]?.url ?? null;

            const response: HandlerSuccessResponse = {
                ok: true,
                type: "image",
                requestId,
                src: typeof imageUrl === "string" ? imageUrl : null,
            };

            return res.json(response, 200);
        }

        const { data, requestId } = await generateText(prompt);
        const output = extractTextOutput(data);

        const response: HandlerSuccessResponse = {
            ok: true,
            type: "text",
            requestId,
            output,
        };

        return res.json(response, 200);
    } catch (err) {
        error(err);
        return res.json({ ok: false, error: "Failed to generate content" }, 500);
    }
}
