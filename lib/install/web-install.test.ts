import { createWebInstallController, type WebInstallPrompt } from './web-install';

const promptEvent = (outcome: 'accepted' | 'dismissed' = 'accepted') => Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
  prompt: jest.fn(async () => undefined),
  userChoice: Promise.resolve({ outcome }),
}) as WebInstallPrompt;

describe('browser installation lifecycle', () => {
  test('offers native installation only after a real installability event', async () => {
    const controller = createWebInstallController();
    expect(await controller.install()).toBe('unavailable');
    const event = promptEvent();
    controller.capture(event);
    expect(event.defaultPrevented).toBe(true);
    expect(controller.getSnapshot().status).toBe('ready');
    expect(event.prompt).not.toHaveBeenCalled();
    expect(await controller.install()).toBe('accepted');
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(await controller.install()).toBe('unavailable');
  });

  test('consumes a dismissed event and allows a fresh event to enable a retry', async () => {
    const controller = createWebInstallController();
    controller.capture(promptEvent('dismissed'));
    expect(await controller.install()).toBe('dismissed');
    expect(controller.getSnapshot().status).toBe('dismissed');
    expect(await controller.install()).toBe('unavailable');
    controller.capture(promptEvent());
    expect(controller.getSnapshot().status).toBe('ready');
  });

  test('handles unsupported events and rejected prompts without claiming success', async () => {
    const controller = createWebInstallController();
    controller.capture(new Event('beforeinstallprompt'));
    expect(controller.getSnapshot().status).toBe('idle');
    const event = promptEvent();
    event.prompt = jest.fn(async () => { throw new Error('Browser refused'); });
    controller.capture(event);
    expect(await controller.install()).toBe('failed');
    expect(controller.getSnapshot().installed).toBe(false);
  });

  test('clears pending prompts when appinstalled or standalone mode is observed', async () => {
    const controller = createWebInstallController();
    const event = promptEvent();
    controller.capture(event);
    controller.markInstalled();
    expect(controller.getSnapshot()).toEqual({ status: 'installed', installed: true });
    expect(await controller.install()).toBe('unavailable');
    expect(event.prompt).not.toHaveBeenCalled();
    controller.capture(promptEvent());
    expect(controller.getSnapshot().status).toBe('installed');
  });

  test('does not open the browser prompt twice during a pending user choice', async () => {
    const controller = createWebInstallController();
    const event = promptEvent();
    let choose!: (choice: { outcome: 'accepted' }) => void;
    event.userChoice = new Promise(resolve => { choose = resolve; });
    controller.capture(event);
    const first = controller.install();
    expect(await controller.install()).toBe('unavailable');
    controller.markInstalled();
    choose({ outcome: 'accepted' });
    await first;
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().status).toBe('installed');
  });
});
