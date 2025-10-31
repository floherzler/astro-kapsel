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
 * Attempts to coerce a value into a finite number.
 * @param {unknown} value
 * @returns {number | null}
 */
export function coerceNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

/**
 * Extracts an Appwrite relation id from various shapes (string, object, array).
 * @param {unknown} value
 * @returns {string | null}
 */
export function extractRelationId(value) {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (Array.isArray(value) && value.length > 0) {
        return extractRelationId(value[0]);
    }
    if (typeof value === "object") {
        const entry = /** @type {{ $id?: unknown; id?: unknown } & Record<string, unknown>} */ (value);
        if (typeof entry.$id === "string") return entry.$id;
        if (typeof entry.id === "string") return entry.id;
        const nestedCandidates = ["data", "rows", "documents"];
        for (const key of nestedCandidates) {
            const nested = entry[key];
            if (Array.isArray(nested) && nested.length > 0) {
                const first = nested[0];
                if (typeof first === "string") return first;
                if (first && typeof first === "object" && typeof first.$id === "string") {
                    return first.$id;
                }
            }
        }
    }
    return null;
}
