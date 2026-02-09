import { authService } from '../services/auth';

export class UserSettingsUI {
  showSettingsDialog(): void {
    const user = authService.getUser();
    if (!user) return;

    const dialog = document.createElement('div');
    dialog.id = 'settings-dialog';
    dialog.className = 'modal fade show d-block';
    dialog.style.backgroundColor = 'rgba(0,0,0,0.8)';

    dialog.innerHTML = `
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">⚙️ User Settings</h2>
            <button id="close-settings" class="btn-close" aria-label="Close"></button>
          </div>

          <div class="modal-body">
            <!-- Profile Section -->
            <div class="card mb-4">
          <div class="card-header bg-success text-white">
            <i class="fas fa-user me-2"></i>Profile Information
          </div>
          <div class="card-body">
            <div class="mb-3">
              <label class="form-label">Username</label>
              <input type="text" value="${user.username}" disabled class="form-control" readonly>
              <div class="form-text">Username cannot be changed</div>
            </div>

            <div class="mb-3">
              <label class="form-label">Email</label>
              <input type="email" id="profile-email" value="${user.email}" class="form-control">
            </div>

            <button id="update-profile-btn" class="btn btn-success">
              <i class="fas fa-save me-2"></i>Update Profile
            </button>
          </div>
        </div>

        <!-- Change Password Section -->
        <div class="card mb-4">
          <div class="card-header bg-warning">
            <i class="fas fa-key me-2"></i>Change Password
          </div>
          <div class="card-body">
            <div class="mb-3">
              <label class="form-label">Current Password</label>
              <input type="password" id="current-password" class="form-control">
            </div>

            <div class="mb-3">
              <label class="form-label">New Password</label>
              <input type="password" id="new-password" class="form-control">
              <div class="form-text">Minimum 6 characters</div>
            </div>

            <div class="mb-3">
              <label class="form-label">Confirm New Password</label>
              <input type="password" id="confirm-password" class="form-control">
            </div>

            <button id="change-password-btn" class="btn btn-warning">
              <i class="fas fa-lock me-2"></i>Change Password
            </button>
          </div>
        </div>

        <!-- Account Info -->
        <div class="card mb-4">
          <div class="card-header bg-info text-white">
            <i class="fas fa-info-circle me-2"></i>Account Information
          </div>
          <div class="card-body">
            <ul class="list-group list-group-flush">
              <li class="list-group-item d-flex justify-content-between align-items-center">
                <strong>User ID:</strong>
                <span class="text-muted">${user.id}</span>
              </li>
              <li class="list-group-item d-flex justify-content-between align-items-center">
                <strong>Account Created:</strong>
                <span class="text-muted">${new Date(user.createdAt).toLocaleString()}</span>
              </li>
              <li class="list-group-item d-flex justify-content-between align-items-center">
                <strong>Account Type:</strong>
                ${user.isAdmin ? '<span class="badge bg-warning text-dark"><i class="fas fa-crown me-1"></i>Administrator</span>' : '<span class="badge bg-secondary">User</span>'}
              </li>
            </ul>
          </div>
        </div>

        <div id="settings-message" class="alert d-none" role="alert"></div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Close button
    const closeBtn = dialog.querySelector('#close-settings') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => dialog.remove());

    // Click outside to close
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.remove();
    });

    // Update profile
    const updateProfileBtn = dialog.querySelector('#update-profile-btn') as HTMLButtonElement;
    const profileEmail = dialog.querySelector('#profile-email') as HTMLInputElement;

    updateProfileBtn.addEventListener('click', async () => {
      const email = profileEmail.value.trim();
      
      if (!email) {
        this.showMessage(dialog, 'Please enter an email', false);
        return;
      }

      updateProfileBtn.disabled = true;
      updateProfileBtn.textContent = 'Updating...';

      const result = await authService.updateProfile(email);

      if (result.success) {
        this.showMessage(dialog, 'Profile updated successfully!', true);
      } else {
        this.showMessage(dialog, result.error || 'Failed to update profile', false);
      }

      updateProfileBtn.disabled = false;
      updateProfileBtn.textContent = 'Update Profile';
    });

    // Change password
    const changePasswordBtn = dialog.querySelector('#change-password-btn') as HTMLButtonElement;
    const currentPassword = dialog.querySelector('#current-password') as HTMLInputElement;
    const newPassword = dialog.querySelector('#new-password') as HTMLInputElement;
    const confirmPassword = dialog.querySelector('#confirm-password') as HTMLInputElement;

    changePasswordBtn.addEventListener('click', async () => {
      const current = currentPassword.value;
      const newPass = newPassword.value;
      const confirm = confirmPassword.value;

      if (!current || !newPass || !confirm) {
        this.showMessage(dialog, 'Please fill in all password fields', false);
        return;
      }

      if (newPass.length < 6) {
        this.showMessage(dialog, 'New password must be at least 6 characters', false);
        return;
      }

      if (newPass !== confirm) {
        this.showMessage(dialog, 'New passwords do not match', false);
        return;
      }

      changePasswordBtn.disabled = true;
      changePasswordBtn.textContent = 'Changing...';

      const result = await authService.changePassword(current, newPass);

      if (result.success) {
        this.showMessage(dialog, 'Password changed successfully!', true);
        currentPassword.value = '';
        newPassword.value = '';
        confirmPassword.value = '';
      } else {
        this.showMessage(dialog, result.error || 'Failed to change password', false);
      }

      changePasswordBtn.disabled = false;
      changePasswordBtn.textContent = 'Change Password';
    });
  }

  private showMessage(dialog: HTMLElement, message: string, success: boolean): void {
    const messageDiv = dialog.querySelector('#settings-message') as HTMLElement;
    messageDiv.innerHTML = `
      <div class="alert alert-${success ? 'success' : 'danger'} alert-dismissible fade show" role="alert">
        <i class="fas fa-${success ? 'check-circle' : 'exclamation-circle'} me-2"></i>
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      </div>
    `;

    setTimeout(() => {
      const alert = messageDiv.querySelector('.alert');
      if (alert) {
        alert.classList.remove('show');
        setTimeout(() => messageDiv.innerHTML = '', 150);
      }
    }, 5000);
  }
}
