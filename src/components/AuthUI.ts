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
    dialog.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100000;
    `;

    dialog.innerHTML = `
      <div style="
        background: #1e1e1e;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 12px;
        padding: 40px;
        min-width: 400px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      ">
        <h2 style="margin: 0 0 30px 0; text-align: center; font-size: 28px;">
          🔐 Dashboard Login
        </h2>
        
        <div id="auth-tabs" style="display: flex; gap: 10px; margin-bottom: 30px;">
          <button id="login-tab" class="auth-tab active" style="
            flex: 1;
            padding: 12px;
            background: #4CAF50;
            border: none;
            border-radius: 6px;
            color: white;
            cursor: pointer;
            font-size: 16px;
            font-weight: bold;
          ">Login</button>
          <button id="register-tab" class="auth-tab" style="
            flex: 1;
            padding: 12px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 6px;
            color: white;
            cursor: pointer;
            font-size: 16px;
          ">Register</button>
        </div>

        <!-- Login Form -->
        <div id="login-form" class="auth-form">
          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-size: 14px;">Username</label>
            <input type="text" id="login-username" style="
              width: 100%;
              padding: 12px;
              box-sizing: border-box;
              background: rgba(255, 255, 255, 0.05);
              border: 1px solid rgba(255, 255, 255, 0.2);
              border-radius: 6px;
              color: white;
              font-size: 16px;
            ">
          </div>
          <div style="margin-bottom: 25px;">
            <label style="display: block; margin-bottom: 8px; font-size: 14px;">Password</label>
            <input type="password" id="login-password" style="
              width: 100%;
              padding: 12px;
              box-sizing: border-box;
              background: rgba(255, 255, 255, 0.05);
              border: 1px solid rgba(255, 255, 255, 0.2);
              border-radius: 6px;
              color: white;
              font-size: 16px;
            ">
          </div>
          <div style="margin-bottom: 20px; text-align: right;">
            <a href="#" id="forgot-password-link" style="
              color: #2196F3;
              text-decoration: none;
              font-size: 13px;
              cursor: pointer;
            ">Forgot Password?</a>
          </div>
          <button id="login-btn" style="
            width: 100%;
            padding: 14px;
            background: #4CAF50;
            border: none;
            border-radius: 6px;
            color: white;
            cursor: pointer;
            font-size: 16px;
            font-weight: bold;
          ">Login</button>
        </div>

        <!-- Register Form -->
        <div id="register-form" class="auth-form" style="display: none;">
          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-size: 14px;">Username</label>
            <input type="text" id="register-username" style="
              width: 100%;
              padding: 12px;
              box-sizing: border-box;
              background: rgba(255, 255, 255, 0.05);
              border: 1px solid rgba(255, 255, 255, 0.2);
              border-radius: 6px;
              color: white;
              font-size: 16px;
            ">
          </div>
          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-size: 14px;">Email</label>
            <input type="email" id="register-email" style="
              width: 100%;
              padding: 12px;
              box-sizing: border-box;
              background: rgba(255, 255, 255, 0.05);
              border: 1px solid rgba(255, 255, 255, 0.2);
              border-radius: 6px;
              color: white;
              font-size: 16px;
            ">
          </div>
          <div style="margin-bottom: 25px;">
            <label style="display: block; margin-bottom: 8px; font-size: 14px;">Password</label>
            <input type="password" id="register-password" style="
              width: 100%;
              padding: 12px;
              box-sizing: border-box;
              background: rgba(255, 255, 255, 0.05);
              border: 1px solid rgba(255, 255, 255, 0.2);
              border-radius: 6px;
              color: white;
              font-size: 16px;
            ">
            <small style="opacity: 0.7; font-size: 12px;">Minimum 6 characters</small>
          </div>
          <button id="register-btn" style="
            width: 100%;
            padding: 14px;
            background: #4CAF50;
            border: none;
            border-radius: 6px;
            color: white;
            cursor: pointer;
            font-size: 16px;
            font-weight: bold;
          ">Create Account</button>
        </div>

        <div id="auth-error" style="
          margin-top: 20px;
          padding: 12px;
          background: rgba(244, 67, 54, 0.2);
          border: 1px solid #f44336;
          border-radius: 6px;
          color: #f44336;
          display: none;
        "></div>

        <div style="margin-top: 30px; text-align: center; font-size: 12px; opacity: 0.6;">
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
      loginTab.style.background = '#4CAF50';
      loginTab.style.border = 'none';
      registerTab.style.background = 'rgba(255, 255, 255, 0.1)';
      registerTab.style.border = '1px solid rgba(255, 255, 255, 0.2)';
      loginForm.style.display = 'block';
      registerForm.style.display = 'none';
      this.hideError();
    });

    registerTab.addEventListener('click', () => {
      registerTab.style.background = '#4CAF50';
      registerTab.style.border = 'none';
      loginTab.style.background = 'rgba(255, 255, 255, 0.1)';
      loginTab.style.border = '1px solid rgba(255, 255, 255, 0.2)';
      registerForm.style.display = 'block';
      loginForm.style.display = 'none';
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
      errorDiv.style.display = 'block';
    }
  }

  private hideError(): void {
    const errorDiv = document.querySelector('#auth-error') as HTMLElement;
    if (errorDiv) {
      errorDiv.style.display = 'none';
    }
  }

  createUserMenu(user: User, onSettingsClick?: () => void, onAdminClick?: () => void): HTMLElement {
    const container = document.createElement('div');
    container.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 24px;
      z-index: 10000;
    `;

    container.innerHTML = `
      <div id="user-menu-toggle" style="
        width: 48px;
        height: 48px;
        background: var(--accent);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 20px;
        cursor: pointer;
        box-shadow: 0 2px 8px var(--shadow);
        border: 2px solid var(--border);
        transition: transform 0.2s;
        color: white;
      " title="${user.username}">
        ${user.username.charAt(0).toUpperCase()}
      </div>
      <div id="user-dropdown" style="
        position: absolute;
        bottom: 60px;
        left: 0;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 8px;
        min-width: 200px;
        backdrop-filter: blur(10px);
        box-shadow: 0 4px 16px var(--shadow);
        display: none;
        overflow: hidden;
      ">
        <div style="
          padding: 12px 16px;
          border-bottom: 1px solid var(--border);
          font-size: 14px;
          color: var(--text);
          opacity: 0.7;
        ">
          <div style="font-weight: bold; opacity: 1;">${user.username}</div>
          ${user.isAdmin ? '<div style="color: #FFC107; font-size: 12px; margin-top: 4px;">👑 Administrator</div>' : ''}
        </div>
        <div style="padding: 8px 0;">
          <button id="settings-btn" style="
            width: 100%;
            padding: 12px 16px;
            background: none;
            border: none;
            color: #2196F3;
            cursor: pointer;
            font-size: 14px;
            text-align: left;
            display: flex;
            align-items: center;
            gap: 10px;
            transition: background 0.2s;
          ">
            <span>⚙️</span>
            <span>Settings</span>
          </button>
          ${user.isAdmin ? `
            <button id="admin-btn" style="
              width: 100%;
              padding: 12px 16px;
              background: none;
              border: none;
              color: #FFC107;
              cursor: pointer;
              font-size: 14px;
              text-align: left;
              display: flex;
              align-items: center;
              gap: 10px;
              transition: background 0.2s;
            ">
              <span>👑</span>
              <span>Admin</span>
            </button>
          ` : ''}
          <div style="height: 1px; background: var(--border); margin: 4px 0;"></div>
          <button id="logout-btn" style="
            width: 100%;
            padding: 12px 16px;
            background: none;
            border: none;
            color: #f44336;
            cursor: pointer;
            font-size: 14px;
            text-align: left;
            display: flex;
            align-items: center;
            gap: 10px;
            transition: background 0.2s;
          ">
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
      const isVisible = dropdown.style.display === 'block';
      dropdown.style.display = isVisible ? 'none' : 'block';
      toggle.style.transform = isVisible ? 'scale(1)' : 'scale(1.1)';
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!container.contains(e.target as Node)) {
        dropdown.style.display = 'none';
        toggle.style.transform = 'scale(1)';
      }
    });

    // Hover effects for buttons
    const buttons = dropdown.querySelectorAll('button');
    buttons.forEach(btn => {
      btn.addEventListener('mouseenter', () => {
        (btn as HTMLElement).style.background = 'var(--surface-hover)';
      });
      btn.addEventListener('mouseleave', () => {
        (btn as HTMLElement).style.background = 'none';
      });
    });

    // Settings button
    const settingsBtn = dropdown.querySelector('#settings-btn') as HTMLButtonElement;
    if (settingsBtn && onSettingsClick) {
      settingsBtn.addEventListener('click', () => {
        dropdown.style.display = 'none';
        toggle.style.transform = 'scale(1)';
        onSettingsClick();
      });
    }

    // Admin button (if user is admin)
    const adminBtn = dropdown.querySelector('#admin-btn') as HTMLButtonElement;
    if (adminBtn && onAdminClick) {
      adminBtn.addEventListener('click', () => {
        dropdown.style.display = 'none';
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
