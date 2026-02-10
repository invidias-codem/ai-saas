import TurndownService from "turndown";

export function htmlToMarkdown(html: string): string {
    // Pre-process HTML to clean up whitespace
    html = html
        .replace(/>\s+</g, '><')  // Remove whitespace between tags
        .replace(/\s+/g, ' ')      // Normalize all whitespace to single spaces
        .trim();

    const turndownService = new TurndownService({
        preformattedCode: false,
    });

    // Remove unnecessary elements that create noise
    turndownService.remove([
        "script",
        "style",
        "noscript",
        "meta",
        "link"
    ]);

    // Override the default paragraph rule to reduce spacing
    turndownService.addRule('paragraphs', {
        filter: 'p',
        replacement: function (content: string, node: Node) {
            const trimmed = content.trim();
            if (!trimmed) return '';

            // Render inline if paragraph is inside an anchor to avoid line breaks inside links
            let cursor: any = node as any;
            while (cursor) {
                if (cursor.nodeName === 'A') {
                    return trimmed;
                }
                cursor = cursor.parentNode as any;
            }

            return '\n\n' + trimmed + '\n\n';
        }
    });

    // Custom rule to handle divs - treat them as inline unless they have block content
    turndownService.addRule('divs', {
        filter: 'div',
        replacement: function (content: string, node: Node) {
            const trimmedContent = content.trim();
            if (!trimmedContent) return '';

            // Check if div contains block elements
            const element = node as HTMLElement;
            const hasBlockElements = element.querySelector('p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, pre');

            // If inside an anchor, render inline to avoid line breaks inside links
            let cursor: any = node as any;
            while (cursor) {
                if (cursor.nodeName === 'A') {
                    return trimmedContent;
                }
                cursor = cursor.parentNode as any;
            }

            if (hasBlockElements) {
                return '\n\n' + trimmedContent + '\n\n';
            }
            // Treat as inline, add space if needed
            return trimmedContent + ' ';
        }
    });

    // Custom rule to handle spans and ensure proper spacing
    turndownService.addRule('spans', {
        filter: 'span',
        replacement: function (content: string, node: Node) {
            const trimmedContent = content.trim();
            if (!trimmedContent) return '';

            // Check if we need to add space after this span
            const nextSibling = node.nextSibling;
            const prevSibling = node.previousSibling;

            // Add space before if previous sibling was text or another span with content
            let prefix = '';
            if (prevSibling &&
                ((prevSibling.nodeType === 3 && prevSibling.textContent && prevSibling.textContent.trim()) ||
                    (prevSibling.nodeName === 'SPAN' && prevSibling.textContent && prevSibling.textContent.trim()))) {
                prefix = ' ';
            }

            // Add space after if next sibling exists and has content
            let suffix = '';
            if (nextSibling &&
                ((nextSibling.nodeType === 3 && nextSibling.textContent && nextSibling.textContent.trim()) ||
                    (nextSibling.nodeName === 'SPAN' && nextSibling.textContent && nextSibling.textContent.trim()))) {
                suffix = ' ';
            }

            return prefix + trimmedContent + suffix;
        }
    });

    // Handle anchors that wrap a single image to avoid generating bare [![]] blocks
    turndownService.addRule('linkedImages', {
        filter: function (node: Node) {
            const element = node as HTMLElement;
            if (!element || element.nodeName !== 'A') return false;

            // Filter out whitespace-only text nodes
            const children = Array.from(element.childNodes).filter(n => !(n.nodeType === 3 && !n.textContent?.trim()));
            if (children.length !== 1) return false;

            const onlyChild = children[0] as HTMLElement;
            return !!onlyChild && onlyChild.nodeName === 'IMG';
        },
        replacement: function (content: string, node: Node) {
            const anchor = node as HTMLAnchorElement;
            const hrefRaw = anchor.getAttribute ? (anchor.getAttribute('href') || '') : '';
            const href = hrefRaw.trim();
            const isInvalidHref = !href || href === '#' || href.toLowerCase().startsWith('javascript:');

            const imageMd = content.trim(); // expected: ![alt](src)
            return isInvalidHref ? imageMd : `[${imageMd}](${href})`;
        }
    });

    // Normalize figure/picture wrappers to avoid extra blank lines
    turndownService.addRule('figureWrapper', {
        filter: ['figure', 'picture'],
        replacement: function (content: string) {
            const inner = content.trim();
            return inner ? `\n\n${inner}\n\n` : '';
        }
    });

    // Preserve figcaption as a separate paragraph below the image/content
    turndownService.addRule('figcaption', {
        filter: 'figcaption',
        replacement: function (content: string) {
            const text = content.trim();
            return text ? `\n\n${text}\n\n` : '';
        }
    });

    // Handle emphasis elements
    turndownService.addRule('emphasis', {
        filter: ['em', 'i', 'strong', 'b'],
        replacement: function (content: string, node: Node) {
            const cleanContent = content.trim();
            if (!cleanContent) return '';

            const nodeName = node.nodeName.toLowerCase();
            if (nodeName === 'em' || nodeName === 'i') {
                return '*' + cleanContent + '*';
            } else if (nodeName === 'strong' || nodeName === 'b') {
                return '**' + cleanContent + '**';
            }

            return cleanContent;
        }
    });

    // Custom rule for line breaks
    turndownService.addRule('lineBreaks', {
        filter: 'br',
        replacement: function () {
            return '\n';
        }
    });

    // Post-process markdown to remove bare brackets around single images and collapse whitespace
    function normalizeBracketWrappedImages(input: string): string {
        let output = input;

        // Collapse whitespace/newlines inside single-bracketed image: [  ![...](...)  ] -> [![...](...)]
        const collapseInside = (s: string) => s.replace(/\[\s*(!\[[^\]]*\]\([^\)]+\))\s*\]/g, '[$1]');

        // Strip bare brackets when they only wrap an image and are not immediately followed by a link/ref: [![...](...)] -> ![...](...)
        const stripBare = (s: string) => s.replace(/\[\s*(!\[[^\]]*\]\([^\)]+\))\s*\](?!\s*[\(\[])/g, '$1');

        // Iterate until stable to handle multiple nested brackets
        let prev: string;
        do {
            prev = output;
            output = collapseInside(output);
            output = stripBare(output);
        } while (output !== prev);

        return output;
    }

    // Collapse excessive whitespace/newlines inside markdown link brackets
    function normalizeLinkTextWhitespace(input: string): string {
        return input.replace(/\[\s*([\s\S]*?)\s*\]\(([^\)]+)\)/g, (_m: string, linkText: string, parens: string) => {
            // Replace internal newlines/tabs with single spaces and collapse multiple spaces
            const cleaned = linkText
                .replace(/[\t\r\n]+/g, ' ')
                .replace(/\s{2,}/g, ' ')
                .trim();
            return `[${cleaned}](${parens})`;
        });
    }


    // Convert and clean up the result
    let markdown = turndownService.turndown(html);
    markdown = normalizeBracketWrappedImages(markdown);
    markdown = normalizeLinkTextWhitespace(markdown);

    // Collapse 3+ blank lines to at most 2 and trim
    markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

    return markdown;
}
