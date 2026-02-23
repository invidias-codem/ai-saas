import { docs } from "@/.source";
import { loader } from "fumadocs-core/source";
import { icons } from "lucide-react";
import { createElement } from "react";
import { i18n } from "./i18n";
import { createOpenAPI } from 'fumadocs-openapi/server';

export const source = loader({
    baseUrl: "/",
    icon(icon) {
        if (icon && icon in icons) {
            const IconComponent = icons[icon as keyof typeof icons];
            return createElement(IconComponent);
        }
        return undefined;
    },
    source: docs.toFumadocsSource(),
    i18n,
    pageTree: {
        // pageTree configuration without attachFile to avoid undefined errors
    },
});

export const openapi = createOpenAPI({
    // options
});