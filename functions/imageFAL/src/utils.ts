import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type EnvLike = Record<string, string | undefined | null>;

export function throwIfMissing<T extends EnvLike, K extends readonly string[]>(
    obj: T,
    keys: K
): asserts obj is T & Record<K[number], string> {
    const missing = keys.filter((key) => {
        const value = obj[key];
        return value === undefined || value === null || value === "";
    });

    if (missing.length > 0) {
        throw new Error(`Missing required fields: ${missing.join(", ")}`);
    }
}

const __filename = fileURLToPath(import.meta.url);
const staticFolder = path.join(path.dirname(__filename), "../static");

const cachedFiles = new Map<string, string>();

export function getStaticFile(fileName: string): string {
    if (cachedFiles.has(fileName)) {
        return cachedFiles.get(fileName)!;
    }

    const contents = fs.readFileSync(path.join(staticFolder, fileName), "utf8");
    cachedFiles.set(fileName, contents);
    return contents;
}
