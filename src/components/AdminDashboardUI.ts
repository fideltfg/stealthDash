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
        <div class="dialog-header admin-header">
          <h2 class="dialog-title admin-title">👑 Admin Dashboard</h2>
          <button id="close-admin" class="dialog-close-button admin-close-button">×</button>
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
          <h3 class="section-title admin-section-title">User Management</h3>
          
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

        <div id="admin-message" class="message admin-message"></div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Close button
    const closeBtn = dialog.querySelector('#close-admin') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => dialog.remove());

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
              <button class="action-btn action-btn-success admin-action-btn make-admin-btn admin-action-btn-success" data-user-id="${user.id}" data-username="${user.username}">Make Admin</button>
            ` : user.id !== currentUser?.id ? `
              <button class="action-btn action-btn-warning admin-action-btn remove-admin-btn admin-action-btn-warning" data-user-id="${user.id}" data-username="${user.username}">Remove Admin</button>
            ` : ''}
            
            <button class="action-btn action-btn-info admin-action-btn reset-password-btn admin-action-btn-info" data-user-id="${user.id}" data-username="${user.username}">Reset Password</button>
            
            ${user.id !== currentUser?.id ? `
              <button class="action-btn action-btn-danger admin-action-btn delete-user-btn admin-action-btn-danger" data-user-id="${user.id}" data-username="${user.username}">Delete</button>
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

  private async refreshDashboard(dialog: HTMLElement): Promise<void> {
    const users = await authService.getUsers();
    const tbody = dialog.querySelector('#users-table-body') as HTMLElement;
    tbody.innerHTML = this.renderUsersTable(users);
    this.setupActionButtons(dialog);
  }

  private showMessage(dialog: HTMLElement, message: string, success: boolean): void {
    const messageDiv = dialog.querySelector('#admin-message') as HTMLElement;
    messageDiv.textContent = message;
    messageDiv.classList.remove('message-success', 'message-error', 'admin-message-success', 'admin-message-error');
    messageDiv.classList.add(success ? 'message-success admin-message-success' : 'message-error admin-message-error', 'visible');

    setTimeout(() => {
      messageDiv.classList.remove('visible');
    }, 5000);
  }
}
