import Image from "next/image";
import Link from "next/link";
import { ComponentProps } from "react";
import { CodeBlock, InlineCode } from "./code-block";
import { Callout } from "./callout";
import { PromptCard, PromptNavigation } from "./prompt-card";
import { NewsletterCTA } from "./newsletter-cta";

// Custom components available in MDX
export const mdxComponents = {
  // Headings with anchor links
  h1: ({ children, ...props }: ComponentProps<"h1">) => (
    <h1
      className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mt-12 mb-6 first:mt-0"
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ children, id, ...props }: ComponentProps<"h2">) => (
    <h2
      id={id}
      className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-12 mb-4 scroll-mt-24 group"
      {...props}
    >
      <a href={`#${id}`} className="no-underline">
        {children}
        <span className="ml-2 opacity-0 group-hover:opacity-100 text-purple-500 dark:text-purple-400 transition-opacity">
          #
        </span>
      </a>
    </h2>
  ),
  h3: ({ children, id, ...props }: ComponentProps<"h3">) => (
    <h3
      id={id}
      className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white mt-8 mb-3 scroll-mt-24 group"
      {...props}
    >
      <a href={`#${id}`} className="no-underline">
        {children}
        <span className="ml-2 opacity-0 group-hover:opacity-100 text-purple-500 dark:text-purple-400 transition-opacity text-base">
          #
        </span>
      </a>
    </h3>
  ),
  h4: ({ children, ...props }: ComponentProps<"h4">) => (
    <h4
      className="text-lg font-semibold text-slate-900 dark:text-white mt-6 mb-2"
      {...props}
    >
      {children}
    </h4>
  ),

  // Paragraphs
  p: ({ children, ...props }: ComponentProps<"p">) => {
    // Check if this paragraph only contains an image
    // ReactMarkdown wraps images in <p> tags, but our img component returns a <div>
    // which creates invalid HTML nesting.
    const hasOnlyImage =
      Array.isArray(children) &&
      children.length === 1 &&
      typeof children[0] === 'object' &&
      children[0] !== null &&
      'type' in children[0] &&
      children[0].type === 'img';

    if (hasOnlyImage) {
      return <>{children}</>;
    }

    return (
      <p
        className="text-slate-700 dark:text-slate-300 leading-relaxed mb-4"
        {...props}
      >
        {children}
      </p>
    );
  },

  // Links
  a: ({ href, children, ...props }: ComponentProps<"a">) => {
    const isExternal = href?.startsWith("http");

    if (isExternal) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-purple-600 dark:text-purple-400 hover:text-purple-500 dark:hover:text-purple-300 underline underline-offset-2 transition-colors"
          {...props}
        >
          {children}
        </a>
      );
    }

    return (
      <Link
        href={href || "#"}
        className="text-purple-600 dark:text-purple-400 hover:text-purple-500 dark:hover:text-purple-300 underline underline-offset-2 transition-colors"
      >
        {children}
      </Link>
    );
  },

  // Lists
  ul: ({ children, ...props }: ComponentProps<"ul">) => (
    <ul
      className="list-disc list-inside space-y-2 mb-4 text-slate-700 dark:text-slate-300 ml-4"
      {...props}
    >
      {children}
    </ul>
  ),
  ol: ({ children, ...props }: ComponentProps<"ol">) => (
    <ol
      className="list-decimal list-inside space-y-2 mb-4 text-slate-700 dark:text-slate-300 ml-4"
      {...props}
    >
      {children}
    </ol>
  ),
  li: ({ children, ...props }: ComponentProps<"li">) => (
    <li className="text-slate-700 dark:text-slate-300 leading-relaxed" {...props}>
      {children}
    </li>
  ),

  // Blockquote
  blockquote: ({ children, ...props }: ComponentProps<"blockquote">) => (
    <blockquote
      className="border-l-4 border-purple-500 pl-4 py-2 my-6 italic text-slate-600 dark:text-slate-400 bg-slate-100/80 dark:bg-white/5 rounded-r-lg"
      {...props}
    >
      {children}
    </blockquote>
  ),

  // Code
  code: ({ children, className, ...props }: ComponentProps<"code">) => {
    const isCodeBlock = className?.includes("language-");

    if (isCodeBlock) {
      const language = className?.replace("language-", "") || "text";
      return (
        <CodeBlock language={language}>
          {String(children)}
        </CodeBlock>
      );
    }

    return <InlineCode>{children}</InlineCode>;
  },

  // Pre (for code blocks)
  pre: ({ children }: ComponentProps<"pre">) => {
    return <>{children}</>;
  },

  // Images - simplified to avoid hydration errors
  img: ({ src, alt, width, height, ...props }: ComponentProps<"img">) => (
    <div className="relative w-full h-auto my-6">
      <Image
        src={src || ""}
        alt={alt || ""}
        className="rounded-xl border border-slate-200 dark:border-white/10"
        width={800}
        height={450}
        style={{ width: '100%', height: 'auto' }}
        {...props}
      />
    </div>
  ),

  // Tables
  table: ({ children, ...props }: ComponentProps<"table">) => (
    <div className="my-6 overflow-x-auto">
      <table
        className="w-full border-collapse border border-slate-200 dark:border-white/10 rounded-lg overflow-hidden"
        {...props}
      >
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }: ComponentProps<"thead">) => (
    <thead className="bg-slate-100 dark:bg-white/5" {...props}>
      {children}
    </thead>
  ),
  tbody: ({ children, ...props }: ComponentProps<"tbody">) => (
    <tbody {...props}>{children}</tbody>
  ),
  tr: ({ children, ...props }: ComponentProps<"tr">) => (
    <tr className="border-b border-slate-200 dark:border-white/10" {...props}>
      {children}
    </tr>
  ),
  th: ({ children, ...props }: ComponentProps<"th">) => (
    <th
      className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-white"
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }: ComponentProps<"td">) => (
    <td
      className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300"
      {...props}
    >
      {children}
    </td>
  ),

  // Horizontal rule
  hr: () => (
    <hr className="my-12 border-slate-200 dark:border-white/10" />
  ),

  // Strong and emphasis
  strong: ({ children, ...props }: ComponentProps<"strong">) => (
    <strong className="font-semibold text-slate-900 dark:text-white" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }: ComponentProps<"em">) => (
    <em className="italic text-slate-800 dark:text-slate-200" {...props}>
      {children}
    </em>
  ),

  // Custom components
  Callout,
  PromptCard,
  PromptNavigation,
  NewsletterCTA,
  CodeBlock,

  // Image with caption component
  ImageWithCaption: ({
    src,
    alt,
    caption
  }: {
    src: string;
    alt: string;
    caption?: string;
  }) => (
    <figure className="my-8">
      <div className="relative aspect-video rounded-xl overflow-hidden border border-slate-200 dark:border-white/10">
        <Image
          src={src}
          alt={alt}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 800px"
        />
      </div>
      {caption && (
        <figcaption className="text-center text-slate-500 dark:text-gray-500 text-sm mt-3">
          {caption}
        </figcaption>
      )}
    </figure>
  ),

  // Video embed component
  VideoEmbed: ({
    src,
    title
  }: {
    src: string;
    title?: string;
  }) => (
    <div className="my-8 aspect-video rounded-xl overflow-hidden border border-slate-200 dark:border-white/10">
      <iframe
        src={src}
        title={title || "Video"}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="w-full h-full"
      />
    </div>
  ),

  // Comparison table component
  ComparisonTable: ({
    headers,
    rows
  }: {
    headers: string[];
    rows: string[][];
  }) => (
    <div className="my-6 overflow-x-auto">
      <table className="w-full border-collapse border border-slate-200 dark:border-white/10 rounded-lg overflow-hidden">
        <thead className="bg-slate-100 dark:bg-white/5">
          <tr>
            {headers.map((header, i) => (
              <th
                key={i}
                className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-white/10"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-200 dark:border-white/10">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ),
};
