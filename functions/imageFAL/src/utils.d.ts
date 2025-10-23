export declare function throwIfMissing<
    T extends Record<string, string | undefined | null>,
    K extends readonly string[]
>(
    obj: T,
    keys: K
): asserts obj is T & Record<K[number], string>;

export declare function getStaticFile(fileName: string): string;
