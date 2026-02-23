import { source } from "@/lib/source";
import { createFromSource } from "fumadocs-core/search/server";

// Map unsupported locales to supported tokenizer languages for Orama
const localeMap = {
    "zh-cn": "english",
    "zh-tw": "english",
};

export const { GET } = createFromSource(source, undefined, { localeMap });
