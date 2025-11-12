import { authService } from '../services/auth';

export class UserSettingsUI {
  showSettingsDialog(): void {
    const user = authService.getUser();
    if (!user) return;

    const dialog = document.createElement('div');
    dialog.id = 'settings-dialog';
    dialog.className = 'dialog';

    dialog.innerHTML = `
      <div class="dialog-container settings-container">
        <div class="dialog-header">
          <h2 class="dialog-title">⚙️ User Settings</h2>
          <button id="close-settings" class="dialog-close-button">×</button>
        </div>

        <!-- Profile Section -->
        <div class="section">
          <h3 class="section-title settings-section-title-success">👤 Profile Information</h3>
          
          <div class="form-group">
            <label class="form-label form-label-disabled">Username</label>
            <input type="text" value="${user.username}" disabled class="form-input form-input-disabled">
            <small class="form-hint">Username cannot be changed</small>
          </div>

          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" id="profile-email" value="${user.email}" class="form-input">
          </div>

          <button id="update-profile-btn" class="btn btn-success">Update Profile</button>
        </div>

        <!-- Change Password Section -->
        <div class="section">
          <h3 class="section-title settings-section-title-warning">🔑 Change Password</h3>
          
          <div class="form-group">
            <label class="form-label">Current Password</label>
            <input type="password" id="current-password" class="form-input">
          </div>

          <div class="form-group">
            <label class="form-label">New Password</label>
            <input type="password" id="new-password" class="form-input">
            <small class="form-hint">Minimum 6 characters</small>
          </div>

          <div class="form-group">
            <label class="form-label">Confirm New Password</label>
            <input type="password" id="confirm-password" class="form-input">
          </div>

          <button id="change-password-btn" class="btn btn-warning">Change Password</button>
        </div>

        <!-- Account Info -->
        <div class="section">
          <h3 class="section-title settings-section-title-info">ℹ️ Account Information</h3>
          <div class="settings-info-list">
            <div><strong>User ID:</strong> ${user.id}</div>
            <div><strong>Account Created:</strong> ${new Date(user.createdAt).toLocaleString()}</div>
            <div><strong>Account Type:</strong> ${user.isAdmin ? '<span class="settings-admin-badge">👑 Administrator</span>' : 'User'}</div>
          </div>
        </div>

        <div id="settings-message" class="message"></div>
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
    messageDiv.textContent = message;
    messageDiv.classList.remove('message-success', 'message-error', 'settings-message-success', 'settings-message-error');
    messageDiv.classList.add(success ? 'message-success settings-message-success' : 'message-error settings-message-error', 'visible');

    setTimeout(() => {
      messageDiv.classList.remove('visible');
    }, 5000);
  }
}
