import { authService } from '../services/auth';

export class UserSettingsUI {
  showSettingsDialog(): void {
    const user = authService.getUser();
    if (!user) return;

    const dialog = document.createElement('div');
    dialog.id = 'settings-dialog';
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
        min-width: 500px;
        max-width: 600px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        max-height: 90vh;
        overflow-y: auto;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
          <h2 style="margin: 0; font-size: 28px;">⚙️ User Settings</h2>
          <button id="close-settings" style="
            background: transparent;
            border: none;
            color: white;
            font-size: 24px;
            cursor: pointer;
            padding: 5px 10px;
          ">×</button>
        </div>

        <!-- Profile Section -->
        <div style="margin-bottom: 30px; padding: 20px; background: rgba(255, 255, 255, 0.05); border-radius: 8px;">
          <h3 style="margin: 0 0 20px 0; font-size: 18px; color: #4CAF50;">👤 Profile Information</h3>
          
          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 8px; font-size: 14px; opacity: 0.7;">Username</label>
            <input type="text" value="${user.username}" disabled style="
              width: 100%;
              padding: 12px;
              box-sizing: border-box;
              background: rgba(0, 0, 0, 0.3);
              border: 1px solid rgba(255, 255, 255, 0.1);
              border-radius: 6px;
              color: rgba(255, 255, 255, 0.5);
              font-size: 16px;
            ">
            <small style="opacity: 0.5; font-size: 12px;">Username cannot be changed</small>
          </div>

          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 8px; font-size: 14px;">Email</label>
            <input type="email" id="profile-email" value="${user.email}" style="
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

          <button id="update-profile-btn" style="
            padding: 10px 20px;
            background: #4CAF50;
            border: none;
            border-radius: 6px;
            color: white;
            cursor: pointer;
            font-size: 14px;
          ">Update Profile</button>
        </div>

        <!-- Change Password Section -->
        <div style="margin-bottom: 30px; padding: 20px; background: rgba(255, 255, 255, 0.05); border-radius: 8px;">
          <h3 style="margin: 0 0 20px 0; font-size: 18px; color: #FFC107;">🔑 Change Password</h3>
          
          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 8px; font-size: 14px;">Current Password</label>
            <input type="password" id="current-password" style="
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

          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 8px; font-size: 14px;">New Password</label>
            <input type="password" id="new-password" style="
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

          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-size: 14px;">Confirm New Password</label>
            <input type="password" id="confirm-password" style="
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

          <button id="change-password-btn" style="
            padding: 10px 20px;
            background: #FFC107;
            border: none;
            border-radius: 6px;
            color: #000;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
          ">Change Password</button>
        </div>

        <!-- Account Info -->
        <div style="padding: 20px; background: rgba(255, 255, 255, 0.05); border-radius: 8px;">
          <h3 style="margin: 0 0 15px 0; font-size: 18px; color: #2196F3;">ℹ️ Account Information</h3>
          <div style="font-size: 14px; opacity: 0.8; line-height: 1.8;">
            <div><strong>User ID:</strong> ${user.id}</div>
            <div><strong>Account Created:</strong> ${new Date(user.createdAt).toLocaleString()}</div>
            <div><strong>Account Type:</strong> ${user.isAdmin ? '<span style="color: #FFC107;">👑 Administrator</span>' : 'User'}</div>
          </div>
        </div>

        <div id="settings-message" style="
          margin-top: 20px;
          padding: 12px;
          border-radius: 6px;
          display: none;
        "></div>
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
    messageDiv.style.display = 'block';
    messageDiv.style.background = success ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)';
    messageDiv.style.border = `1px solid ${success ? '#4CAF50' : '#f44336'}`;
    messageDiv.style.color = success ? '#4CAF50' : '#f44336';

    setTimeout(() => {
      messageDiv.style.display = 'none';
    }, 5000);
  }
}
