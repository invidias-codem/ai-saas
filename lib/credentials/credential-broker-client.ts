/**
 * Credential Broker Client — TypeScript wrapper for the native credential broker.
 * Sends secret inputs through Tauri IPC; native responses never return stored keys or tokens.
 */

import { invoke } from '@tauri-apps/api/core';
import type {
  ProviderKind,
  CredentialKind,
  CredentialRef,
  CredentialStatus,
  BrokerCommand,
  BrokerResponse,
} from '@/lib/contracts/provider-registry';

export class CredentialBrokerClient {
  private static instance: CredentialBrokerClient | null = null;

  static getInstance(): CredentialBrokerClient {
    if (!CredentialBrokerClient.instance) {
      CredentialBrokerClient.instance = new CredentialBrokerClient();
    }
    return CredentialBrokerClient.instance;
  }

  private constructor() {}

  private async invokeCommand(cmd: BrokerCommand): Promise<BrokerResponse> {
    // Map command to Tauri invoke call
    switch (cmd.action) {
      case 'store-api-key':
        return invoke('credential_store_api_key', {
          provider: cmd.provider,
          apiKey: cmd.apiKey,
          label: cmd.label,
          metadata: cmd.metadata,
          suffix: cmd.suffix,
        });

      case 'update-api-key':
        return invoke('credential_update_api_key', {
          provider: cmd.provider,
          apiKey: cmd.apiKey,
          suffix: cmd.suffix,
        });

      case 'get-api-key-status':
        return invoke('credential_get_api_key_status', {
          provider: cmd.provider,
          suffix: cmd.suffix,
        });

      case 'delete-api-key':
        return invoke('credential_delete_api_key', {
          provider: cmd.provider,
          suffix: cmd.suffix,
        });

      case 'list-provider-credentials':
        return invoke('credential_list_provider_credentials', {
          provider: cmd.provider,
        });

      case 'store-refresh-token':
        return invoke('credential_store_refresh_token', {
          provider: cmd.provider,
          token: cmd.token,
          label: cmd.label,
          suffix: cmd.suffix,
        });

      case 'get-refresh-token-status':
        return invoke('credential_get_refresh_token_status', {
          provider: cmd.provider,
          suffix: cmd.suffix,
        });

      case 'delete-refresh-token':
        return invoke('credential_delete_refresh_token', {
          provider: cmd.provider,
          suffix: cmd.suffix,
        });

      case 'store-local-endpoint':
        return invoke('credential_store_local_endpoint', {
          provider: cmd.provider,
          endpointUrl: cmd.endpointUrl,
          modelId: cmd.modelId,
          label: cmd.label,
          suffix: cmd.suffix,
        });

      case 'get-local-endpoint-status':
        return invoke('credential_get_local_endpoint_status', {
          provider: cmd.provider,
          suffix: cmd.suffix,
        });

      case 'get-local-endpoint':
        return invoke('credential_get_local_endpoint', {
          provider: cmd.provider,
          suffix: cmd.suffix,
        });

      case 'delete-local-endpoint':
        return invoke('credential_delete_local_endpoint', {
          provider: cmd.provider,
          suffix: cmd.suffix,
        });

      default:
        throw new Error(`Unknown broker command: ${(cmd as BrokerCommand).action}`);
    }
  }

  private handleError(response: BrokerResponse): never {
    if (response.status === 'error') {
      throw new Error(`${response.code}: ${response.message}`);
    }
    throw new Error(`Unexpected response status: ${response.status}`);
  }

  // --- API Key Operations ---

    async storeApiKey(
      provider: ProviderKind,
      apiKey: string,
      label: string,
      metadata?: Record<string, string>,
      suffix?: string
    ): Promise<CredentialRef> {
      const response = await this.invokeCommand({
        action: 'store-api-key',
        provider,
        apiKey,
        label,
        metadata,
        suffix,
      });
      if (response.status === 'ok') return response.reference;
      this.handleError(response);
    }

