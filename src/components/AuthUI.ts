import { authService, type User } from '../services/auth';
import { PasswordRecoveryUI } from './PasswordRecoveryUI';

export class AuthUI {
  private onAuthChange: (user: User | null) => void;
  private recoveryUI: PasswordRecoveryUI;

  constructor(onAuthChange: (user: User | null) => void) {
    this.onAuthChange = onAuthChange;
    this.recoveryUI = new PasswordRecoveryUI();
  }

  showLoginDialog(): void {
    const dialog = document.createElement('div');
    dialog.id = 'auth-dialog';
    dialog.className = 'dialog';

    dialog.innerHTML = `
      <div class="dialog-container auth-container">
        <h2 class="dialog-title auth-title">
          🔐 Dashboard Login
        </h2>
        
        <div class="auth-tabs">
          <button id="login-tab" class="auth-tab active">Login</button>
          <button id="register-tab" class="auth-tab">Register</button>
        </div>

        <!-- Login Form -->
        <div id="login-form" class="auth-form">
          <div class="form-group">
            <label class="form-label">Username</label>
            <input type="text" id="login-username" class="form-input">
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input type="password" id="login-password" class="form-input">
          </div>
          <div class="form-group auth-form-group-right">
            <a href="#" id="forgot-password-link" class="auth-link">Forgot Password?</a>
          </div>
          <button id="login-btn" class="btn btn-primary btn-full">Login</button>
        </div>

        <!-- Register Form -->
        <div id="register-form" class="auth-form hidden">
          <div class="form-group">
            <label class="form-label">Username</label>
            <input type="text" id="register-username" class="form-input">
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" id="register-email" class="form-input">
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input type="password" id="register-password" class="form-input">
            <small class="form-hint">Minimum 6 characters</small>
          </div>
          <button id="register-btn" class="btn btn-primary btn-full">Create Account</button>
        </div>

        <div id="auth-error" class="message message-error auth-error"></div>

        <div class="auth-footer-note">
          Your dashboard data will be saved to your account
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Forgot password link
    const forgotPasswordLink = dialog.querySelector('#forgot-password-link') as HTMLAnchorElement;
    forgotPasswordLink.addEventListener('click', (e) => {
      e.preventDefault();
      dialog.remove();
      this.recoveryUI.showRequestRecoveryDialog();
    });

    // Tab switching
    const loginTab = dialog.querySelector('#login-tab') as HTMLButtonElement;
    const registerTab = dialog.querySelector('#register-tab') as HTMLButtonElement;
    const loginForm = dialog.querySelector('#login-form') as HTMLElement;
    const registerForm = dialog.querySelector('#register-form') as HTMLElement;

    loginTab.addEventListener('click', () => {
      loginTab.classList.add('active');
      registerTab.classList.remove('active');
      loginForm.classList.remove('hidden');
      registerForm.classList.add('hidden');
      this.hideError();
    });

    registerTab.addEventListener('click', () => {
      registerTab.classList.add('active');
      loginTab.classList.remove('active');
      registerForm.classList.remove('hidden');
      loginForm.classList.add('hidden');
      this.hideError();
    });

    // Login handler
    const loginBtn = dialog.querySelector('#login-btn') as HTMLButtonElement;
    const loginUsername = dialog.querySelector('#login-username') as HTMLInputElement;
    const loginPassword = dialog.querySelector('#login-password') as HTMLInputElement;

    loginBtn.addEventListener('click', async () => {
      const username = loginUsername.value.trim();
      const password = loginPassword.value;

      if (!username || !password) {
        this.showError('Please enter username and password');
        return;
      }

      loginBtn.disabled = true;
      loginBtn.textContent = 'Logging in...';

      const result = await authService.login(username, password);

      if (result.success && result.user) {
        dialog.remove();
        this.onAuthChange(result.user);
      } else {
        this.showError(result.error || 'Login failed');
        loginBtn.disabled = false;
        loginBtn.textContent = 'Login';
      }
    });

    // Register handler
    const registerBtn = dialog.querySelector('#register-btn') as HTMLButtonElement;
    const registerUsername = dialog.querySelector('#register-username') as HTMLInputElement;
    const registerEmail = dialog.querySelector('#register-email') as HTMLInputElement;
    const registerPassword = dialog.querySelector('#register-password') as HTMLInputElement;

    registerBtn.addEventListener('click', async () => {
      const username = registerUsername.value.trim();
      const email = registerEmail.value.trim();
      const password = registerPassword.value;

      if (!username || !email || !password) {
        this.showError('Please fill in all fields');
        return;
      }

      if (password.length < 6) {
        this.showError('Password must be at least 6 characters');
        return;
      }

      registerBtn.disabled = true;
      registerBtn.textContent = 'Creating account...';

      const result = await authService.register(username, email, password);

      if (result.success && result.user) {
        dialog.remove();
        this.onAuthChange(result.user);
      } else {
        this.showError(result.error || 'Registration failed');
        registerBtn.disabled = false;
        registerBtn.textContent = 'Create Account';
      }
    });

    // Enter key handlers
    [loginUsername, loginPassword].forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loginBtn.click();
      });
    });

    [registerUsername, registerEmail, registerPassword].forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') registerBtn.click();
      });
    });
  }

  private showError(message: string): void {
    const errorDiv = document.querySelector('#auth-error') as HTMLElement;
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.classList.add('visible');
    }
  }

  private hideError(): void {
    const errorDiv = document.querySelector('#auth-error') as HTMLElement;
    if (errorDiv) {
      errorDiv.classList.remove('visible');
    }
  }

  createUserMenu(user: User, onSettingsClick?: () => void, onAdminClick?: () => void, onManageDashboardsClick?: () => void, onCredentialsClick?: () => void): HTMLElement {
    const container = document.createElement('div');
    container.className = 'user-menu';

    container.innerHTML = `
      <div id="user-menu-toggle" class="user-avatar-button" title="${user.username}">
        ${user.username.charAt(0).toUpperCase()}
      </div>
      <div id="user-dropdown" class="user-dropdown">
        <div class="user-dropdown-header">
          <div class="user-dropdown-username">${user.username}</div>
          ${user.isAdmin ? '<div class="user-dropdown-admin-badge">👑 Administrator</div>' : ''}
        </div>
        <div class="user-dropdown-body">
          <button id="manage-dashboards-btn" class="user-dropdown-button">
            <span>🎛️</span>
            <span>My Dashboards</span>
          </button>
          <button id="credentials-btn" class="user-dropdown-button">
            <span>🔐</span>
            <span>Credentials</span>
          </button>
          <button id="settings-btn" class="user-dropdown-button user-dropdown-button-primary">
            <span>⚙️</span>
            <span>Settings</span>
          </button>
          ${user.isAdmin ? `
            <button id="admin-btn" class="user-dropdown-button user-dropdown-button-warning">
              <span>👑</span>
              <span>Admin</span>
            </button>
          ` : ''}
          <div class="user-dropdown-separator"></div>
          <button id="logout-btn" class="user-dropdown-button user-dropdown-button-danger">
            <span>🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </div>
    `;

    const toggle = container.querySelector('#user-menu-toggle') as HTMLElement;
    const dropdown = container.querySelector('#user-dropdown') as HTMLElement;

    // Toggle dropdown
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      
      // Don't open menu if dashboard is locked
      const app = document.getElementById('app');
      if (app?.classList.contains('locked')) {
        return;
      }
      
      const isVisible = dropdown.classList.contains('visible');
      dropdown.classList.toggle('visible');
      toggle.style.transform = isVisible ? 'scale(1)' : 'scale(1.1)';
      
      // Close the controls menu when user menu is opened
      if (!isVisible) {
        const controlsContainer = document.getElementById('controls-container');
        if (controlsContainer) {
          controlsContainer.classList.remove('open');
        }
      }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!container.contains(e.target as Node)) {
        dropdown.classList.remove('visible');
        toggle.style.transform = 'scale(1)';
      }
    });

    // Manage Dashboards button
    const manageDashboardsBtn = dropdown.querySelector('#manage-dashboards-btn') as HTMLButtonElement;
    if (manageDashboardsBtn && onManageDashboardsClick) {
      manageDashboardsBtn.addEventListener('click', () => {
        dropdown.classList.remove('visible');
        toggle.style.transform = 'scale(1)';
        onManageDashboardsClick();
      });
    }

    // Credentials button
    const credentialsBtn = dropdown.querySelector('#credentials-btn') as HTMLButtonElement;
    if (credentialsBtn && onCredentialsClick) {
      credentialsBtn.addEventListener('click', () => {
        dropdown.classList.remove('visible');
        toggle.style.transform = 'scale(1)';
        onCredentialsClick();
      });
    }

    // Settings button
    const settingsBtn = dropdown.querySelector('#settings-btn') as HTMLButtonElement;
    if (settingsBtn && onSettingsClick) {
      settingsBtn.addEventListener('click', () => {
        dropdown.classList.remove('visible');
        toggle.style.transform = 'scale(1)';
        onSettingsClick();
      });
    }

    // Admin button (if user is admin)
    const adminBtn = dropdown.querySelector('#admin-btn') as HTMLButtonElement;
    if (adminBtn && onAdminClick) {
      adminBtn.addEventListener('click', () => {
        dropdown.classList.remove('visible');
        toggle.style.transform = 'scale(1)';
        onAdminClick();
      });
    }

    // Logout button
    const logoutBtn = dropdown.querySelector('#logout-btn') as HTMLButtonElement;
    logoutBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to logout?')) {
        authService.logout();
      }
    });

    return container;
  }
}
