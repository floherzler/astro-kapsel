export function throwIfMissing(obj: Record<string, unknown>, keys: readonly string[]) {
    const missing = keys.filter((key) => {
        const value = obj[key];
        return value === undefined || value === null || value === "";
    });

    if (missing.length > 0) {
        throw new Error(`Missing required fields: ${missing.join(", ")}`);
    }
}

export type NullableNumber = number | null | undefined;

export function coerceNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

export function extractRelationId(value: unknown): string | null {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (typeof value === "object") {
        const entry = value as { $id?: unknown; id?: unknown };
        if (typeof entry.$id === "string") return entry.$id;
        if (typeof entry.id === "string") return entry.id;
        const nestedCandidates = ["data", "rows", "documents"];
        for (const key of nestedCandidates) {
            const nested = (entry as Record<string, unknown>)[key];
            if (Array.isArray(nested) && nested.length > 0) {
                const first = nested[0];
                if (typeof first === "string") return first;
                if (first && typeof first === "object" && typeof (first as { $id?: string }).$id === "string") {
                    return (first as { $id?: string }).$id!;
                }
            }
        }
    }
    if (Array.isArray(value) && value.length > 0) {
        return extractRelationId(value[0]);
    }
    return null;
}
