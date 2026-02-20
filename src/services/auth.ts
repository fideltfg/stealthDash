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

class AuthService {
  private token: string | null = null;
  private user: User | null = null;
  private baseUrl: string;

  constructor() {
    this.baseUrl = this.getServerUrl();
    this.loadFromStorage();
  }

  private getServerUrl(): string {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    return `${protocol}//${hostname}:3001`;
  }

  private loadFromStorage(): void {
    const token = localStorage.getItem('auth_token');
    const userJson = localStorage.getItem('auth_user');
    
    if (token && userJson) {
      this.token = token;
      try {
        this.user = JSON.parse(userJson);
      } catch (e) {
        console.warn('⚠️  Failed to parse cached user data, clearing storage');
        this.clearStorage();
      }
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

  async register(username: string, email: string, password: string): Promise<AuthResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });

      const data = await response.json();

      if (data.success && data.token && data.user) {
        this.token = data.token;
        this.user = data.user;
        this.saveToStorage();
        return { success: true, user: data.user, token: data.token };
      }

      return { success: false, error: data.error || 'Registration failed' };
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async login(username: string, password: string): Promise<AuthResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (data.success && data.token && data.user) {
        this.token = data.token;
        this.user = data.user;
        this.saveToStorage();
        return { success: true, user: data.user, token: data.token };
      }

      return { success: false, error: data.error || 'Login failed' };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  logout(): void {
    this.clearStorage();
    window.location.reload();
  }

