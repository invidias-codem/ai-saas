/**
 * Device Identifier Utility
 * 
 * Generates and manages unique device IDs for cross-device sync
 * Persists across browser sessions using localStorage
 */

export interface DeviceInfo {
  deviceId: string;         // Unique identifier
  platform: string;         // 'mobile', 'tablet', 'web'
  browser: string;          // 'Chrome', 'Safari', 'Firefox', 'Edge'
  os: string;               // 'iOS', 'Android', 'Windows', 'Mac', 'Linux'
  screenSize: string;       // "1920x1080"
  lastSeen: number;         // Unix timestamp
  firstSeen: number;        // Unix timestamp
}

// localStorage key for device ID
const DEVICE_ID_KEY = 'genie_device_id';
const DEVICE_INFO_KEY = 'genie_device_info';

/**
 * Generate random string for device ID suffix
 */
function generateRandomSuffix(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

/**
 * Detect browser name from user agent
 */
function detectBrowser(): string {
  if (typeof navigator === 'undefined') return 'Unknown';
  
  const ua = navigator.userAgent;
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Edge')) return 'Edge';
  if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera';
  return 'Other';
}

/**
 * Detect operating system from user agent
 */
function detectOS(): string {
  if (typeof navigator === 'undefined') return 'Unknown';
  
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'Windows';
  if (ua.includes('mac')) return 'Mac';
  if (ua.includes('iphone') || ua.includes('ipad')) return 'iOS';
  if (ua.includes('android')) return 'Android';
  if (ua.includes('linux')) return 'Linux';
  return 'Unknown';
}

/**
 * Detect device platform
 */
function detectPlatform(): string {
  if (typeof navigator === 'undefined') return 'web';
  
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'mobile';
  if (/android/.test(ua)) return 'mobile';
  if (/ipad|tablet/.test(ua)) return 'tablet';
  return 'web';
}

/**
 * Get screen size
 */
function getScreenSize(): string {
  if (typeof window === 'undefined') return '0x0';
  return `${window.innerWidth}x${window.innerHeight}`;
}

/**
 * Generate or retrieve device ID
 * Stored in localStorage to persist across sessions
 */
export function getOrCreateDeviceId(): string {
  if (typeof localStorage === 'undefined') {
    return `device_${Date.now()}_${generateRandomSuffix()}`;
  }

  // Check if device ID already exists
  const existingId = localStorage.getItem(DEVICE_ID_KEY);
  if (existingId) {
    return existingId;
  }

  // Generate new device ID
  const deviceId = `device_${Date.now()}_${generateRandomSuffix()}`;
  localStorage.setItem(DEVICE_ID_KEY, deviceId);
  
  console.log('[DeviceID] Generated new device ID:', deviceId);
  return deviceId;
}

/**
 * Get complete device information
 * Includes platform, browser, OS, screen size
 */
export function getDeviceInfo(): DeviceInfo {
  if (typeof localStorage === 'undefined') {
    return {
      deviceId: `device_${Date.now()}_${generateRandomSuffix()}`,
      platform: 'web',
      browser: 'Unknown',
      os: 'Unknown',
      screenSize: '0x0',
      lastSeen: Date.now(),
      firstSeen: Date.now(),
    };
  }

  const deviceId = getOrCreateDeviceId();
  
  // Try to get cached info
  const cached = localStorage.getItem(DEVICE_INFO_KEY);
  if (cached) {
    const info = JSON.parse(cached) as DeviceInfo;
    info.lastSeen = Date.now();
    localStorage.setItem(DEVICE_INFO_KEY, JSON.stringify(info));
    return info;
  }

  // Create new device info
  const info: DeviceInfo = {
    deviceId,
    platform: detectPlatform(),
    browser: detectBrowser(),
    os: detectOS(),
    screenSize: getScreenSize(),
    firstSeen: Date.now(),
    lastSeen: Date.now(),
  };

  localStorage.setItem(DEVICE_INFO_KEY, JSON.stringify(info));
  
  console.log('[DeviceInfo] Created device info:', {
    platform: info.platform,
    browser: info.browser,
    os: info.os,
  });

  return info;
}

/**
 * Get a human-readable device name
 */
export function getDeviceName(info?: DeviceInfo): string {
  const device = info || getDeviceInfo();
  
  const platformEmoji = {
    mobile: '📱',
    tablet: '📱',
    web: '💻',
  }[device.platform] || '🖥️';

  return `${platformEmoji} ${device.browser} on ${device.os}`;
}

/**
 * Check if this is the same device (for tracking)
 */
export function isSameDevice(deviceId: string): boolean {
  return deviceId === getOrCreateDeviceId();
}

/**
 * Clear device ID (factory reset)
 */
export function clearDeviceId(): void {
  if (typeof localStorage === 'undefined') return;
  
  localStorage.removeItem(DEVICE_ID_KEY);
  localStorage.removeItem(DEVICE_INFO_KEY);
  console.log('[DeviceID] Device ID cleared');
}

/**
 * Export device info for API calls
 */
export function getDeviceHeader(): Record<string, string> {
  const info = getDeviceInfo();
  return {
    'x-device-id': info.deviceId,
    'x-device-platform': info.platform,
    'x-device-browser': info.browser,
  };
}
