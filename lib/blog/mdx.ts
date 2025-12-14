// Server-side MDX Processing Utilities
// This file should only be imported in server components or API routes

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import readingTime from 'reading-time';
import { BlogPost, BlogCategory, BlogPostMeta } from './types';
import { getAuthor } from './authors';

const BLOG_DIR = path.join(process.cwd(), 'content/blog');

/**
 * Get all blog posts sorted by date (newest first)
 */
export function getAllPosts(): BlogPost[] {
  // Ensure directory exists
  if (!fs.existsSync(BLOG_DIR)) {
    return [];
  }

  const files = fs.readdirSync(BLOG_DIR);
  
  const posts = files
    .filter((file) => file.endsWith('.mdx'))
    .map((file) => {
      const slug = file.replace('.mdx', '');
      return getPostBySlug(slug);
    })
    .filter((post): post is BlogPost => post !== null)
    .sort((a, b) => 
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  
  return posts;
}

/**
 * Get a single blog post by slug
 */
export function getPostBySlug(slug: string): BlogPost | null {
  try {
    const filePath = path.join(BLOG_DIR, `${slug}.mdx`);
    
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const { data, content } = matter(fileContent);
    const meta = data as BlogPostMeta;
    
    // Calculate reading time
    const stats = readingTime(content);
    
    return {
      slug,
      title: meta.title,
      description: meta.description,
      publishedAt: meta.publishedAt,
      updatedAt: meta.updatedAt,
      author: getAuthor(meta.author),
      coAuthors: meta.coAuthors?.map(getAuthor),
      category: meta.category,
      tags: meta.tags || [],
      readingTime: Math.ceil(stats.minutes),
      featured: meta.featured || false,
      ogImage: meta.ogImage || `/blog/images/${slug}/og-image.png`,
      content,
    };
  } catch (error) {
    console.error(`Error reading post ${slug}:`, error);
    return null;
  }
}

/**
 * Get all posts in a specific category
 */
export function getPostsByCategory(category: BlogCategory): BlogPost[] {
  return getAllPosts().filter((post) => post.category === category);
}

/**
 * Get featured posts
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
    post.tags.map(t => t.toLowerCase()).includes(tag.toLowerCase())
  );
}

/**
 * Get related posts based on category and tags
 */
export function getRelatedPosts(currentSlug: string, limit: number = 3): BlogPost[] {
  const currentPost = getPostBySlug(currentSlug);
  if (!currentPost) return [];

  const allPosts = getAllPosts().filter((post) => post.slug !== currentSlug);
  
  // Score posts by relevance
  const scoredPosts = allPosts.map((post) => {
    let score = 0;
    
    // Same category = +3
    if (post.category === currentPost.category) {
      score += 3;
    }
    
    // Shared tags = +1 each
    const sharedTags = post.tags.filter((tag) => 
      currentPost.tags.includes(tag)
    );
    score += sharedTags.length;
    
    return { post, score };
  });

  // Sort by score and return top posts
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
 */
export function getAllPostSlugs(): string[] {
  if (!fs.existsSync(BLOG_DIR)) {
    return [];
  }

  return fs.readdirSync(BLOG_DIR)
    .filter((file) => file.endsWith('.mdx'))
    .map((file) => file.replace('.mdx', ''));
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
