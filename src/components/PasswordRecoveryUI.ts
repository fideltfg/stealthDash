import { authService } from '../services/auth';

export class PasswordRecoveryUI {
  // Show request recovery dialog (accessible from login page)
  showRequestRecoveryDialog(): void {
    const dialog = document.createElement('div');
    dialog.id = 'request-recovery-dialog';
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
        width: 100%;
        max-width: 500px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
          <h2 style="margin: 0; font-size: 24px;">🔐 Password Recovery</h2>
          <button id="close-recovery" style="
            background: transparent;
            border: none;
            color: white;
            font-size: 32px;
            cursor: pointer;
            padding: 5px 10px;
          ">×</button>
        </div>

        <p style="margin: 0 0 20px 0; color: rgba(255, 255, 255, 0.7); line-height: 1.6;">
          Enter your username or email address and we'll send you a link to reset your password.
        </p>
        
        <input
          type="text"
          id="recovery-input"
          placeholder="Username or Email"
          style="
            width: 100%;
            padding: 12px;
            margin-bottom: 20px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 6px;
            color: white;
            font-size: 14px;
            box-sizing: border-box;
          "
        />

        <button id="send-recovery-btn" style="
          width: 100%;
          padding: 12px;
          background: #4CAF50;
          border: none;
          border-radius: 6px;
          color: white;
          font-size: 14px;
          font-weight: bold;
          cursor: pointer;
        ">Send Recovery Link</button>

        <div id="recovery-message" style="
          margin-top: 20px;
          padding: 12px;
          border-radius: 6px;
          display: none;
        "></div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Close button
    const closeBtn = dialog.querySelector('#close-recovery') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => dialog.remove());

    // Click outside to close
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.remove();
    });

    // Send recovery email
    const sendBtn = dialog.querySelector('#send-recovery-btn') as HTMLButtonElement;
    const input = dialog.querySelector('#recovery-input') as HTMLInputElement;

    // Allow Enter key to submit
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendBtn.click();
      }
    });

    sendBtn.addEventListener('click', async () => {
      const usernameOrEmail = input.value.trim();

      if (!usernameOrEmail) {
        this.showMessage(dialog, 'Please enter your username or email', false);
        return;
      }

      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending...';

      const result = await authService.requestPasswordRecovery(usernameOrEmail);

      sendBtn.disabled = false;
      sendBtn.textContent = 'Send Recovery Link';

      if (result.success) {
        this.showMessage(dialog, result.message || 'Recovery email sent!', true);
        input.value = '';
        
        // Auto-close after 5 seconds
        setTimeout(() => dialog.remove(), 5000);
      } else {
        this.showMessage(dialog, result.error || 'Failed to send recovery email', false);
      }
    });
  }

  // Show reset password dialog (for when user clicks link with token in URL)
  async showResetPasswordDialog(token: string, onSuccess?: () => void): Promise<void> {
    // First, validate the token
    const validation = await authService.validateRecoveryToken(token);
    
    const dialog = document.createElement('div');
    dialog.id = 'reset-password-dialog';
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

    if (!validation.valid) {
      // Show error dialog
      dialog.innerHTML = `
        <div style="
          background: #1e1e1e;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          padding: 40px;
          width: 100%;
          max-width: 500px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
          text-align: center;
        ">
          <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
          <h2 style="margin: 0 0 20px 0; font-size: 24px; color: #f44336;">Invalid Recovery Link</h2>
          <p style="margin: 0 0 30px 0; color: rgba(255, 255, 255, 0.7);">
            ${validation.error || 'This recovery link is invalid or has expired.'}
          </p>
          <button id="close-btn" style="
            padding: 12px 24px;
            background: #4CAF50;
            border: none;
            border-radius: 6px;
            color: white;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
          ">Close</button>
        </div>
      `;
      
      document.body.appendChild(dialog);
      
      const closeBtn = dialog.querySelector('#close-btn') as HTMLButtonElement;
      closeBtn.addEventListener('click', () => {
        dialog.remove();
        if (onSuccess) onSuccess();
      });
      
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
          dialog.remove();
          if (onSuccess) onSuccess();
        }
      });
      
      return;
    }

    // Show password reset form
    dialog.innerHTML = `
      <div style="
        background: #1e1e1e;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 12px;
        padding: 40px;
        width: 100%;
        max-width: 500px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      ">
        <div style="text-align: center; margin-bottom: 30px;">
          <div style="font-size: 48px; margin-bottom: 15px;">🔐</div>
          <h2 style="margin: 0 0 10px 0; font-size: 24px;">Reset Your Password</h2>
          <p style="margin: 0; color: rgba(255, 255, 255, 0.7); font-size: 14px;">
            ${validation.username ? `Account: <strong>${validation.username}</strong>` : ''}
          </p>
        </div>

        <input
          type="password"
          id="new-password"
          placeholder="New Password (min 6 characters)"
          style="
            width: 100%;
            padding: 12px;
            margin-bottom: 15px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 6px;
            color: white;
            font-size: 14px;
            box-sizing: border-box;
          "
        />

        <input
          type="password"
          id="confirm-password"
          placeholder="Confirm New Password"
          style="
            width: 100%;
            padding: 12px;
            margin-bottom: 20px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 6px;
            color: white;
            font-size: 14px;
            box-sizing: border-box;
          "
        />

        <button id="reset-btn" style="
          width: 100%;
          padding: 14px;
          background: #4CAF50;
          border: none;
          border-radius: 6px;
          color: white;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
        ">Reset Password</button>

        <div id="message" style="
          margin-top: 20px;
          padding: 12px;
          border-radius: 6px;
          display: none;
        "></div>
      </div>
    `;

    document.body.appendChild(dialog);

    const newPasswordInput = dialog.querySelector('#new-password') as HTMLInputElement;
    const confirmPasswordInput = dialog.querySelector('#confirm-password') as HTMLInputElement;
    const resetBtn = dialog.querySelector('#reset-btn') as HTMLButtonElement;

    // Allow Enter key to submit
    const submitHandler = () => resetBtn.click();
    newPasswordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') submitHandler();
    });
    confirmPasswordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') submitHandler();
    });

    resetBtn.addEventListener('click', async () => {
      const newPassword = newPasswordInput.value;
      const confirmPassword = confirmPasswordInput.value;

      if (!newPassword || newPassword.length < 6) {
        this.showMessage(dialog, 'Password must be at least 6 characters', false);
        return;
      }

      if (newPassword !== confirmPassword) {
        this.showMessage(dialog, 'Passwords do not match', false);
        return;
      }

      resetBtn.disabled = true;
      resetBtn.textContent = 'Resetting...';

      const result = await authService.resetPassword(token, newPassword);

      resetBtn.disabled = false;
      resetBtn.textContent = 'Reset Password';

      if (result.success) {
        this.showMessage(dialog, 'Password reset successful! Redirecting to login...', true);
        
        // Wait 2 seconds then close and redirect
        setTimeout(() => {
          dialog.remove();
          if (onSuccess) onSuccess();
        }, 2000);
      } else {
        this.showMessage(dialog, result.error || 'Failed to reset password', false);
      }
    });

    // Click outside to close
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        dialog.remove();
        if (onSuccess) onSuccess();
      }
    });
  }

  private showMessage(dialog: HTMLElement, message: string, success: boolean): void {
    const messageDiv = dialog.querySelector('#message, #recovery-message') as HTMLElement;
    if (!messageDiv) return;
    
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
