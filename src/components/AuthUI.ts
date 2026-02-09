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
    dialog.className = 'auth-container';

    dialog.innerHTML = `
      <div class="auth-box">
        <h2 class="auth-title text-center mb-4">
          🔐 Dashboard Login
        </h2>
        
        <ul class="nav nav-tabs mb-4" role="tablist">
          <li class="nav-item flex-fill" role="presentation">
            <button id="login-tab" class="nav-link active w-100" type="button">Login</button>
          </li>
          <li class="nav-item flex-fill" role="presentation">
            <button id="register-tab" class="nav-link w-100" type="button">Register</button>
          </li>
        </ul>

        <!-- Login Form -->
        <div id="login-form">
          <div class="mb-3">
            <label class="form-label">Username</label>
            <input type="text" id="login-username" class="form-control" autocomplete="username">
          </div>
          <div class="mb-3">
            <label class="form-label">Password</label>
            <input type="password" id="login-password" class="form-control" autocomplete="current-password">
          </div>
          <div class="mb-3 text-end">
            <a href="#" id="forgot-password-link" class="text-decoration-none">Forgot Password?</a>
          </div>
          <button id="login-btn" class="btn btn-primary w-100">Login</button>
        </div>

        <!-- Register Form -->
        <div id="register-form" class="d-none">
          <div class="mb-3">
            <label class="form-label">Username</label>
            <input type="text" id="register-username" class="form-control" autocomplete="username">
          </div>
          <div class="mb-3">
            <label class="form-label">Email</label>
            <input type="email" id="register-email" class="form-control" autocomplete="email">
          </div>
          <div class="mb-3">
            <label class="form-label">Password</label>
            <input type="password" id="register-password" class="form-control" autocomplete="new-password">
            <div class="form-text">Minimum 6 characters</div>
          </div>
          <button id="register-btn" class="btn btn-primary w-100">Create Account</button>
        </div>

        <div id="auth-error" class="auth-error mt-3"></div>

        <div class="text-center text-muted mt-4" style="font-size: 0.875rem;">
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
      loginForm.classList.remove('d-none');
      registerForm.classList.add('d-none');
      this.hideError();
    });

    registerTab.addEventListener('click', () => {
      registerTab.classList.add('active');
      loginTab.classList.remove('active');
      registerForm.classList.remove('d-none');
      loginForm.classList.add('d-none');
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
      errorDiv.innerHTML = `
        <div class="alert alert-danger d-flex align-items-center" role="alert">
          <i class="fas fa-exclamation-circle me-2"></i>
          <div>${message}</div>
        </div>
      `;
    }
  }

  private hideError(): void {
    const errorDiv = document.querySelector('#auth-error') as HTMLElement;
    if (errorDiv) {
      errorDiv.innerHTML = '';
    }
  }

  createUserMenu(user: User, onSettingsClick?: () => void, onAdminClick?: () => void, onManageDashboardsClick?: () => void, onCredentialsClick?: () => void, onHelpClick?: () => void): HTMLElement {
    const container = document.createElement('div');
    container.className = 'user-menu';

    container.innerHTML = `
      <button id="user-menu-toggle" class="user-menu-button d-flex align-items-center gap-2" title="${user.username}">
        <div class="user-avatar">
          ${user.username.charAt(0).toUpperCase()}
        </div>
        <span class="d-none d-sm-inline">${user.username}</span>
      </button>
      <div id="user-dropdown" class="user-menu-dropdown">
        <div class="px-3 py-2 border-bottom">
          <div class="fw-semibold">${user.username}</div>
          ${user.isAdmin ? '<div class="badge bg-warning text-dark mt-1"><i class="fas fa-crown me-1"></i>Administrator</div>' : ''}
        </div>
        <div class="py-1">
          <button id="manage-dashboards-btn" class="user-menu-item">
            <i class="fas fa-th-large user-menu-icon"></i>
            <span class="user-menu-label">My Dashboards</span>
          </button>
          <button id="credentials-btn" class="user-menu-item">
            <i class="fas fa-key user-menu-icon"></i>
            <span class="user-menu-label">Credentials</span>
          </button>
          <button id="help-btn" class="user-menu-item">
            <i class="fas fa-question-circle user-menu-icon"></i>
            <span class="user-menu-label">Help</span>
          </button>
          <button id="settings-btn" class="user-menu-item">
            <i class="fas fa-cog user-menu-icon"></i>
            <span class="user-menu-label">Settings</span>
          </button>
          ${user.isAdmin ? `
            <button id="admin-btn" class="user-menu-item">
              <i class="fas fa-crown user-menu-icon"></i>
              <span class="user-menu-label">Admin</span>
            </button>
          ` : ''}
          <div class="user-menu-separator"></div>
          <button id="logout-btn" class="user-menu-item text-danger">
            <i class="fas fa-sign-out-alt user-menu-icon"></i>
            <span class="user-menu-label">Logout</span>
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

    // Help button
    const helpBtn = dropdown.querySelector('#help-btn') as HTMLButtonElement;
    if (helpBtn && onHelpClick) {
      helpBtn.addEventListener('click', () => {
        dropdown.classList.remove('visible');
        toggle.style.transform = 'scale(1)';
        onHelpClick();
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
