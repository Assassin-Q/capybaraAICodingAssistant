import type { Provider, ProviderAuthMethod, ProviderAuth } from '../types'

// Use Kotlin server proxy for opencode API
const API_BASE = '/api/opencode'

interface ApiResponse<T> {
  data?: T
  error?: string
}

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    // Remove leading slash if present
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint
    const url = `${API_BASE}/${normalizedEndpoint}`
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { error: errorText || `HTTP ${response.status}` }
    }

    const data = await response.json()
    return { data }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : '网络请求失败',
    }
  }
}

export interface ProvidersResponse {
  all: Provider[]
  default: { [key: string]: string }
  connected: string[]
}

export interface ConfigProvidersResponse {
  providers: Provider[]
  default: { [key: string]: string }
}

export const opencodeApi = {
  async getProviders(): Promise<ApiResponse<ProvidersResponse>> {
    return fetchApi<ProvidersResponse>('/provider')
  },

  async getConfigProviders(): Promise<ApiResponse<ConfigProvidersResponse>> {
    return fetchApi<ConfigProvidersResponse>('/config/providers')
  },

  async getProviderAuth(): Promise<ApiResponse<{ [providerID: string]: ProviderAuthMethod[] }>> {
    return fetchApi<{ [providerID: string]: ProviderAuthMethod[] }>('/provider/auth')
  },

  async setProviderAuth(providerId: string, auth: ProviderAuth): Promise<ApiResponse<boolean>> {
    return fetchApi<boolean>(`/auth/${providerId}`, {
      method: 'PUT',
      body: JSON.stringify(auth),
    })
  },

  async checkHealth(): Promise<ApiResponse<{ healthy: boolean; version: string }>> {
    return fetchApi<{ healthy: boolean; version: string }>('/global/health')
  },
}
