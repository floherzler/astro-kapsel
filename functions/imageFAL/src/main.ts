import { fal } from "@fal-ai/client";
import { getStaticFile, throwIfMissing } from "./utils.ts";

type ModelType = "text" | "image";

type FalImagePayload = {
    images?: Array<{ url?: string | null }>;
    [key: string]: unknown;
};

type FalTextPayload = {
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

interface GenerationResult {
    ok: boolean;
    type: ModelType;
    requestId: string;
    src?: string | null;
    output?: string | null;
}

type FalResult<TPayload> = {
    requestId: string;
    data: TPayload;
    logs?: unknown;
    [key: string]: unknown;
};

const IMAGE_MODEL_ID = "fal-ai/flux/dev";
const TEXT_ORCHESTRATOR_ID = "fal-ai/any-llm";
const DEFAULT_TEXT_MODEL = "google/gemini-2.5-flash-lite";

let falConfigured = false;

function ensureFalClientConfigured(apiKey: string) {
    if (!falConfigured) {
        fal.config({ credentials: apiKey });
        falConfigured = true;
    }
}

function normalizeModelType(value: unknown): ModelType {
    if (typeof value === "string" && value.toLowerCase() === "image") {
        return "image";
    }
    return "text";
}

function normalizePrompt(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function extractTextOutput(data: FalTextPayload): string | null {
    if (typeof data.output_text === "string" && data.output_text.length > 0) {
        return data.output_text;
    }
    if (typeof data.text === "string" && data.text.length > 0) {
        return data.text;
    }
    return null;
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

async function generateText(prompt: string): Promise<FalResult<FalTextPayload>> {
    const job = await fal.subscribe(TEXT_ORCHESTRATOR_ID, {
        input: {
            model: DEFAULT_TEXT_MODEL,
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
    const prompt = normalizePrompt(body.prompt);
    const modelType = normalizeModelType(body.modelType);

    if (!prompt) {
        return res.json({ ok: false, error: "Missing required field `prompt`" }, 400);
    }

    ensureFalClientConfigured(process.env.FAL_API_KEY);

    try {
        if (modelType === "image") {
            const { data, requestId } = await generateImage(prompt);
            const imageUrl = data.images?.[0]?.url ?? null;

            const response: GenerationResult = {
                ok: true,
                type: "image",
                requestId,
                src: typeof imageUrl === "string" ? imageUrl : null,
            };

            return res.json(response, 200);
        }

        const { data, requestId } = await generateText(prompt);
        const output = extractTextOutput(data);

        const response: GenerationResult = {
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
