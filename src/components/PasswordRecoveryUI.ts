import { authService } from '../services/auth';

export class PasswordRecoveryUI {
  // Show request recovery dialog (accessible from login page)
  showRequestRecoveryDialog(): void {
    const dialog = document.createElement('div');
    dialog.id = 'request-recovery-dialog';
    dialog.className = 'auth-container';

    dialog.innerHTML = `
      <div class="auth-box">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h2 class="mb-0">🔐 Password Recovery</h2>
          <button id="close-recovery" class="btn-close" aria-label="Close"></button>
        </div>

        <p class="text-muted mb-4">
          Enter your username or email address and we'll send you a link to reset your password.
        </p>
        
        <div class="mb-3">
          <input
            type="text"
            id="recovery-input"
            placeholder="Username or Email"
            class="form-control"
          />
        </div>

        <button id="send-recovery-btn" class="btn btn-success w-100">Send Recovery Link</button>

        <div id="recovery-message" class="mt-3"></div>
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
    dialog.className = 'dialog recovery-dialog';

    if (!validation.valid) {
      // Show error dialog
      dialog.innerHTML = `
        <div class="auth-box text-center">
          <div class="display-1 mb-3">⚠️</div>
          <h2 class="mb-3">Invalid Recovery Link</h2>
          <p class="text-danger mb-4">
            ${validation.error || 'This recovery link is invalid or has expired.'}
          </p>
          <button id="close-btn" class="btn btn-primary w-100">Close</button>
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
      <div class="auth-box">
        <div class="text-center mb-4">
          <div class="display-1 mb-3">🔐</div>
          <h2>Reset Your Password</h2>
          ${validation.username ? `<p class="text-muted">Account: <strong>${validation.username}</strong></p>` : ''}
        </div>

        <div class="mb-3">
          <input
            type="password"
            id="new-password"
            placeholder="New Password (min 6 characters)"
            class="form-control"
          />
        </div>

        <div class="mb-4">
          <input
            type="password"
            id="confirm-password"
            placeholder="Confirm New Password"
            class="form-control"
          />
        </div>

        <button id="reset-btn" class="btn btn-success w-100">Reset Password</button>

        <div id="message" class="mt-3"></div>
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

  private showMessage(dialogOrMessage: HTMLElement | string, messageOrType: string | boolean, isSuccessOrUndefined?: boolean): void {
    // Overload 1: showMessage(message, type) - for reset dialog
    if (typeof dialogOrMessage === 'string' && typeof messageOrType === 'string') {
      const messageDiv = document.querySelector('#message') as HTMLDivElement;
      if (messageDiv) {
        const isSuccess = messageOrType === 'success';
        messageDiv.innerHTML = `
          <div class="alert alert-${isSuccess ? 'success' : 'danger'}" role="alert">
            <i class="fas fa-${isSuccess ? 'check-circle' : 'exclamation-circle'} me-2"></i>
            ${dialogOrMessage}
          </div>
        `;
      }
    }
    // Overload 2: showMessage(dialog, message, isSuccess) - for request dialog
    else if (typeof messageOrType === 'string' && typeof isSuccessOrUndefined === 'boolean') {
      const messageDiv = (dialogOrMessage as HTMLElement).querySelector('#recovery-message') as HTMLDivElement;
      if (messageDiv) {
        messageDiv.innerHTML = `
          <div class="alert alert-${isSuccessOrUndefined ? 'success' : 'danger'}" role="alert">
            <i class="fas fa-${isSuccessOrUndefined ? 'check-circle' : 'exclamation-circle'} me-2"></i>
            ${messageOrType}
          </div>
        `;
      }
    }
  }
}