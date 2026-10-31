export type DesktopPlatform = 'windows' | 'macos' | 'linux';
export type InstallMode = 'mobile' | 'desktop' | 'terminal';
export type InstallDevice = { os: DesktopPlatform | 'ios' | 'android' | 'chromeos' | 'unknown'; mobile: boolean };
export type BrowserIdentity = {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  userAgentData?: { platform?: string; mobile?: boolean };
};

/** A recommendation only: users can always select a different platform. */
export function detectInstallDevice(identity: BrowserIdentity = {}): InstallDevice {
  const ua = identity.userAgent ?? '';
  const platform = identity.userAgentData?.platform ?? identity.platform ?? '';
  if (/Windows Phone|IEMobile/i.test(ua)) return { os: 'unknown', mobile: true };
  // iPadOS can identify as a Mac when requesting the desktop site.
  if (/iPad|iPhone|iPod/i.test(ua) || (/Mac/i.test(`${ua} ${platform}`) && (identity.maxTouchPoints ?? 0) > 1)) {
    return { os: 'ios', mobile: true };
  }
  if (/Android/i.test(`${ua} ${platform}`)) return { os: 'android', mobile: true };
  if (/CrOS|Chrome OS/i.test(`${ua} ${platform}`)) return { os: 'chromeos', mobile: false };
  const mobile = identity.userAgentData?.mobile === true || /Mobi|Tablet/i.test(ua);
  if (mobile) return { os: 'unknown', mobile: true };
  if (/Win/i.test(platform) || /Windows/i.test(ua)) return { os: 'windows', mobile: false };
  if (/Mac/i.test(`${ua} ${platform}`)) return { os: 'macos', mobile: false };
  if (/Linux/i.test(`${ua} ${platform}`)) return { os: 'linux', mobile: false };
  return { os: 'unknown', mobile: false };
}

export const recommendedInstallMode = (device: InstallDevice): InstallMode => device.mobile ? 'mobile' : 'desktop';
export const isDesktopPlatform = (os: InstallDevice['os']): os is DesktopPlatform => os === 'windows' || os === 'macos' || os === 'linux';
