import { source } from "@/lib/source";
import { DocsPage, DocsBody, DocsDescription, DocsTitle } from "fumadocs-ui/page";
import { notFound, redirect } from "next/navigation";
import { createRelativeLink } from "fumadocs-ui/mdx";
import { getMDXComponents } from "@/mdx-components";
import { baseUrl } from "@/lib/utils";

export default async function Page(props: { params: Promise<{ lang: string; slug?: string[] }> }) {
    const params = await props.params;

    // if there is no slug, redirect to the homepage
    if (!params.slug || params.slug.length === 0) {
        redirect(`/${params.lang}/general`);
    }

    const page = source.getPage(params.slug);
    if (!page) notFound();

    const MDXContent = page.data.body;

    return (
        <DocsPage toc={page.data.toc} full={page.data.full}>
            <DocsTitle>{page.data.title}</DocsTitle>
            <DocsDescription>{page.data.description}</DocsDescription>
            <DocsBody>
                <MDXContent
                    components={getMDXComponents({
                        // this allows you to link to other pages with relative file paths
                        a: createRelativeLink(source, page),
                    })}
                />
            </DocsBody>
        </DocsPage>
    );
}

export async function generateStaticParams() {
    return source.generateParams();
}

export async function generateMetadata(props: {
    params: Promise<{ lang: string; slug?: string[] }>;
}) {
    const params = await props.params;
    const page = source.getPage(params.slug, params.lang);
    if (!page) notFound();

    return {
        title: `${page.data.title} - AnyCrawl Docs`,
        description: `${page.data.description}. Turning web into AI with AnyCrawl.`,
        openGraph: {
            title: page.data.title,
            description: page.data.description,
            type: "article",
            url: `${baseUrl}/${params.lang}${params.slug ? `/${params.slug.join("/")}` : ""}`,
            siteName: "AnyCrawl Docs",
        },
    };
}
