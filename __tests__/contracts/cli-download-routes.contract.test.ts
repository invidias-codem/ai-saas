import { createRouteMatcher } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const source = readFileSync(resolve(__dirname, '../../proxy.ts'), 'utf8');
const list = source.slice(source.indexOf('createRouteMatcher(['), source.indexOf(']);', source.indexOf('createRouteMatcher([')));
const routes = [...list.matchAll(/^\s*'([^']+)'/gm)].map(m => m[1]);
const isPublic = createRouteMatcher(routes);

test.each(['/downloads', '/en/downloads', '/fr/downloads'])('allows the public download page %s', pathname => {
  expect(isPublic(new NextRequest(`https://example.test${pathname}`))).toBe(true);
});
test.each(['/api/downloads', '/api/code-builder/stream', '/downloads/admin', '/en/downloads/private', '/api/settings/keys'])('keeps adjacent and protected paths private: %s', pathname => {
  expect(isPublic(new NextRequest(`https://example.test${pathname}`))).toBe(false);
});
