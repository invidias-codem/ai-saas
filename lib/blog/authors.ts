// Blog Authors Data

import { Author } from './types';

export const authors: Record<string, Author> = {
  'joshua-jair': {
    id: 'joshua-jair',
    name: 'Joshua-Jair E. Mohammed',
    role: 'Founder & Lead Engineer',
    avatar: '/authors/joshua-jair.png',
    bio: 'Founder of Lattice OS, focused on memory-native AI, hybrid inference, agent routing, and durable workspace infrastructure.',
    linkedin: 'joshua-jair-mohammed',
    github: 'invidias-codem',
  },
};

export function getAuthor(id: string): Author {
  return authors['joshua-jair'];
}

export function getAllAuthors(): Author[] {
  return Object.values(authors);
}
