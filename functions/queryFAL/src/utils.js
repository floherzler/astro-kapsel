import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const staticFolder = path.join(path.dirname(__filename), "../static");

const cachedFiles = new Map();

/**
 * Ensures that the provided object contains all required keys with truthy string values.
 * @param {Record<string, unknown>} obj
 * @param {readonly string[]} keys
 * @throws {Error} when any required key is missing or empty.
 */
export function throwIfMissing(obj, keys) {
    const missing = keys.filter((key) => {
        const value = obj[key];
        return value === undefined || value === null || value === "";
    });

    if (missing.length > 0) {
        throw new Error(`Missing required fields: ${missing.join(", ")}`);
    }
}

/**
 * Reads a static file from the function's static directory, caching the contents in-memory.
 * @param {string} fileName
 * @returns {string}
 */
export function getStaticFile(fileName) {
    if (cachedFiles.has(fileName)) {
        return cachedFiles.get(fileName);
    }

    const contents = fs.readFileSync(path.join(staticFolder, fileName), "utf8");
    cachedFiles.set(fileName, contents);
    return contents;
}
