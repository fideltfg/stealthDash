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
      padding: 20px;
    `;

    dialog.innerHTML = `
      <div style="
        background: #1e1e1e;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 12px;
        padding: 40px;
        width: 90%;
        max-width: 1200px;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
          <h2 style="margin: 0; font-size: 32px;">👑 Admin Dashboard</h2>
          <button id="close-admin" style="
            background: transparent;
            border: none;
            color: white;
            font-size: 32px;
            cursor: pointer;
            padding: 5px 10px;
          ">×</button>
        </div>

        <!-- Stats -->
        ${stats ? `
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px;">
            <div style="padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px;">
              <div style="font-size: 14px; opacity: 0.9; margin-bottom: 10px;">Total Users</div>
              <div style="font-size: 36px; font-weight: bold;">${stats.totalUsers}</div>
            </div>
            <div style="padding: 20px; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); border-radius: 8px;">
              <div style="font-size: 14px; opacity: 0.9; margin-bottom: 10px;">Active Dashboards</div>
              <div style="font-size: 36px; font-weight: bold;">${stats.totalDashboards}</div>
            </div>
            <div style="padding: 20px; background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); border-radius: 8px;">
              <div style="font-size: 14px; opacity: 0.9; margin-bottom: 10px;">Administrators</div>
              <div style="font-size: 36px; font-weight: bold;">${stats.totalAdmins}</div>
            </div>
          </div>
        ` : ''}

        <!-- Users Table -->
        <div style="background: rgba(255, 255, 255, 0.05); border-radius: 8px; padding: 20px;">
          <h3 style="margin: 0 0 20px 0; font-size: 20px;">User Management</h3>
          
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background: rgba(255, 255, 255, 0.1); text-align: left;">
                  <th style="padding: 12px; font-weight: bold;">ID</th>
                  <th style="padding: 12px; font-weight: bold;">Username</th>
                  <th style="padding: 12px; font-weight: bold;">Email</th>
                  <th style="padding: 12px; font-weight: bold;">Role</th>
                  <th style="padding: 12px; font-weight: bold;">Created</th>
                  <th style="padding: 12px; font-weight: bold;">Actions</th>
                </tr>
              </thead>
              <tbody id="users-table-body">
                ${this.renderUsersTable(users)}
              </tbody>
            </table>
          </div>
        </div>

        <div id="admin-message" style="
          margin-top: 20px;
          padding: 12px;
          border-radius: 6px;
          display: none;
        "></div>
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
      <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
        <td style="padding: 12px;">${user.id}</td>
        <td style="padding: 12px;">
          ${user.username}
          ${user.id === currentUser?.id ? '<span style="color: #4CAF50; font-size: 12px;">(You)</span>' : ''}
        </td>
        <td style="padding: 12px;">${user.email}</td>
        <td style="padding: 12px;">
          ${user.is_admin ? '<span style="color: #FFC107;">👑 Admin</span>' : 'User'}
        </td>
        <td style="padding: 12px; font-size: 12px; opacity: 0.7;">
          ${new Date(user.created_at).toLocaleDateString()}
        </td>
        <td style="padding: 12px;">
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${!user.is_admin ? `
              <button class="admin-action-btn make-admin-btn" data-user-id="${user.id}" data-username="${user.username}" style="
                padding: 6px 12px;
                background: rgba(76, 175, 80, 0.2);
                border: 1px solid #4CAF50;
                border-radius: 4px;
                color: #4CAF50;
                cursor: pointer;
                font-size: 12px;
              ">Make Admin</button>
            ` : user.id !== currentUser?.id ? `
              <button class="admin-action-btn remove-admin-btn" data-user-id="${user.id}" data-username="${user.username}" style="
                padding: 6px 12px;
                background: rgba(255, 152, 0, 0.2);
                border: 1px solid #FF9800;
                border-radius: 4px;
                color: #FF9800;
                cursor: pointer;
                font-size: 12px;
              ">Remove Admin</button>
            ` : ''}
            
            <button class="admin-action-btn reset-password-btn" data-user-id="${user.id}" data-username="${user.username}" style="
              padding: 6px 12px;
              background: rgba(33, 150, 243, 0.2);
              border: 1px solid #2196F3;
              border-radius: 4px;
              color: #2196F3;
              cursor: pointer;
              font-size: 12px;
            ">Reset Password</button>
            
            ${user.id !== currentUser?.id ? `
              <button class="admin-action-btn delete-user-btn" data-user-id="${user.id}" data-username="${user.username}" style="
                padding: 6px 12px;
                background: rgba(244, 67, 54, 0.2);
                border: 1px solid #f44336;
                border-radius: 4px;
                color: #f44336;
                cursor: pointer;
                font-size: 12px;
              ">Delete</button>
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
    messageDiv.style.display = 'block';
    messageDiv.style.background = success ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)';
    messageDiv.style.border = `1px solid ${success ? '#4CAF50' : '#f44336'}`;
    messageDiv.style.color = success ? '#4CAF50' : '#f44336';

    setTimeout(() => {
      messageDiv.style.display = 'none';
    }, 5000);
  }
}
