// Blog Type Definitions

export interface Author {
  id: string;
  name: string;
  role: string;
  avatar: string;
  bio: string;
  twitter?: string;
  linkedin?: string;
  github?: string;
}

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  updatedAt?: string;
  author: Author;
  coAuthors?: Author[];
  category: BlogCategory;
  tags: string[];
  readingTime: number;
  featured: boolean;
  ogImage: string;
  content: string;
}

export type BlogCategory =
  | 'ai-memory'
  | 'ai-productivity'
  | 'integrations'
  | 'industry-insights'
  | 'security';

export interface BlogCategoryInfo {
  slug: BlogCategory;
  name: string;
  description: string;
  color: string;
  bgColor: string;
}

export interface TableOfContentsItem {
  id: string;
  title: string;
  level: number;
}

export interface BlogPostMeta {
  title: string;
  description: string;
  publishedAt: string;
  updatedAt?: string;
  author: string;
  coAuthors?: string[];
  category: BlogCategory;
  tags: string[];
  featured?: boolean;
  ogImage?: string;
}

// Category metadata
export const BLOG_CATEGORIES: Record<BlogCategory, BlogCategoryInfo> = {
  'ai-memory': {
    slug: 'ai-memory',
    name: 'AI Memory & RAG',
    description: 'Deep dives into RAG systems, vector embeddings, and AI memory architecture',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  'ai-productivity': {
    slug: 'ai-productivity',
    name: 'AI Productivity',
    description: 'Practical guides for content creators, developers, and professionals',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
  },
  'integrations': {
    slug: 'integrations',
    name: 'Integrations',
    description: 'Tutorials for Slack, Zapier, and workflow automation',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
  },
  'industry-insights': {
    slug: 'industry-insights',
    name: 'Industry Insights',
    description: 'Trends, comparisons, and research in the AI space',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
  },
  'security': {
    slug: 'security',
    name: 'Security & Privacy',
    description: 'Updates on how we protect your data, handle auth, and compliance.',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
  },
};
