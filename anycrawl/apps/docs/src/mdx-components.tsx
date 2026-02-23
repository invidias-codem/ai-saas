import defaultMdxComponents from "fumadocs-ui/mdx";
import { File, Files, Folder } from "fumadocs-ui/components/files";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import type { MDXComponents } from "mdx/types";
import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import * as icons from "lucide-react";
import { OpenAPIIcon, GithubIcon, OpenAIIcon } from "@/components/icons";
import { APIPage } from "fumadocs-openapi/ui";
import { openapi } from "@/lib/source";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
    return {
        ...(icons as unknown as MDXComponents),
        ...defaultMdxComponents,
        File,
        Files,
        Folder,
        Tabs,
        Tab,
        Accordion,
        Accordions,
        APIPage: (props) => <APIPage {...openapi.getAPIPageProps(props)} />,
        ...components,
        OpenAPIIcon,
        GithubIcon,
        OpenAIIcon,
    };
}
