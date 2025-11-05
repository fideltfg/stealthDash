export interface User {
  id: number;
  username: string;
  email: string;
  createdAt: string;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
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

  async saveDashboard(dashboardData: any): Promise<boolean> {
    if (!this.token) return false;

    try {
      const response = await fetch(`${this.baseUrl}/dashboard/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ dashboardData })
      });

      const data = await response.json();
      return data.success === true;
    } catch (error) {
      console.error('Save dashboard error:', error);
      return false;
    }
  }

  async loadDashboard(): Promise<any | null> {
    if (!this.token) return null;

    try {
      const response = await fetch(`${this.baseUrl}/dashboard/load`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      const data = await response.json();
      return data.success ? data.dashboard : null;
    } catch (error) {
      console.error('Load dashboard error:', error);
      return null;
    }
  }
}

export const authService = new AuthService();
