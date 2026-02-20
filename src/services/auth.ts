import { getPingServerUrl } from '../utils/api';

export interface User {
  id: number;
  username: string;
  email: string;
  createdAt: string;
  isAdmin?: boolean;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
}

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminStats {
  totalUsers: number;
  totalDashboards: number;
  totalAdmins: number;
}

type ApiResult<T = any> = { success: true; data: T } | { success: false; error: string };

class AuthService {
  private token: string | null = null;
  private user: User | null = null;
  private baseUrl: string;

  constructor() {
    this.baseUrl = getPingServerUrl();
    this.loadFromStorage();
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private loadFromStorage(): void {
    const token = localStorage.getItem('auth_token');
    const userJson = localStorage.getItem('auth_user');
    if (token && userJson) {
      this.token = token;
      try { this.user = JSON.parse(userJson); }
      catch { this.clearStorage(); }
    }
  }

  private saveToStorage(): void {
    if (this.token && this.user) {
      localStorage.setItem('auth_token', this.token);
      localStorage.setItem('auth_user', JSON.stringify(this.user));
    }
  }

  private clearStorage(): void {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    this.token = null;
    this.user = null;
  }

  /** Generic API call — handles auth headers, JSON, try/catch in one place */
  private async request<T = any>(
    path: string,
    options: { method?: string; body?: any; auth?: boolean } = {}
  ): Promise<ApiResult<T>> {
    const { method = 'GET', body, auth = true } = options;
    try {
      const headers: Record<string, string> = {};
      if (auth && this.token) headers['Authorization'] = `Bearer ${this.token}`;
      if (body !== undefined) headers['Content-Type'] = 'application/json';

      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      });

      const data = await res.json();
      if (res.status === 409) return { success: false, error: '__conflict__' };

      return data.success
        ? { success: true, data }
        : { success: false, error: data.error || 'Request failed' };
    } catch (err) {
      console.error(`API ${method} ${path} error:`, err);
      return { success: false, error: 'Network error' };
    }
  }

  private post<T = any>(path: string, body?: any) {
    return this.request<T>(path, { method: 'POST', body });
  }

  private del<T = any>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }

  /** Generic admin POST action */
  private async adminAction(path: string, body?: any): Promise<{ success: boolean; error?: string }> {
    if (!this.token) return { success: false, error: 'Not authenticated' };
    const r = await this.post(path, body);
    return r.success ? { success: true } : { success: false, error: r.error };
  }

  // ── Public accessors ────────────────────────────────────────────────

  isAuthenticated(): boolean { return this.token !== null && this.user !== null; }
  getUser(): User | null { return this.user; }
  getToken(): string | null { return this.token; }
  isAdmin(): boolean { return this.user?.isAdmin === true; }

  logout(): void {
    this.clearStorage();
    window.location.reload();
  }

  // ── Auth ─────────────────────────────────────────────────────────────

  async register(username: string, email: string, password: string): Promise<AuthResponse> {
    const r = await this.request('/auth/register', { method: 'POST', body: { username, email, password }, auth: false });
    if (r.success && r.data.token && r.data.user) {
      this.token = r.data.token;
      this.user = r.data.user;
      this.saveToStorage();
      return { success: true, user: r.data.user, token: r.data.token };
    }
    return { success: false, error: !r.success ? r.error : 'Registration failed' };
  }

  async login(username: string, password: string): Promise<AuthResponse> {
    const r = await this.request('/auth/login', { method: 'POST', body: { username, password }, auth: false });
    if (r.success && r.data.token && r.data.user) {
      this.token = r.data.token;
      this.user = r.data.user;
      this.saveToStorage();
      return { success: true, user: r.data.user, token: r.data.token };
    }
    return { success: false, error: !r.success ? r.error : 'Login failed' };
  }

  async verify(): Promise<boolean> {
    if (!this.token) return false;
    const r = await this.request('/auth/verify');
    return r.success;
  }

  // ── Password recovery ────────────────────────────────────────────────

  async requestPasswordRecovery(usernameOrEmail: string): Promise<{ success: boolean; error?: string; message?: string }> {
    const r = await this.post('/auth/request-recovery', { usernameOrEmail });
    return r.success ? { success: true, message: r.data.message } : { success: false, error: r.error };
  }

  async validateRecoveryToken(token: string): Promise<{ valid: boolean; username?: string; error?: string }> {
    const r = await this.request('/auth/validate-token', { method: 'POST', body: { token }, auth: false });
    return r.success && r.data.valid
      ? { valid: true, username: r.data.username }
      : { valid: false, error: !r.success ? r.error : 'Invalid token' };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    const r = await this.request('/auth/reset-password', { method: 'POST', body: { token, newPassword }, auth: false });
    return r.success ? { success: true } : { success: false, error: r.error };
  }

  // ── Dashboard CRUD ──────────────────────────────────────────────────

  async saveDashboard(dashboardData: any, clientVersion?: number): Promise<{ success: boolean; conflict?: boolean; version?: number; dashboardVersions?: Record<string, number> }> {
    if (!this.token) return { success: false };
    const r = await this.post('/dashboard/save', { dashboardData, clientVersion });
    if (!r.success && r.error === '__conflict__') return { success: false, conflict: true };
    return r.success ? { success: true, version: r.data.version, dashboardVersions: r.data.dashboardVersions } : { success: false };
  }

  async loadDashboard(): Promise<any | null> {
    if (!this.token) return null;
    const r = await this.request('/dashboard/load');
    return r.success && r.data.data ? r.data.data : null;
  }

  async saveSingleDashboard(dashboardId: string, name: string, state: any, isActive: boolean): Promise<boolean> {
    if (!this.token) return false;
    const r = await this.post('/dashboard/save-single', { dashboardId, name, state, isActive });
    return r.success;
  }

  async deleteDashboard(dashboardId: string): Promise<boolean> {
    if (!this.token) return false;
    return (await this.del(`/dashboard/${dashboardId}`)).success;
  }

  async toggleDashboardPublic(dashboardId: string, isPublic: boolean): Promise<{ success: boolean; isPublic?: boolean; error?: string }> {
    if (!this.token) return { success: false, error: 'Not authenticated' };
    const r = await this.post(`/dashboard/toggle-public/${dashboardId}`, { isPublic });
    return r.success ? { success: true, isPublic: r.data.isPublic } : { success: false, error: r.error };
  }

  async getPublicDashboard(dashboardId: string): Promise<any> {
    const r = await this.request(`/dashboard/public/${dashboardId}`, { auth: false });
    if (r.success) return r.data.dashboard;
    throw new Error(r.error);
  }

  // ── User profile ────────────────────────────────────────────────────

  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    if (!this.token) return { success: false, error: 'Not authenticated' };
    const r = await this.post('/user/change-password', { currentPassword, newPassword });
    return r.success ? { success: true } : { success: false, error: r.error };
  }

  async updateProfile(email: string): Promise<{ success: boolean; error?: string }> {
    if (!this.token) return { success: false, error: 'Not authenticated' };
    const r = await this.post('/user/update-profile', { email });
    if (r.success && this.user) {
      this.user.email = email;
      this.saveToStorage();
      return { success: true };
    }
    return { success: false, error: !r.success ? r.error : 'Update failed' };
  }

  async getProfile(): Promise<User | null> {
    if (!this.token) return null;
    const r = await this.request('/user/profile');
    if (r.success && r.data.user) {
      this.user = {
        id: r.data.user.id,
        username: r.data.user.username,
        email: r.data.user.email,
        createdAt: r.data.user.created_at,
        isAdmin: r.data.user.is_admin
      };
      this.saveToStorage();
      return this.user;
    }
    return null;
  }

  // ── Admin ───────────────────────────────────────────────────────────

  async getUsers(): Promise<AdminUser[]> {
    if (!this.token) return [];
    const r = await this.request('/admin/users');
    return r.success ? r.data.users : [];
  }

  async makeAdmin(userId: number) { return this.adminAction(`/admin/users/${userId}/make-admin`); }
  async removeAdmin(userId: number) { return this.adminAction(`/admin/users/${userId}/remove-admin`); }
  async resetUserPassword(userId: number, newPassword: string) { return this.adminAction(`/admin/users/${userId}/reset-password`, { newPassword }); }

  async deleteUser(userId: number): Promise<{ success: boolean; error?: string }> {
    if (!this.token) return { success: false, error: 'Not authenticated' };
    const r = await this.del(`/admin/users/${userId}`);
    return r.success ? { success: true } : { success: false, error: r.error };
  }

  async createUser(username: string, email: string, password: string, isAdmin = false): Promise<{ success: boolean; user?: AdminUser; error?: string }> {
    if (!this.token) return { success: false, error: 'Not authenticated' };
    const r = await this.post('/admin/users', { username, email, password, isAdmin });
    return r.success ? { success: true, user: r.data.user } : { success: false, error: r.error };
  }

  async getAdminStats(): Promise<AdminStats | null> {
    if (!this.token) return null;
    const r = await this.request('/admin/stats');
    return r.success ? r.data.stats : null;
  }

  async checkDashboardVersions(): Promise<Record<string, number> | null> {
    if (!this.token) return null;
    const r = await this.request('/dashboard/versions');
    return r.success ? r.data.versions : null;
  }
}

export const authService = new AuthService();
