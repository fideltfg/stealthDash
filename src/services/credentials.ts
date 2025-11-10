import { authService } from './auth';

export interface Credential {
  id: number;
  name: string;
  description?: string;
  service_type: string;
  created_at: string;
  updated_at: string;
  data?: any; // Only present when fetching individual credential
}

export interface CredentialData {
  [key: string]: any;
}

export interface CreateCredentialRequest {
  name: string;
  description?: string;
  service_type: string;
  data: CredentialData;
}

export interface UpdateCredentialRequest {
  name?: string;
  description?: string;
  service_type?: string;
  data?: CredentialData;
}

export interface CredentialsResponse {
  success: boolean;
  credentials?: Credential[];
  credential?: Credential;
  error?: string;
  message?: string;
}

export interface TestCredentialResponse {
  success: boolean;
  valid: boolean;
  message: string;
  service_type: string;
}

class CredentialsService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = this.getServerUrl();
  }

  private getServerUrl(): string {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    return `${protocol}//${hostname}:3001`;
  }

  private getAuthHeaders(): HeadersInit {
    const token = authService.getToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  }

  async getAll(): Promise<Credential[]> {
    try {
      const response = await fetch(`${this.baseUrl}/user/credentials`, {
        headers: this.getAuthHeaders()
      });

      const data = await response.json();

      if (data.success && data.credentials) {
        return data.credentials;
      }

      throw new Error(data.error || 'Failed to fetch credentials');
    } catch (error) {
      console.error('Get credentials error:', error);
      throw error;
    }
  }

  async getById(id: number): Promise<Credential> {
    try {
      const response = await fetch(`${this.baseUrl}/user/credentials/${id}`, {
        headers: this.getAuthHeaders()
      });

      const data = await response.json();

      if (data.success && data.credential) {
        return data.credential;
      }

      throw new Error(data.error || 'Failed to fetch credential');
    } catch (error) {
      console.error('Get credential error:', error);
      throw error;
    }
  }

  async create(request: CreateCredentialRequest): Promise<Credential> {
    try {
      const response = await fetch(`${this.baseUrl}/user/credentials`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(request)
      });

      const data = await response.json();

      if (data.success && data.credential) {
        return data.credential;
      }

      throw new Error(data.error || 'Failed to create credential');
    } catch (error) {
      console.error('Create credential error:', error);
      throw error;
    }
  }

  async update(id: number, request: UpdateCredentialRequest): Promise<Credential> {
    try {
      const response = await fetch(`${this.baseUrl}/user/credentials/${id}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(request)
      });

      const data = await response.json();

      if (data.success && data.credential) {
        return data.credential;
      }

      throw new Error(data.error || 'Failed to update credential');
    } catch (error) {
      console.error('Update credential error:', error);
      throw error;
    }
  }

  async delete(id: number): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/user/credentials/${id}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to delete credential');
      }
    } catch (error) {
      console.error('Delete credential error:', error);
      throw error;
    }
  }

  async test(id: number): Promise<TestCredentialResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/user/credentials/${id}/test`, {
        method: 'POST',
        headers: this.getAuthHeaders()
      });

      const data = await response.json();

      if (data.success) {
        return data as TestCredentialResponse;
      }

      throw new Error(data.error || 'Failed to test credential');
    } catch (error) {
      console.error('Test credential error:', error);
      throw error;
    }
  }

  getServiceTypeFields(serviceType: string): { name: string; label: string; type: string; placeholder?: string }[] {
    const fieldMaps: Record<string, any[]> = {
      pihole: [
        { name: 'password', label: 'App Password', type: 'password', placeholder: 'App Password' }
      ],
      unifi: [
        { name: 'username', label: 'Username', type: 'text', placeholder: 'UniFi username' },
        { name: 'password', label: 'Password', type: 'password', placeholder: 'UniFi password' }
      ],
      home_assistant: [
        { name: 'token', label: 'Long-Lived Access Token', type: 'password', placeholder: 'Long-lived access token' }
      ],
      google_calendar: [
        { name: 'calendar_id', label: 'Calendar ID', type: 'text', placeholder: 'your.email@gmail.com' },
        { name: 'api_key', label: 'Google API Key', type: 'password', placeholder: 'AIza...' }
      ],
      snmp: [
        { name: 'community', label: 'Community String', type: 'text', placeholder: 'e.g., public or private' }
      ],
      api: [
        { name: 'key', label: 'API Key', type: 'password', placeholder: 'API key or token' }
      ],
      custom: []
    };

    return fieldMaps[serviceType] || [];
  }

  getServiceTypeLabel(serviceType: string): string {
    const labels: Record<string, string> = {
      pihole: 'Pi-hole',
      unifi: 'UniFi Controller',
      home_assistant: 'Home Assistant',
      google_calendar: 'Google Calendar',
      snmp: 'SNMP',
      modbus: 'Modbus',
      api: 'Generic API',
      custom: 'Custom'
    };

    return labels[serviceType] || serviceType;
  }

  getServiceTypeIcon(serviceType: string): string {
    const icons: Record<string, string> = {
      pihole: '🛡️',
      unifi: '📡',
      home_assistant: '🏠',
      google_calendar: '📅',
      snmp: '📊',
      modbus: '⚙️',
      api: '🔌',
      custom: '⭐'
    };

    return icons[serviceType] || '🔑';
  }
}

export const credentialsService = new CredentialsService();
