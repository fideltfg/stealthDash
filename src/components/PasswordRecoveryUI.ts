import { authService } from '../services/auth';

export class PasswordRecoveryUI {
  // Show request recovery dialog (accessible from login page)
  showRequestRecoveryDialog(): void {
    const dialog = document.createElement('div');
    dialog.id = 'request-recovery-dialog';
    dialog.className = 'recovery-dialog';

    dialog.innerHTML = `
      <div class="recovery-container">
        <div class="recovery-header">
          <h2 class="recovery-title">🔐 Password Recovery</h2>
          <button id="close-recovery" class="recovery-close-button">×</button>
        </div>

        <p class="recovery-description">
          Enter your username or email address and we'll send you a link to reset your password.
        </p>
        
        <input
          type="text"
          id="recovery-input"
          placeholder="Username or Email"
          class="recovery-input"
        />

        <button id="send-recovery-btn" class="recovery-button recovery-button-primary">Send Recovery Link</button>

        <div id="recovery-message" class="recovery-message"></div>
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
    dialog.className = 'recovery-dialog';

    if (!validation.valid) {
      // Show error dialog
      dialog.innerHTML = `
        <div class="recovery-container recovery-container-error">
          <div class="recovery-error-icon">⚠️</div>
          <h2 class="recovery-title recovery-title-error">Invalid Recovery Link</h2>
          <p class="recovery-error-text">
            ${validation.error || 'This recovery link is invalid or has expired.'}
          </p>
          <button id="close-btn" class="recovery-button recovery-button-primary">Close</button>
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
      <div class="recovery-container">
        <div class="recovery-reset-header">
          <div class="recovery-reset-icon">🔐</div>
          <h2 class="recovery-title">Reset Your Password</h2>
          <p class="recovery-username">
            ${validation.username ? `Account: <strong>${validation.username}</strong>` : ''}
          </p>
        </div>

        <input
          type="password"
          id="new-password"
          placeholder="New Password (min 6 characters)"
          class="recovery-input recovery-input-space"
        />

        <input
          type="password"
          id="confirm-password"
          placeholder="Confirm New Password"
          class="recovery-input recovery-input-space-large"
        />

        <button id="reset-btn" class="recovery-button recovery-button-primary recovery-button-large">Reset Password</button>

        <div id="message" class="recovery-message"></div>
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
    messageDiv.classList.remove('recovery-message-success', 'recovery-message-error');
    messageDiv.classList.add(success ? 'recovery-message-success' : 'recovery-message-error', 'visible');

    setTimeout(() => {
      messageDiv.classList.remove('visible');
    }, 5000);
  }
}
