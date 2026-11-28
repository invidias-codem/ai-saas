import { HarnessFactory } from './IOHarness';
import { GoIOHarness } from './GoIOHarness';
import { LocalIOHarness } from './LocalIOHarness';

jest.mock('./GoIOHarness');
jest.mock('./LocalIOHarness');
jest.mock('@/lib/supabaseClient', () => ({ supabaseAdmin: null }));
jest.mock('@/lib/telemetry/riskAdapter', () => ({ emitRiskEvent: jest.fn() }));

test('failed native startup never substitutes the Node execution policy', async () => {
  const previous = process.env.LATTICE_ENABLE_LOCAL_HARNESS;
  process.env.LATTICE_ENABLE_LOCAL_HARNESS = 'true';
  (GoIOHarness.prototype.initialize as jest.Mock).mockRejectedValue(new Error('startup failed'));
  try {
    await expect(HarnessFactory.create({ env: 'local', workspaceRoot: '.' })).rejects.toThrow('startup failed');
    expect(LocalIOHarness).not.toHaveBeenCalled();
    expect(GoIOHarness.prototype.shutdown).toHaveBeenCalled();
  } finally {
    if (previous === undefined) delete process.env.LATTICE_ENABLE_LOCAL_HARNESS;
    else process.env.LATTICE_ENABLE_LOCAL_HARNESS = previous;
  }
});
