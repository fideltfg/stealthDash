import { getPingServerUrl, fetchWithAuth } from '../utils/api';

export interface Credential {
  id: number;
  name: string;
  description?: string;
  service_type: string;
  created_at: string;
  updated_at: string;
  data?: any;
}

export interface CreateCredentialRequest {
  name: string;
  description?: string;
  service_type: string;
  data: Record<string, any>;
}

export interface UpdateCredentialRequest {
  name?: string;
  description?: string;
  service_type?: string;
  data?: Record<string, any>;
}

export interface TestCredentialResponse {
  success: boolean;
  valid: boolean;
  message: string;
  service_type: string;
}

// Service-type metadata (fields, labels, icons) in one place
const SERVICE_TYPES: Record<string, {
  label: string;
  icon: string;
  fields: { name: string; label: string; type: string; placeholder?: string }[];
}> = {
  pihole: { label: 'Pi-hole', icon: '<i class="fas fa-shield-alt"></i>', fields: [
    { name: 'password', label: 'App Password', type: 'password', placeholder: 'App Password' }
  ]},
  unifi: { label: 'UniFi Controller', icon: '<i class="fas fa-wifi"></i>', fields: [
    { name: 'username', label: 'Username', type: 'text', placeholder: 'UniFi username' },
    { name: 'password', label: 'Password', type: 'password', placeholder: 'UniFi password' }
  ]},
  home_assistant: { label: 'Home Assistant', icon: '<i class="fas fa-home"></i>', fields: [
    { name: 'token', label: 'Long-Lived Access Token', type: 'password', placeholder: 'Long-lived access token' }
  ]},
  google_calendar: { label: 'Google Calendar', icon: '<i class="fas fa-calendar"></i>', fields: [
    { name: 'calendar_id', label: 'Calendar ID', type: 'text', placeholder: 'your.email@gmail.com' },
    { name: 'api_key', label: 'Google API Key', type: 'password', placeholder: 'AIza...' }
  ]},
  docker: { label: 'Docker', icon: '<i class="fab fa-docker"></i>', fields: [
    { name: 'tls_cert', label: 'TLS Certificate (optional)', type: 'textarea', placeholder: '-----BEGIN CERTIFICATE-----\n...' },
    { name: 'tls_key', label: 'TLS Key (optional)', type: 'password', placeholder: '-----BEGIN PRIVATE KEY-----\n...' },
    { name: 'ca_cert', label: 'CA Certificate (optional)', type: 'textarea', placeholder: '-----BEGIN CERTIFICATE-----\n...' }
  ]},
  snmp:   { label: 'SNMP', icon: '<i class="fas fa-chart-bar"></i>', fields: [
    { name: 'community', label: 'Community String', type: 'text', placeholder: 'e.g., public or private' }
  ]},
  api:    { label: 'Generic API', icon: '<i class="fas fa-plug"></i>', fields: [
    { name: 'key', label: 'API Key', type: 'password', placeholder: 'API key or token' }
  ]},
  modbus: { label: 'Modbus', icon: '<i class="fas fa-cog"></i>', fields: [] },
  custom: { label: 'Custom', icon: '<i class="fas fa-star"></i>', fields: [] },
};

class CredentialsService {
  private baseUrl = getPingServerUrl();

  /** Generic CRUD helper — throws on failure */
  private async api<T>(path: string, method = 'GET', body?: any): Promise<T> {
    const res = await fetchWithAuth(`${this.baseUrl}${path}`, {
      method,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Request failed');
    return data;
  }

  async getAll(): Promise<Credential[]> {
    const data = await this.api<any>('/user/credentials');
    return data.credentials;
  }

  async getById(id: number): Promise<Credential> {
    const data = await this.api<any>(`/user/credentials/${id}`);
    return data.credential;
  }

  async create(request: CreateCredentialRequest): Promise<Credential> {
    const data = await this.api<any>('/user/credentials', 'POST', request);
    return data.credential;
  }

  async update(id: number, request: UpdateCredentialRequest): Promise<Credential> {
    const data = await this.api<any>(`/user/credentials/${id}`, 'PUT', request);
    return data.credential;
  }

  async delete(id: number): Promise<void> {
    await this.api(`/user/credentials/${id}`, 'DELETE');
  }

  async test(id: number): Promise<TestCredentialResponse> {
    return this.api<TestCredentialResponse>(`/user/credentials/${id}/test`, 'POST');
  }

  getServiceTypeFields(serviceType: string) { return SERVICE_TYPES[serviceType]?.fields ?? []; }
  getServiceTypeLabel(serviceType: string) { return SERVICE_TYPES[serviceType]?.label ?? serviceType; }
  getServiceTypeIcon(serviceType: string) { return SERVICE_TYPES[serviceType]?.icon ?? '<i class="fas fa-key"></i>'; }
}

export const credentialsService = new CredentialsService();
