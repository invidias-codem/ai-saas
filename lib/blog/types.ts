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
  series?: string;
  tags: string[];
  readingTime: number;
  featured: boolean;
  draft?: boolean;
  ogImage: string;
  content: string;
}

export type BlogCategory =
  | 'ai-memory'
  | 'ai-productivity'
  | 'integrations'
  | 'industry-insights'
  | 'security'
  | 'tutorials'
  | 'updates'
  | 'ai-architecture'
  | 'engineering';

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
  series?: string;
  tags: string[];
  featured?: boolean;
  draft?: boolean;
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
  'tutorials': {
    slug: 'tutorials',
    name: 'Tutorials',
    description: 'Step-by-step guides and hands-on walkthroughs.',
    color: 'text-teal-400',
    bgColor: 'bg-teal-500/10',
  },
  'updates': {
    slug: 'updates',
    name: 'Updates',
    description: 'Product updates, changelogs, and release notes.',
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10',
  },
  'ai-architecture': {
    slug: 'ai-architecture',
    name: 'AI Architecture',
    description: 'Architecture patterns and design for AI-native systems.',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
  },
  'engineering': {
    slug: 'engineering',
    name: 'Engineering',
    description: 'Engineering practices, internals, and build notes.',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
  },
};
