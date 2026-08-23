// Server-side MDX Processing Utilities
// This file should only be imported in server components or API routes

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import readingTime from 'reading-time';
import { cache } from 'react';
import { BlogPost, BlogCategory, BlogPostMeta } from './types';
import { getAuthor } from './authors';

const BLOG_DIR = path.join(process.cwd(), 'content/blog');

const VALID_CATEGORIES: BlogCategory[] = [
  'ai-memory',
  'ai-productivity',
  'integrations',
  'industry-insights',
  'security',
  'tutorials',
  'updates',
  'ai-architecture',
  'engineering',
];

const VALID_CATEGORY_SET = new Set<BlogCategory>(VALID_CATEGORIES);

function normalizeCategory(category: string): BlogCategory {
  const normalized = category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  if (VALID_CATEGORY_SET.has(normalized as BlogCategory)) {
    return normalized as BlogCategory;
  }
  return 'industry-insights';
}

type ParsedPostRecord = {
  slug: string;
  post: BlogPost;
};

const readBlogFilenames = cache((): string[] => {
  if (!fs.existsSync(BLOG_DIR)) {
    return [];
  }

  return fs.readdirSync(BLOG_DIR).filter((file) => file.endsWith('.mdx'));
});

const parsePostFile = cache((slug: string): BlogPost | null => {
  try {
    const filePath = path.join(BLOG_DIR, `${slug}.mdx`);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');

    let data = {};
    let content = fileContent;
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
    const match = fileContent.match(frontmatterRegex);

    if (match) {
      try {
        data = yaml.load(match[1]) as any;
        content = match[2];
      } catch (e) {
        console.error(`[BLOG] Invalid YAML frontmatter in ${slug}`, e);
      }
    } else {
      const parts = fileContent.split('---');
      if (parts.length >= 3) {
        const yamlContent = parts[1];
        try {
          data = yaml.load(yamlContent) as any;
          content = parts.slice(2).join('---').trim();
        } catch {
          // ignore fallback parse failure
        }
      }
    }

    const meta = data as BlogPostMeta;
    const stats = readingTime(content);

    return {
      slug,
      title: meta.title,
      description: meta.description,
      publishedAt: meta.publishedAt,
      updatedAt: meta.updatedAt,
      author: getAuthor(meta.author),
      coAuthors: meta.coAuthors?.map(getAuthor),
      category: normalizeCategory(meta.category),
      series: meta.series,
      tags: meta.tags || [],
      readingTime: Math.ceil(stats.minutes),
      featured: meta.featured || false,
      draft: meta.draft === true || String(meta.draft).toLowerCase() === 'true',
      ogImage: meta.ogImage || `/blog/images/${slug}/og-image.png`,
      content,
    };
  } catch (error) {
    console.error(`[BLOG] Error reading post ${slug}:`, error);
    return null;
  }
});

const readAllPosts = cache((): BlogPost[] => {
  return readBlogFilenames()
    .map((file) => file.replace('.mdx', ''))
    .map((slug) => parsePostFile(slug))
    .filter((post): post is BlogPost => post !== null)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
});

/**
 * Get all blog posts sorted by date (newest first)
 * Drafts are excluded from the public index.
 */
export function getAllPosts(): BlogPost[] {
  return readAllPosts().filter((post) => !post.draft);
}

/**
 * Get all posts including drafts (for preview/admin use)
 */
export function getAllPostsIncludingDrafts(): BlogPost[] {
  return readAllPosts();
}

/**
 * Get a single blog post by slug
 */
export function getPostBySlug(slug: string): BlogPost | null {
  return parsePostFile(slug);
}

/**
 * Get all posts in a specific category
 */
export function getPostsByCategory(category: BlogCategory): BlogPost[] {
  return getAllPosts().filter((post) => post.category === category);
}

/**
 * Get featured posts
 * Drafts are excluded.
 */
export function getFeaturedPosts(limit?: number): BlogPost[] {
  const featured = getAllPosts().filter((post) => post.featured);
  return limit ? featured.slice(0, limit) : featured;
}

/**
 * Get posts by tag
 */
export function getPostsByTag(tag: string): BlogPost[] {
  return getAllPosts().filter((post) =>
    post.tags.map((t) => t.toLowerCase()).includes(tag.toLowerCase())
  );
}

/**
 * Get all unique series slugs from published posts
 */
export function getAllSeries(): string[] {
  const posts = getAllPosts();
  const seriesSet = new Set<string>();
  posts.forEach((post) => {
    if (post.series) seriesSet.add(post.series);
  });
  return Array.from(seriesSet).sort();
}

/**
 * Get posts in a specific series
 */
export function getPostsBySeries(series: string): BlogPost[] {
  return getAllPosts().filter((post) => post.series === series);
}

/**
 * Get related posts based on category and tags
 */
export function getRelatedPosts(currentSlug: string, limit: number = 3): BlogPost[] {
  const currentPost = getPostBySlug(currentSlug);
  if (!currentPost) return [];

  const allPosts = getAllPosts().filter((post) => post.slug !== currentSlug);

  const scoredPosts = allPosts.map((post) => {
    let score = 0;

    if (post.category === currentPost.category) {
      score += 3;
    }

    const sharedTags = post.tags.filter((tag) => currentPost.tags.includes(tag));
    score += sharedTags.length;

    return { post, score };
  });

  return scoredPosts
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ post }) => post);
}

/**
 * Get all unique tags
 */
export function getAllTags(): string[] {
  const posts = getAllPosts();
  const tagSet = new Set<string>();

  posts.forEach((post) => {
    post.tags.forEach((tag) => tagSet.add(tag));
  });

  return Array.from(tagSet).sort();
}

/**
 * Get all post slugs (for static generation)
 * Drafts are excluded.
 */
export function getAllPostSlugs(): string[] {
  return readAllPosts()
    .filter((post) => !post.draft)
    .map((post) => post.slug);
}

/**
 * Extract table of contents from markdown content
 */
export function extractTableOfContents(content: string): { id: string; title: string; level: number }[] {
  const headingRegex = /^(#{2,3})\s+(.+)$/gm;
  const toc: { id: string; title: string; level: number }[] = [];

  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length;
    const title = match[2].trim();
    const id = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    toc.push({ id, title, level });
  }

  return toc;
}

/**
 * Format date for display
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
