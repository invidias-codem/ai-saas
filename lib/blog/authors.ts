// Blog Authors Data

import { Author } from './types';

export const authors: Record<string, Author> = {
  'genie-team': {
    id: 'genie-team',
    name: 'Genie AI Team',
    role: 'AI Research & Development',
    avatar: '/blog/authors/genie-team.png',
    bio: 'The team behind Genie AI, building intelligent AI assistants with memory and context awareness. We specialize in RAG systems, multi-modal AI, and seamless integrations.',
    twitter: 'genieai',
    linkedin: 'genie-ai',
  },
  'ai-research': {
    id: 'ai-research',
    name: 'AI Research Team',
    role: 'Technical Research',
    avatar: '/blog/authors/ai-research.png',
    bio: 'Our research team explores cutting-edge AI technologies, from vector embeddings to large language models, bringing practical insights to developers and creators.',
    github: 'genie-ai',
  },
  'content-team': {
    id: 'content-team',
    name: 'Content Team',
    role: 'Content & Education',
    avatar: '/blog/authors/content-team.png',
    bio: 'Dedicated to making AI accessible through tutorials, guides, and practical examples. We help creators and professionals harness the power of AI.',
    twitter: 'genieai',
  },
};

export function getAuthor(id: string): Author {
  return authors[id] || authors['genie-team'];
}

export function getAllAuthors(): Author[] {
  return Object.values(authors);
}
