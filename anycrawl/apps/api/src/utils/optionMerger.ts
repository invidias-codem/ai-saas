/**
 * Utility functions for merging options with template defaults
 */

/**
 * Merge template options with request options, giving priority to request options.
 * Only uses template values for properties that are undefined in the request.
 * 
 * @param templateOptions - Options from the template (used as base)
 * @param requestOptions - Options from the request body (takes priority)
 * @returns Merged options with request options taking priority
 */
export function mergeOptionsWithTemplate<T extends Record<string, any>>(
    templateOptions: T,
    requestOptions: Partial<T>
): T {
    const merged = { ...templateOptions };

    // Override with request options, but only if they are defined
    for (const key in requestOptions) {
        if (requestOptions[key] !== undefined && requestOptions[key] !== null) {
            merged[key] = requestOptions[key] as T[Extract<keyof T, string>];
        }
    }

    return merged;
}

/**
 * Deep merge template options with request options, giving priority to request options.
 * This function recursively merges nested objects, only using template values for
 * properties that are undefined in the request.
 * 
 * @param requestOptions - Options from the request body
 * @param templateOptions - Options from the template
 * @returns Deep merged options with request options taking priority
 */
export function deepMergeOptionsWithTemplate<T extends Record<string, any>>(
    requestOptions: T,
    templateOptions: T
): T {
    const merged = { ...templateOptions };

    for (const key in requestOptions) {
        const requestValue = requestOptions[key];
        const templateValue = templateOptions[key];

        if (requestValue !== undefined && requestValue !== null) {
            // If both values are objects and not arrays, merge them recursively
            if (
                typeof requestValue === 'object' &&
                typeof templateValue === 'object' &&
                !Array.isArray(requestValue) &&
                !Array.isArray(templateValue) &&
                requestValue !== null &&
                templateValue !== null
            ) {
                merged[key] = deepMergeOptionsWithTemplate(requestValue, templateValue);
            } else {
                // Otherwise, use the request value
                merged[key] = requestValue;
            }
        }
    }

    return merged;
}
