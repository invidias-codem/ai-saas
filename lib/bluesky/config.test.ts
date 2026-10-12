import { envSchema } from '../../packages/lattice-core/src/schemas/env';
import { blueskyCredentials } from './config';

describe('Bluesky credentials', () => {
  test('uses the deployed engagement handle when identifier is absent', () => {
    expect(blueskyCredentials(envSchema.parse({ BLUESKY_HANDLE: 'lattice.test', BLUESKY_APP_PASSWORD: 'test' })))
      .toEqual({ identifier: 'lattice.test', password: 'test' });
  });
  test('explicit identifier wins over the compatibility handle', () => {
    expect(blueskyCredentials(envSchema.parse({ BLUESKY_IDENTIFIER: 'other.test', BLUESKY_HANDLE: 'lattice.test', BLUESKY_APP_PASSWORD: 'test' })).identifier)
      .toBe('other.test');
  });
  test('missing credentials remain a visible configuration error', () => {
    expect(() => blueskyCredentials(envSchema.parse({ BLUESKY_HANDLE: 'lattice.test' }))).toThrow('BLUESKY_APP_PASSWORD');
  });
});
