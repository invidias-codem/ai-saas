import { log } from "@anycrawl/libs/log";

type Variables = Record<string, any> | undefined;

function getByPath(obj: any, path: string): any {
    if (!obj || !path) return undefined;
    const parts = path.split(".");
    let cur: any = obj;
    for (const p of parts) {
        if (cur == null) return undefined;
        cur = cur[p];
    }
    return cur;
}

function toStringValue(v: any): string {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    try {
        return JSON.stringify(v);
    } catch {
        return String(v);
    }
}

function filterRaw(v: string): string {
    return v;
}

function filterQuery(v: string): string {
    try { return encodeURIComponent(v); } catch { return v; }
}

function filterPath(v: string): string {
    try {
        // Encode then restore '/'
        return encodeURIComponent(v).replace(/%2F/gi, "/");
    } catch {
        return v;
    }
}

function filterHost(v: string): string {
    // Keep only valid hostname chars and lower-case
    return toStringValue(v).toLowerCase().replace(/[^a-z0-9.-]/g, "");
}

type FilterName = "raw" | "query" | "path" | "host";

function applyFilter(value: string, filter: FilterName, allowFilters: boolean): string {
    const f = allowFilters ? filter : "raw";
    switch (f) {
        case "query": return filterQuery(value);
        case "path": return filterPath(value);
        case "host": return filterHost(value);
        case "raw": default: return filterRaw(value);
    }
}

function renderInternal(template: string, variables: Variables, allowFilters: boolean): string {
    if (typeof template !== "string" || template.length === 0) return template;
    // Protect escaped placeholders: \{{ => __AC_ESCAPED_LEFT__
    const ESC = "__AC_ESCAPED_LEFT__";
    let input = template.replace(/\\\{\{/g, ESC);

    const re = /\{\{\s*([A-Za-z0-9_.]+)(?:\s*\|\s*(raw|query|path|host))?\s*\}\}/g;
    input = input.replace(re, (_m, name: string, filter: FilterName | undefined) => {
        const val = getByPath(variables, name);
        if (val === undefined) {
            // Keep original when missing
            return _m;
        }
        const strVal = toStringValue(val);
        const filterName = (filter as FilterName) || "raw";
        return applyFilter(strVal, filterName, allowFilters);
    });

    // Restore escaped placeholders
    return input.replace(new RegExp(ESC, "g"), "{{");
}

// For URL fields (scrape/crawl): filters are active
export function renderUrlTemplate(template: string, variables?: Variables): string {
    try {
        return renderInternal(template, variables, true);
    } catch (e) {
        log.error(`renderUrlTemplate failed: ${e instanceof Error ? e.message : String(e)}`);
        return template;
    }
}

// For plain text fields (e.g., search.query): filters are treated as raw
export function renderTextTemplate(template: string, variables?: Variables): string {
    try {
        return renderInternal(template, variables, false);
    } catch (e) {
        log.error(`renderTextTemplate failed: ${e instanceof Error ? e.message : String(e)}`);
        return template;
    }
}


