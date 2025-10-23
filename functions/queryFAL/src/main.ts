import { fal } from "@fal-ai/client";
import { Client, ID, TablesDB } from "node-appwrite";
import { getStaticFile, throwIfMissing } from "./utils.js";

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
    bodyJson?: {
        prompt?: unknown;
        modelType?: unknown;
    };
}

interface HandlerResponse {
    json(body: unknown, status?: number, headers?: Record<string, string>): unknown;
    text(body: string, status?: number, headers?: Record<string, string>): unknown;
}

interface HandlerContext {
    req: HandlerRequest;
    res: HandlerResponse;
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
      };

type FalResult<TPayload> = {
    requestId: string;
    data: TPayload;
    logs?: unknown;
    [key: string]: unknown;
};

const IMAGE_MODEL_ID = "fal-ai/flux/dev";
const TEXT_ORCHESTRATOR_ID = "fal-ai/any-llm";
const DEFAULT_TEXT_MODEL = "google/gemini-2.5-flash-lite";

const DATABASE_ID = "astroDB";
const TABLE_COMETS = "comets";
const TABLE_FLYBYS = "flybys";
const TABLE_SUMMARIES = "summaries";

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

function buildSummaryPrompt(cometName: string, lastFlyby: number, nextFlyby: number): string {
    return `
You are a science historian and storyteller. Write an engaging but factual summary of the historical period between two comet flybys.

Context:
- Comet name: ${cometName}
- Last flyby year: ${Math.round(lastFlyby)}
- Next flyby year: ${Math.round(nextFlyby)}

Instructions:
1. Begin with a short introduction about the comet and its orbital rhythm.
2. Describe key events, discoveries, or cultural shifts between these years.
3. Connect humanity’s progress in science or space exploration to the comet’s journey.
4. Keep the tone informative and inspiring.
5. Length: about 200–300 words.

Return a JSON:
{
  "title": "A poetic title for the era",
  "summary": "Full text of your summary."
}
`;
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
            image_size: "landscape_4_3",
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

export default async function handler({ req, res, error }: HandlerContext) {
    throwIfMissing(process.env, ["FAL_API_KEY"] as const);

    if (req.method === "GET") {
        return res.text(getStaticFile("index.html"), 200, {
            "Content-Type": "text/html; charset=utf-8",
        });
    }

    const body = req.bodyJson ?? {};
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
            process.env.APPWRITE_FUNCTION_PROJECT_ID ?? process.env.APPWRITE_PROJECT_ID ?? "";
        const apiKey = process.env.APPWRITE_API_KEY ?? "";

        try {
            throwIfMissing({ endpoint, projectId }, ["endpoint", "projectId"] as const);
        } catch (missingErr) {
            error(missingErr);
            return res.json(
                { ok: false, error: "Missing Appwrite configuration for summary generation" },
                500
            );
        }

        const client = new Client().setEndpoint(endpoint).setProject(projectId);
        if (apiKey) {
            client.setKey(apiKey);
        }
        const tablesDB = new TablesDB(client);
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
            const { data, requestId } = await generateText(prompt);
            const output = extractTextOutput(data);
            if (!output) {
                return res.json(
                    { ok: false, error: "Summary model returned an empty response" },
                    502
                );
            }

            let title = "Comet Era Summary";
            let summaryText = output;
            try {
                const parsed = JSON.parse(output);
                if (typeof parsed.title === "string" && parsed.title.trim().length > 0) {
                    title = parsed.title.trim();
                }
                if (typeof parsed.summary === "string" && parsed.summary.trim().length > 0) {
                    summaryText = parsed.summary.trim();
                }
            } catch {
                // keep fallback values
            }

            let summaryRow: Record<string, any>;
            try {
                summaryRow = await tablesDB.createRow({
                    databaseId: DATABASE_ID,
                    tableId: TABLE_SUMMARIES,
                    rowId: ID.unique(),
                    data: {
                        comet: [cometRow.$id],
                        from_flyby: fromFlybyRow.$id,
                        to_flyby: toFlybyRow.$id,
                        title,
                        summary: summaryText,
                        llm_model_used: "fal/meta-llama-3.1-70b",
                        generated_at: new Date().toISOString(),
                    } as Record<string, any>,
                });
            } catch (createErr) {
                error(createErr);
                return res.json({ ok: false, error: "Failed to store summary" }, 500);
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
            };

            return res.json(response, 201);
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
