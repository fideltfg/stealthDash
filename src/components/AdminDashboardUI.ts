import { authService, type AdminUser, type AdminStats } from '../services/auth';

export class AdminDashboardUI {
  async showAdminDashboard(): Promise<void> {
    if (!authService.isAdmin()) {
      alert('Admin access required');
      return;
    }

    const [users, stats] = await Promise.all([
      authService.getUsers(),
      authService.getAdminStats()
    ]);

    const dialog = document.createElement('div');
    dialog.id = 'admin-dashboard';
    dialog.className = 'dialog admin-dialog';

    dialog.innerHTML = `
      <div class="dialog-container admin-container">
        <div class="dialog-header">
          <h2 class="dialog-title">👑 Admin Dashboard</h2>
          <button id="close-admin" class="dialog-close-button">×</button>
        </div>

        <!-- Stats -->
        ${stats ? `
          <div class="admin-stats">
            <div class="admin-stat-card admin-stat-card-purple">
              <div class="admin-stat-label">Total Users</div>
              <div class="admin-stat-value">${stats.totalUsers}</div>
            </div>
            <div class="admin-stat-card admin-stat-card-pink">
              <div class="admin-stat-label">Active Dashboards</div>
              <div class="admin-stat-value">${stats.totalDashboards}</div>
            </div>
            <div class="admin-stat-card admin-stat-card-blue">
              <div class="admin-stat-label">Administrators</div>
              <div class="admin-stat-value">${stats.totalAdmins}</div>
            </div>
          </div>
        ` : ''}

        <!-- Users Table -->
        <div class="section admin-table-section">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3 class="section-title">User Management</h3>
            <button id="create-user-btn" class="action-btn action-btn-success" style="margin: 0;">
              ➕ Create User
            </button>
          </div>
          
          <div class="admin-table-wrapper">
            <table class="admin-table">
              <thead>
                <tr class="admin-table-header">
                  <th class="admin-table-th">ID</th>
                  <th class="admin-table-th">Username</th>
                  <th class="admin-table-th">Email</th>
                  <th class="admin-table-th">Role</th>
                  <th class="admin-table-th">Created</th>
                  <th class="admin-table-th">Actions</th>
                </tr>
              </thead>
              <tbody id="users-table-body">
                ${this.renderUsersTable(users)}
              </tbody>
            </table>
          </div>
        </div>

        <div id="admin-message" class="message"></div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Close button
    const closeBtn = dialog.querySelector('#close-admin') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => dialog.remove());

    // Create User button
    const createUserBtn = dialog.querySelector('#create-user-btn') as HTMLButtonElement;
    createUserBtn.addEventListener('click', () => this.showCreateUserDialog(dialog));

    // Click outside to close
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.remove();
    });

    // Setup action buttons
    this.setupActionButtons(dialog);
  }

  private renderUsersTable(users: AdminUser[]): string {
    const currentUser = authService.getUser();
    
    return users.map(user => `
      <tr class="admin-table-row">
        <td class="admin-table-td">${user.id}</td>
        <td class="admin-table-td">
          ${user.username}
          ${user.id === currentUser?.id ? '<span class="admin-current-user">(You)</span>' : ''}
        </td>
        <td class="admin-table-td">${user.email}</td>
        <td class="admin-table-td">
          ${user.is_admin ? '<span class="admin-role-badge">👑 Admin</span>' : 'User'}
        </td>
        <td class="admin-table-td admin-table-td-date">
          ${new Date(user.created_at).toLocaleDateString()}
        </td>
        <td class="admin-table-td">
          <div class="admin-actions">
            ${!user.is_admin ? `
              <button class="action-btn action-btn-success admin-action-btn make-admin-btn" data-user-id="${user.id}" data-username="${user.username}">Make Admin</button>
            ` : user.id !== currentUser?.id ? `
              <button class="action-btn action-btn-warning admin-action-btn remove-admin-btn" data-user-id="${user.id}" data-username="${user.username}">Remove Admin</button>
            ` : ''}
            
            <button class="action-btn action-btn-info admin-action-btn reset-password-btn" data-user-id="${user.id}" data-username="${user.username}">Reset Password</button>
            
            ${user.id !== currentUser?.id ? `
              <button class="action-btn action-btn-danger admin-action-btn delete-user-btn" data-user-id="${user.id}" data-username="${user.username}">Delete</button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  }

  private setupActionButtons(dialog: HTMLElement): void {
    // Make Admin
    dialog.querySelectorAll('.make-admin-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const userId = parseInt(target.dataset.userId || '0');
        const username = target.dataset.username;

        if (!confirm(`Make ${username} an administrator?`)) return;

        const result = await authService.makeAdmin(userId);
        if (result.success) {
          this.showMessage(dialog, `${username} is now an administrator`, true);
          setTimeout(() => this.refreshDashboard(dialog), 1000);
        } else {
          this.showMessage(dialog, result.error || 'Failed to make admin', false);
        }
      });
    });

    // Remove Admin
    dialog.querySelectorAll('.remove-admin-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const userId = parseInt(target.dataset.userId || '0');
        const username = target.dataset.username;

        if (!confirm(`Remove administrator privileges from ${username}?`)) return;

        const result = await authService.removeAdmin(userId);
        if (result.success) {
          this.showMessage(dialog, `${username} is no longer an administrator`, true);
          setTimeout(() => this.refreshDashboard(dialog), 1000);
        } else {
          this.showMessage(dialog, result.error || 'Failed to remove admin', false);
        }
      });
    });

    // Reset Password
    dialog.querySelectorAll('.reset-password-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const userId = parseInt(target.dataset.userId || '0');
        const username = target.dataset.username;

        const newPassword = prompt(`Enter new password for ${username}:`);
        if (!newPassword) return;

        if (newPassword.length < 6) {
          this.showMessage(dialog, 'Password must be at least 6 characters', false);
          return;
        }

        const result = await authService.resetUserPassword(userId, newPassword);
        if (result.success) {
          this.showMessage(dialog, `Password reset for ${username}. New password: ${newPassword}`, true);
        } else {
          this.showMessage(dialog, result.error || 'Failed to reset password', false);
        }
      });
    });

    // Delete User
    dialog.querySelectorAll('.delete-user-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const userId = parseInt(target.dataset.userId || '0');
        const username = target.dataset.username;

        if (!confirm(`Are you sure you want to delete user ${username}? This action cannot be undone and will delete their dashboard.`)) return;

        const result = await authService.deleteUser(userId);
        if (result.success) {
          this.showMessage(dialog, `User ${username} has been deleted`, true);
          setTimeout(() => this.refreshDashboard(dialog), 1000);
        } else {
          this.showMessage(dialog, result.error || 'Failed to delete user', false);
        }
      });
    });
  }

  private showCreateUserDialog(adminDialog: HTMLElement): void {
    const dialog = document.createElement('div');
    dialog.className = 'dialog';
    dialog.innerHTML = `
      <div class="dialog-container" style="max-width: 500px;">
        <div class="dialog-header">
          <h2 class="dialog-title">➕ Create New User</h2>
          <button id="close-create-user" class="dialog-close-button">×</button>
        </div>
        
        <div class="section">
          <form id="create-user-form">
            <div class="form-group">
              <label class="form-label">Username</label>
              <input 
                type="text" 
                id="new-username" 
                class="form-input" 
                placeholder="Enter username"
                required
              />
            </div>

            <div class="form-group">
              <label class="form-label">Email</label>
              <input 
                type="email" 
                id="new-email" 
                class="form-input" 
                placeholder="user@example.com"
                required
              />
            </div>

            <div class="form-group">
              <label class="form-label">Password</label>
              <input 
                type="password" 
                id="new-password" 
                class="form-input" 
                placeholder="At least 6 characters"
                minlength="6"
                required
              />
              <small class="form-hint">Minimum 6 characters</small>
            </div>

            <div class="form-group">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;">
                <input type="checkbox" id="new-is-admin" style="cursor: pointer;" />
                <span>Make this user an administrator</span>
              </label>
            </div>

            <div id="create-user-message" class="message"></div>

            <div style="display: flex; gap: 12px; margin-top: 24px;">
              <button type="button" id="cancel-create-user" class="btn btn-info" style="flex: 1;">
                Cancel
              </button>
              <button type="submit" class="btn btn-success" style="flex: 1;">
                Create User
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    const form = dialog.querySelector('#create-user-form') as HTMLFormElement;
    const usernameInput = dialog.querySelector('#new-username') as HTMLInputElement;
    const emailInput = dialog.querySelector('#new-email') as HTMLInputElement;
    const passwordInput = dialog.querySelector('#new-password') as HTMLInputElement;
    const isAdminCheckbox = dialog.querySelector('#new-is-admin') as HTMLInputElement;
    const messageDiv = dialog.querySelector('#create-user-message') as HTMLElement;
    const closeBtn = dialog.querySelector('#close-create-user') as HTMLButtonElement;
    const cancelBtn = dialog.querySelector('#cancel-create-user') as HTMLButtonElement;

    closeBtn.addEventListener('click', () => dialog.remove());
    cancelBtn.addEventListener('click', () => dialog.remove());
    
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.remove();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const username = usernameInput.value.trim();
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      const isAdmin = isAdminCheckbox.checked;

      if (!username || !email || !password) {
        messageDiv.textContent = 'All fields are required';
        messageDiv.className = 'message message-error';
        return;
      }

      const result = await authService.createUser(username, email, password, isAdmin);
      
      if (result.success) {
        messageDiv.textContent = `User ${username} created successfully!`;
        messageDiv.className = 'message message-success';
        
        setTimeout(() => {
          dialog.remove();
          this.refreshDashboard(adminDialog);
        }, 1500);
      } else {
        messageDiv.textContent = result.error || 'Failed to create user';
        messageDiv.className = 'message message-error';
      }
    });
  }

  private async refreshDashboard(dialog: HTMLElement): Promise<void> {
    const users = await authService.getUsers();
    const tbody = dialog.querySelector('#users-table-body') as HTMLElement;
    tbody.innerHTML = this.renderUsersTable(users);
    this.setupActionButtons(dialog);
  }

  private showMessage(dialog: HTMLElement, message: string, success: boolean): void {
    const messageDiv = dialog.querySelector('#admin-message') as HTMLElement;
    messageDiv.textContent = message;
    messageDiv.classList.remove('message-success', 'message-error');
    messageDiv.classList.add(success ? 'message-success' : 'message-error', 'visible');

    setTimeout(() => {
      messageDiv.classList.remove('visible');
    }, 5000);
  }
}