    async updateApiKey(provider: ProviderKind, apiKey: string, suffix?: string): Promise<CredentialRef> {
      const response = await this.invokeCommand({
        action: 'update-api-key',
        provider,
        apiKey,
        suffix,
      });
      if (response.status === 'ok') return response.reference;
      this.handleError(response);
    }

    async getApiKeyStatus(provider: ProviderKind, suffix?: string): Promise<CredentialStatus> {
      const response = await this.invokeCommand({
        action: 'get-api-key-status',
        provider,
        suffix,
      });
      if (response.status === 'status') return response.statusValue;
      this.handleError(response);
    }

    async deleteApiKey(provider: ProviderKind, suffix?: string): Promise<void> {
      const response = await this.invokeCommand({
        action: 'delete-api-key',
        provider,
        suffix,
      });
      if (response.status === 'deleted') return;
      this.handleError(response);
    }

    async listProviderCredentials(provider: ProviderKind): Promise<CredentialRef[]> {
      const response = await this.invokeCommand({
        action: 'list-provider-credentials',
        provider,
      });
      if (response.status === 'list') return response.credentials;
      this.handleError(response);
    }

    // --- Refresh Token Operations ---

    async storeRefreshToken(provider: ProviderKind, token: string, label: string, suffix?: string): Promise<CredentialRef> {
      const response = await this.invokeCommand({
        action: 'store-refresh-token',
        provider,
        token,
        label,
        suffix,
      });
      if (response.status === 'ok') return response.reference;
      this.handleError(response);
    }

    async getRefreshTokenStatus(provider: ProviderKind, suffix?: string): Promise<CredentialStatus> {
      const response = await this.invokeCommand({
        action: 'get-refresh-token-status',
        provider,
        suffix,
      });
      if (response.status === 'status') return response.statusValue;
      this.handleError(response);
    }

    async deleteRefreshToken(provider: ProviderKind, suffix?: string): Promise<void> {
      const response = await this.invokeCommand({
        action: 'delete-refresh-token',
        provider,
        suffix,
      });
      if (response.status === 'deleted') return;
      this.handleError(response);
    }

    // --- Local Endpoint Operations ---

    async storeLocalEndpoint(
      provider: ProviderKind,
      endpointUrl: string,
      modelId: string,
      label: string,
      suffix?: string
    ): Promise<CredentialRef> {
      const response = await this.invokeCommand({
        action: 'store-local-endpoint',
        provider,
        endpointUrl,
        modelId,
        label,
        suffix,
      });
      if (response.status === 'ok') return response.reference;
      this.handleError(response);
    }

    async getLocalEndpointStatus(provider: ProviderKind, suffix?: string): Promise<CredentialStatus> {
      const response = await this.invokeCommand({
        action: 'get-local-endpoint-status',
        provider,
        suffix,
      });
      if (response.status === 'status') return response.statusValue;
      this.handleError(response);
    }

    async getLocalEndpoint(provider: ProviderKind, suffix?: string): Promise<{ endpointUrl: string; modelId: string }> {
      const response = await this.invokeCommand({
        action: 'get-local-endpoint',
        provider,
        suffix,
      });
      if (response.status === 'config') {
        return { endpointUrl: response.endpointUrl, modelId: response.modelId };
      }
      this.handleError(response);
    }

    async deleteLocalEndpoint(provider: ProviderKind, suffix?: string): Promise<void> {
      const response = await this.invokeCommand({
        action: 'delete-local-endpoint',
        provider,
        suffix,
      });
      if (response.status === 'deleted') return;
      this.handleError(response);
    }

    // --- Convenience Methods ---

  async hasApiKey(provider: ProviderKind): Promise<boolean> {
    const status = await this.getApiKeyStatus(provider);
    return status.isValid;
  }

  async hasRefreshToken(provider: ProviderKind): Promise<boolean> {
    const status = await this.getRefreshTokenStatus(provider);
    return status.isValid;
  }

  async hasLocalEndpoint(provider: ProviderKind): Promise<boolean> {
    const status = await this.getLocalEndpointStatus(provider);
    return status.isValid;
  }
}

// Export singleton getter
export const credentialBroker = CredentialBrokerClient.getInstance();
