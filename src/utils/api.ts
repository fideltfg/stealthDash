/**
 * Centralized API utility functions.
 * Provides the ping-server URL and authenticated fetch helpers.
 */

import { authService } from '../services/auth';

/** Get the ping server base URL, respecting VITE_PING_SERVER_URL if set */
export function getPingServerUrl(): string {
  const envUrl = (import.meta as any).env?.VITE_PING_SERVER_URL;
  if (envUrl) return envUrl;
  return window.location.origin.replace(':3000', ':3001');
}

/** Build standard auth + JSON headers */
export function getAuthHeaders(json = true): Record<string, string> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${authService.getToken() || ''}`
  };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

/**
 * Convenience wrapper: fetch with auth headers.
 * Merges caller-provided headers on top of auth headers.
 */
export async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = {
    ...getAuthHeaders(options.method !== 'GET'),
    ...(options.headers as Record<string, string> ?? {})
  };
  return fetch(url, { ...options, headers });
}
