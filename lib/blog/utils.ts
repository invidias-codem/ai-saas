// Client-safe blog utilities

import { BlogCategory, BLOG_CATEGORIES } from './types';

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

/**
 * Get category info
 */
export function getCategoryInfo(category: BlogCategory) {
  return BLOG_CATEGORIES[category];
}

/**
 * Generate slug from title
 */
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Extract table of contents from markdown content (client-safe)
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
