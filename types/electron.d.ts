export interface RemoteConfig {
  ip: string;
  port: number;
  token: string;
}

declare global {
  interface Window {
    electron?: {
      getRemoteConfig: () => Promise<RemoteConfig>;
    };
  }
}
