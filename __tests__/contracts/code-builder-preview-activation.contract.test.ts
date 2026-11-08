// Contract: generated executable previews may never be served from Lattice's
// authenticated application origin. Owner sandbox previews are the only path.
import { GET, POST } from '@/app/api/preview/render/route';

describe('legacy same-origin preview execution (security #479)', () => {
  it('GET refuses to render executable generated HTML', async () => {
    const response = await GET();
    expect(response.status).toBe(410);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual(
      expect.objectContaining({ error: expect.stringContaining('disabled') })
    );
  });
  it('POST refuses to create legacy same-origin preview sessions', async () => {
    const response = await POST();
    expect(response.status).toBe(410);
  });
});
