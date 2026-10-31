import { detectInstallDevice, recommendedInstallMode } from './platform';

describe('installation recommendation', () => {
  test.each([
    ['iPhone', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }, 'ios', true, 'mobile'],
    ['iPad desktop mode', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15', platform: 'MacIntel', maxTouchPoints: 5 }, 'ios', true, 'mobile'],
    ['Android tablet', { userAgent: 'Mozilla/5.0 (Linux; Android 15; Tablet)' }, 'android', true, 'mobile'],
    ['Windows', { userAgentData: { platform: 'Windows', mobile: false } }, 'windows', false, 'desktop'],
    ['Mac laptop', { platform: 'MacIntel', maxTouchPoints: 0 }, 'macos', false, 'desktop'],
    ['Linux', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }, 'linux', false, 'desktop'],
    ['ChromeOS', { userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 16000)' }, 'chromeos', false, 'desktop'],
    ['unknown mobile', { userAgentData: { platform: 'Unknown', mobile: true } }, 'unknown', true, 'mobile'],
    ['unknown browser', {}, 'unknown', false, 'desktop'],
  ])('recommends the right path on %s', (_label, identity, os, mobile, mode) => {
    const device = detectInstallDevice(identity);
    expect(device).toEqual({ os, mobile });
    expect(recommendedInstallMode(device)).toBe(mode);
  });

  test('does not mistake an Android device with Linux client hints for desktop Linux', () => {
    expect(detectInstallDevice({ userAgent: 'Linux; Android 15; Pixel 9', userAgentData: { platform: 'Linux', mobile: true } }).os).toBe('android');
  });

  test('does not recommend a Windows executable for a Windows phone', () => {
    expect(detectInstallDevice({ userAgent: 'Windows Phone 10.0; IEMobile/11.0' })).toEqual({ os: 'unknown', mobile: true });
  });
});
