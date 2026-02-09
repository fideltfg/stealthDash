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
    dialog.className = 'modal fade show d-block';
    dialog.style.backgroundColor = 'rgba(0,0,0,0.8)';

    dialog.innerHTML = `
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">👑 Admin Dashboard</h2>
            <button id="close-admin" class="btn-close" aria-label="Close"></button>
          </div>

        <!-- Stats -->
        ${stats ? `
          <div class="modal-body border-bottom">
            <div class="row g-3">
              <div class="col-md-4">
                <div class="card border-start border-primary border-4">
                  <div class="card-body text-center">
                    <div class="text-uppercase text-muted small fw-semibold mb-2">Total Users</div>
                    <div class="display-4 fw-bold">${stats.totalUsers}</div>
                  </div>
                </div>
              </div>
              <div class="col-md-4">
                <div class="card border-start border-success border-4">
                  <div class="card-body text-center">
                    <div class="text-uppercase text-muted small fw-semibold mb-2">Active Dashboards</div>
                    <div class="display-4 fw-bold">${stats.totalDashboards}</div>
                  </div>
                </div>
              </div>
              <div class="col-md-4">
                <div class="card border-start border-warning border-4">
                  <div class="card-body text-center">
                    <div class="text-uppercase text-muted small fw-semibold mb-2">Administrators</div>
                    <div class="display-4 fw-bold">${stats.totalAdmins}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- Users Table -->
        <div class="modal-body">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h3 class="h5 mb-0">User Management</h3>
            <button id="create-user-btn" class="btn btn-success">
              ➕ Create User
            </button>
          </div>
          
          <div class="table-responsive">
            <table class="table table-hover table-striped align-middle">
              <thead class="table-light">
                <tr>
                  <th>ID</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="users-table-body">
                ${this.renderUsersTable(users)}
              </tbody>
            </table>
          </div>

          <div id="admin-message" class="alert d-none" role="alert"></div>
        </div>
      </div>
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
      <tr>
        <td>${user.id}</td>
        <td>
          ${user.username}
          ${user.id === currentUser?.id ? '<span class="text-muted small ms-2">(You)</span>' : ''}
        </td>
        <td>${user.email}</td>
        <td>
          ${user.is_admin ? '<span class="badge bg-warning text-dark">👑 Admin</span>' : '<span class="badge bg-secondary">User</span>'}
        </td>
        <td class="text-muted small">
          ${new Date(user.created_at).toLocaleDateString()}
        </td>
        <td>
          <div class="d-flex gap-2 flex-wrap">
            ${!user.is_admin ? `
              <button class="btn btn-sm btn-success make-admin-btn" data-user-id="${user.id}" data-username="${user.username}">Make Admin</button>
            ` : user.id !== currentUser?.id ? `
              <button class="btn btn-sm btn-warning remove-admin-btn" data-user-id="${user.id}" data-username="${user.username}">Remove Admin</button>
            ` : ''}
            
            <button class="btn btn-sm btn-info reset-password-btn" data-user-id="${user.id}" data-username="${user.username}">Reset Password</button>
            
            ${user.id !== currentUser?.id ? `
              <button class="btn btn-sm btn-danger delete-user-btn" data-user-id="${user.id}" data-username="${user.username}">Delete</button>
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
    dialog.className = 'modal fade show d-block';
    dialog.style.backgroundColor = 'rgba(0,0,0,0.8)';
    dialog.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">➕ Create New User</h2>
            <button id="close-create-user" class="btn-close" aria-label="Close"></button>
          </div>
          
          <form id="create-user-form" class="modal-body">
            <div class="mb-3">
              <label class="form-label">Username</label>
              <input 
                type="text" 
                id="new-username" 
                class="form-control" 
                placeholder="Enter username"
                required
              />
            </div>

            <div class="mb-3">
              <label class="form-label">Email</label>
              <input 
                type="email" 
                id="new-email" 
                class="form-control" 
                placeholder="user@example.com"
                required
              />
            </div>

            <div class="mb-3">
              <label class="form-label">Password</label>
              <input 
                type="password" 
                id="new-password" 
                class="form-control" 
                placeholder="At least 6 characters"
                minlength="6"
                required
              />
              <div class="form-text">Minimum 6 characters</div>
            </div>

            <div class="mb-3 form-check">
              <input type="checkbox" id="new-is-admin" class="form-check-input" />
              <label class="form-check-label" for="new-is-admin">
                Make this user an administrator
              </label>
            </div>

            <div id="create-user-message" class="alert d-none" role="alert"></div>
          </form>

          <div class="modal-footer">
            <button type="button" id="cancel-create-user" class="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" form="create-user-form" class="btn btn-success">
              Create User
            </button>
          </div>
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
        messageDiv.className = 'alert alert-danger';
        return;
      }

      const result = await authService.createUser(username, email, password, isAdmin);
      
      if (result.success) {
        messageDiv.textContent = `User ${username} created successfully!`;
        messageDiv.className = 'alert alert-success';
        
        setTimeout(() => {
          dialog.remove();
          this.refreshDashboard(adminDialog);
        }, 1500);
      } else {
        messageDiv.textContent = result.error || 'Failed to create user';
        messageDiv.className = 'alert alert-danger';
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
    messageDiv.className = success ? 'alert alert-success' : 'alert alert-danger';

    setTimeout(() => {
      messageDiv.className = 'alert d-none';
    }, 5000);
  }
}