  async verify(): Promise<boolean> {
    if (!this.token) return false;

    try {
      const response = await fetch(`${this.baseUrl}/auth/verify`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      const data = await response.json();
      return data.success === true;
    } catch (error) {
      return false;
    }
  }

  isAuthenticated(): boolean {
    return this.token !== null && this.user !== null;
  }

  getUser(): User | null {
    return this.user;
  }

  getToken(): string | null {
    return this.token;
  }

  async requestPasswordRecovery(usernameOrEmail: string): Promise<{ success: boolean; error?: string; message?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/request-recovery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail })
      });

      const data = await response.json();
      
      if (data.success) {
        return { 
          success: true,
          message: data.message
        };
      }

      return { success: false, error: data.error || 'Recovery request failed' };
    } catch (error) {
      console.error('Password recovery request error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async validateRecoveryToken(token: string): Promise<{ valid: boolean; username?: string; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/validate-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });

      const data = await response.json();
      
      if (data.valid) {
        return { 
          valid: true,
          username: data.username
        };
      }

      return { valid: false, error: data.error || 'Invalid token' };
    } catch (error) {
      console.error('Token validation error:', error);
      return { valid: false, error: 'Network error' };
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword })
      });

      const data = await response.json();
      
      if (data.success) {
        return { success: true };
      }

      return { success: false, error: data.error || 'Password reset failed' };
    } catch (error) {
      console.error('Password reset error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async saveDashboard(dashboardData: any, clientVersion?: number): Promise<{ success: boolean; conflict?: boolean; version?: number }> {
    if (!this.token) return { success: false };

    try {
      const response = await fetch(`${this.baseUrl}/dashboard/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ dashboardData, clientVersion })
      });

      const data = await response.json();
      
      if (response.status === 409) {
        // Version conflict
        return { success: false, conflict: true };
      }
      
      if (data.success) {
        return { success: true, version: data.version };
      }
      console.error('❌ Failed to save dashboard:', data.error);
      return { success: false };
    } catch (error) {
      console.error('❌ Save dashboard error:', error);
      return { success: false };
    }
  }

  async loadDashboard(): Promise<any | null> {
    if (!this.token) return null;

    try {
      const response = await fetch(`${this.baseUrl}/dashboard/load`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      const data = await response.json();
      if (data.success && data.data) {
       // console.log('✅ Dashboard loaded from server:', data.data.dashboards.length, 'dashboards');
        return data.data; // Includes version field
      }
      return null;
    } catch (error) {
      console.error('❌ Load dashboard error:', error);
      return null;
    }
  }

  async saveSingleDashboard(dashboardId: string, name: string, state: any, isActive: boolean): Promise<boolean> {
    if (!this.token) return false;

    try {
      const response = await fetch(`${this.baseUrl}/dashboard/save-single`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ dashboardId, name, state, isActive })
      });

      const data = await response.json();
      return data.success === true;
    } catch (error) {
      console.error('❌ Save single dashboard error:', error);
      return false;
    }
  }

  async deleteDashboard(dashboardId: string): Promise<boolean> {
    if (!this.token) return false;

    try {
      const response = await fetch(`${this.baseUrl}/dashboard/${dashboardId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });

      const data = await response.json();
      return data.success === true;
    } catch (error) {
      console.error('❌ Delete dashboard error:', error);
      return false;
    }
  }

  // User profile management
  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    if (!this.token) return { success: false, error: 'Not authenticated' };

    try {
      const response = await fetch(`${this.baseUrl}/user/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await response.json();
      return data.success ? { success: true } : { success: false, error: data.error };
    } catch (error) {
      console.error('Change password error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async updateProfile(email: string): Promise<{ success: boolean; error?: string }> {
    if (!this.token) return { success: false, error: 'Not authenticated' };

    try {
      const response = await fetch(`${this.baseUrl}/user/update-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ email })
      });

      const data = await response.json();
      
      if (data.success && this.user) {
        this.user.email = email;
        this.saveToStorage();
        return { success: true };
      }
      
      return { success: false, error: data.error };
    } catch (error) {
      console.error('Update profile error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async getProfile(): Promise<User | null> {
    if (!this.token) return null;

    try {
      const response = await fetch(`${this.baseUrl}/user/profile`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      const data = await response.json();
      
      if (data.success && data.user) {
        this.user = {
          id: data.user.id,
          username: data.user.username,
          email: data.user.email,
          createdAt: data.user.created_at,
          isAdmin: data.user.is_admin
        };
        this.saveToStorage();
        return this.user;
      }
      
      return null;
    } catch (error) {
      console.error('Get profile error:', error);
      return null;
    }
  }

  // Admin functions
  isAdmin(): boolean {
    return this.user?.isAdmin === true;
  }

  async getUsers(): Promise<AdminUser[]> {
    if (!this.token) return [];

    try {
      const response = await fetch(`${this.baseUrl}/admin/users`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      const data = await response.json();
      return data.success ? data.users : [];
    } catch (error) {
      console.error('Get users error:', error);
      return [];
    }
  }

  async makeAdmin(userId: number): Promise<{ success: boolean; error?: string }> {
    if (!this.token) return { success: false, error: 'Not authenticated' };

    try {
      const response = await fetch(`${this.baseUrl}/admin/users/${userId}/make-admin`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      const data = await response.json();
      return data.success ? { success: true } : { success: false, error: data.error };
    } catch (error) {
      console.error('Make admin error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async removeAdmin(userId: number): Promise<{ success: boolean; error?: string }> {
    if (!this.token) return { success: false, error: 'Not authenticated' };

    try {
      const response = await fetch(`${this.baseUrl}/admin/users/${userId}/remove-admin`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      const data = await response.json();
      return data.success ? { success: true } : { success: false, error: data.error };
    } catch (error) {
      console.error('Remove admin error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async resetUserPassword(userId: number, newPassword: string): Promise<{ success: boolean; error?: string }> {
    if (!this.token) return { success: false, error: 'Not authenticated' };

    try {
      const response = await fetch(`${this.baseUrl}/admin/users/${userId}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ newPassword })
      });

      const data = await response.json();
      return data.success ? { success: true } : { success: false, error: data.error };
    } catch (error) {
      console.error('Reset password error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async deleteUser(userId: number): Promise<{ success: boolean; error?: string }> {
    if (!this.token) return { success: false, error: 'Not authenticated' };

    try {
      const response = await fetch(`${this.baseUrl}/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      const data = await response.json();
      return data.success ? { success: true } : { success: false, error: data.error };
    } catch (error) {
      console.error('Delete user error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async createUser(username: string, email: string, password: string, isAdmin: boolean = false): Promise<{ success: boolean; user?: AdminUser; error?: string }> {
    if (!this.token) return { success: false, error: 'Not authenticated' };

    try {
      const response = await fetch(`${this.baseUrl}/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ username, email, password, isAdmin })
      });

      const data = await response.json();
      
      if (data.success) {
        return { success: true, user: data.user };
      }
      
      return { success: false, error: data.error || 'Failed to create user' };
    } catch (error) {
      console.error('Create user error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async getAdminStats(): Promise<AdminStats | null> {
    if (!this.token) return null;

    try {
      const response = await fetch(`${this.baseUrl}/admin/stats`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      const data = await response.json();
      return data.success ? data.stats : null;
    } catch (error) {
      console.error('Get stats error:', error);
      return null;
    }
  }

  async toggleDashboardPublic(dashboardId: string, isPublic: boolean): Promise<{ success: boolean; isPublic?: boolean; error?: string }> {
    if (!this.token) return { success: false, error: 'Not authenticated' };

    try {
      const response = await fetch(`${this.baseUrl}/dashboard/toggle-public/${dashboardId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ isPublic })
      });

      const data = await response.json();
      return data.success ? { success: true, isPublic: data.isPublic } : { success: false, error: data.error };
    } catch (error) {
      console.error('Toggle public error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async getPublicDashboard(dashboardId: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/dashboard/public/${dashboardId}`);
      const data = await response.json();
      
      if (data.success) {
        return data.dashboard;
      }
      
      throw new Error(data.error || 'Failed to load public dashboard');
    } catch (error) {
      console.error('Get public dashboard error:', error);
      throw error;
    }
  }
}

export const authService = new AuthService();
