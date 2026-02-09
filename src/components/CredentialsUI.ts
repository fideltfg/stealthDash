import { credentialsService, Credential, CreateCredentialRequest } from '../services/credentials';

export class CredentialsUI {
  private credentials: Credential[] = [];

  async showCredentialsDialog(): Promise<void> {
    await this.loadCredentials();

    const dialog = document.createElement('div');
    dialog.id = 'credentials-dialog';
    dialog.className = 'modal fade show d-block';
    dialog.style.backgroundColor = 'rgba(0,0,0,0.8)';

    dialog.innerHTML = `
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">🔐 Credential Management</h2>
            <button id="close-credentials" class="btn-close" aria-label="Close"></button>
          </div>

          <div class="modal-body">
            <div class="mb-3">
              <button id="add-credential-btn" class="btn btn-success w-100">➕ Add New Credential</button>
            </div>

            <div id="credentials-list" class="d-flex flex-column gap-3">
          ${this.renderCredentialsList()}
        </div>

            ${this.credentials.length === 0 ? `
              <div class="text-center py-5 text-muted">
                <div style="font-size: 4rem; opacity: 0.5;">🔑</div>
                <h5 class="mt-3">No credentials saved yet</h5>
                <p class="small">Add credentials to securely store API keys, passwords, and tokens</p>
              </div>
            ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Event listeners
    dialog.querySelector('#close-credentials')?.addEventListener('click', () => {
      dialog.remove();
    });

    dialog.querySelector('#add-credential-btn')?.addEventListener('click', () => {
      this.showCreateCredentialDialog();
    });

    // Close on backdrop click
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        dialog.remove();
      }
    });

    // Add event listeners for credential actions
    this.attachCredentialActions();
  }

  private renderCredentialsList(): string {
    return this.credentials.map(cred => `
      <div class="card">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start">
            <div class="flex-grow-1">
              <div class="d-flex align-items-center gap-2 mb-2">
                <span style="font-size: 1.5rem;">${credentialsService.getServiceTypeIcon(cred.service_type)}</span>
                <h5 class="card-title mb-0">${this.escapeHtml(cred.name)}</h5>
                <span class="badge bg-primary ms-auto">${credentialsService.getServiceTypeLabel(cred.service_type)}</span>
              </div>
              ${cred.description ? `
                <p class="card-text text-muted small">
                  ${this.escapeHtml(cred.description)}
                </p>
              ` : ''}
              <p class="card-text small text-muted mb-0">
                Created: ${new Date(cred.created_at).toLocaleDateString()}
              </p>
            </div>
            <div class="d-flex flex-column gap-2 ms-3">
              <button class="test-credential-btn btn btn-sm btn-info" data-id="${cred.id}" title="Test credential">
                🧪 Test
              </button>
              <button class="edit-credential-btn btn btn-sm btn-warning" data-id="${cred.id}" title="Edit credential">
                ✏️ Edit
              </button>
              <button class="delete-credential-btn btn btn-sm btn-danger" data-id="${cred.id}" title="Delete credential">
                🗑️ Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  }

  private attachCredentialActions(): void {
    document.querySelectorAll('.test-credential-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = parseInt((e.target as HTMLElement).closest('button')?.getAttribute('data-id') || '0');
        await this.testCredential(id);
      });
    });

    document.querySelectorAll('.edit-credential-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = parseInt((e.target as HTMLElement).closest('button')?.getAttribute('data-id') || '0');
        await this.showEditCredentialDialog(id);
      });
    });

    document.querySelectorAll('.delete-credential-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = parseInt((e.target as HTMLElement).closest('button')?.getAttribute('data-id') || '0');
        await this.deleteCredential(id);
      });
    });
  }

  private async loadCredentials(): Promise<void> {
    try {
      this.credentials = await credentialsService.getAll();
    } catch (error) {
      console.error('Failed to load credentials:', error);
      this.showNotification('Failed to load credentials', 'error');
    }
  }

  private showCreateCredentialDialog(): void {
    const dialog = document.createElement('div');
    dialog.id = 'create-credential-dialog';
    dialog.className = 'modal fade show d-block';
    dialog.style.backgroundColor = 'rgba(0,0,0,0.8)';

    dialog.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">➕ Add New Credential</h2>
            <button id="close-create-credential" class="btn-close" aria-label="Close"></button>
          </div>

          <form id="create-credential-form" class="modal-body">
            <div class="mb-3">
              <label class="form-label">Name *</label>
              <input type="text" id="cred-name" required class="form-control" placeholder="e.g., My Pi-hole Server">
            </div>

            <div class="mb-3">
              <label class="form-label">Service Type *</label>
              <select id="cred-service-type" required class="form-select">
              <option value="">Select service type...</option>
              <option value="pihole">🛡️ Pi-hole</option>
              <option value="unifi">📡 UniFi Controller</option>
              <option value="home_assistant">🏠 Home Assistant</option>
              <option value="google_calendar">📅 Google Calendar</option>
              <option value="docker">🐋 Docker</option>
              <option value="snmp">📊 SNMP</option>
              <option value="api"><i class="fas fa-plug"></i> Generic API</option>
              <option value="custom">⭐ Custom</option>
            </select>
          </div>

            <div class="mb-3">
              <label class="form-label">Description</label>
              <textarea id="cred-description" class="form-control" rows="3" placeholder="Optional description..."></textarea>
            </div>

            <div id="credential-fields" class="pt-3 border-top">
              <!-- Dynamic fields will be inserted here -->
            </div>

            <div id="create-error" class="alert alert-danger d-none" role="alert"></div>
          </form>

          <div class="modal-footer">
            <button type="button" id="cancel-create" class="btn btn-secondary">Cancel</button>
            <button type="submit" form="create-credential-form" class="btn btn-success">Create Credential</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Service type change handler
    const serviceTypeSelect = dialog.querySelector('#cred-service-type') as HTMLSelectElement;
    const fieldsContainer = dialog.querySelector('#credential-fields') as HTMLDivElement;

    serviceTypeSelect.addEventListener('change', () => {
      this.renderCredentialFields(fieldsContainer, serviceTypeSelect.value);
    });

    // Close handlers
    dialog.querySelector('#close-create-credential')?.addEventListener('click', () => {
      dialog.remove();
    });

    dialog.querySelector('#cancel-create')?.addEventListener('click', () => {
      dialog.remove();
    });

    // Form submit
    dialog.querySelector('#create-credential-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleCreateCredential(dialog);
    });

    // Close on backdrop click
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        dialog.remove();
      }
    });
  }

  private renderCredentialFields(container: HTMLDivElement, serviceType: string): void {
    const fields = credentialsService.getServiceTypeFields(serviceType);
    
    if (fields.length === 0) {
      container.innerHTML = `
        <div class="alert alert-info" role="alert">
          ℹ️ Custom credentials can store any key-value pairs. You'll need to manually enter the JSON data.
        </div>
        <div class="mb-3">
          <label class="form-label">Credential Data (JSON) *</label>
          <textarea id="cred-custom-data" required class="form-control font-monospace bg-light" rows="6" placeholder='{\n  "key1": "value1",\n  "key2": "value2"\n}'></textarea>
        </div>
      `;
    } else {
      container.innerHTML = fields.map(field => `
        <div class="mb-3">
          <label class="form-label">${field.label} *</label>
          <input 
            type="${field.type}" 
            id="cred-field-${field.name}" 
            required 
            class="form-control" 
            placeholder="${field.placeholder || ''}">
        </div>
      `).join('');
    }
  }

  private async handleCreateCredential(dialog: HTMLElement): Promise<void> {
    const name = (dialog.querySelector('#cred-name') as HTMLInputElement).value;
    const serviceType = (dialog.querySelector('#cred-service-type') as HTMLSelectElement).value;
    const description = (dialog.querySelector('#cred-description') as HTMLTextAreaElement).value;
    const errorDiv = dialog.querySelector('#create-error') as HTMLDivElement;

    errorDiv.classList.add('d-none');

    if (!name || !serviceType) {
      errorDiv.textContent = 'Name and service type are required';
      errorDiv.classList.remove('d-none');
      return;
    }

    try {
      let data: any = {};

      const fields = credentialsService.getServiceTypeFields(serviceType);
      if (fields.length === 0) {
        // Custom fields - parse JSON
        const customData = (dialog.querySelector('#cred-custom-data') as HTMLTextAreaElement)?.value;
        if (customData) {
          try {
            data = JSON.parse(customData);
          } catch {
            errorDiv.textContent = 'Invalid JSON format';
            errorDiv.classList.remove('d-none');
            return;
          }
        }
      } else {
        // Collect field values
        fields.forEach(field => {
          const input = dialog.querySelector(`#cred-field-${field.name}`) as HTMLInputElement;
          if (input) {
            data[field.name] = input.value;
          }
        });
      }

      const request: CreateCredentialRequest = {
        name,
        description: description || undefined,
        service_type: serviceType,
        data
      };

      await credentialsService.create(request);
      
      this.showNotification('Credential created successfully!', 'success');
      dialog.remove();
      
      // Refresh the credentials list
      const credentialsDialog = document.querySelector('#credentials-dialog');
      if (credentialsDialog) {
        credentialsDialog.remove();
        await this.showCredentialsDialog();
      }
    } catch (error: any) {
      errorDiv.textContent = error.message || 'Failed to create credential';
      errorDiv.classList.remove('d-none');
    }
  }

  private async showEditCredentialDialog(id: number): Promise<void> {
    try {
      const credential = await credentialsService.getById(id);
      
      const dialog = document.createElement('div');
      dialog.id = 'edit-credential-dialog';
      dialog.className = 'modal fade show d-block';
      dialog.style.backgroundColor = 'rgba(0,0,0,0.8)';

      const fields = credentialsService.getServiceTypeFields(credential.service_type);
      
      dialog.innerHTML = `
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h2 class="modal-title">✏️ Edit Credential</h2>
              <button id="close-edit-credential" class="btn-close" aria-label="Close"></button>
            </div>

            <form id="edit-credential-form" class="modal-body">
              <div class="mb-3">
                <label class="form-label">Name *</label>
                <input type="text" id="edit-cred-name" required value="${this.escapeHtml(credential.name)}" class="form-control">
              </div>

              <div class="mb-3">
                <label class="form-label">Service Type</label>
                <input type="text" value="${credentialsService.getServiceTypeLabel(credential.service_type)}" disabled class="form-control">
                <div class="form-text">Service type cannot be changed</div>
              </div>

              <div class="mb-3">
                <label class="form-label">Description</label>
                <textarea id="edit-cred-description" class="form-control" rows="3">${this.escapeHtml(credential.description || '')}</textarea>
              </div>

              <div class="pt-3 border-top">
                <h5 class="mb-3">Update Credentials</h5>
                ${fields.length > 0 ? fields.map(field => `
                  <div class="mb-3">
                    <label class="form-label">${field.label}</label>
                    <input 
                      type="${field.type}" 
                      id="edit-cred-field-${field.name}" 
                      value="${this.escapeHtml(credential.data?.[field.name] || '')}"
                      class="form-control" 
                      placeholder="Leave empty to keep unchanged">
                  </div>
                `).join('') : `
                  <div class="mb-3">
                    <label class="form-label">Credential Data (JSON)</label>
                    <textarea id="edit-cred-custom-data" class="form-control font-monospace bg-light" rows="6" placeholder="Leave empty to keep unchanged">${JSON.stringify(credential.data || {}, null, 2)}</textarea>
                    <div class="form-text">Leave empty to keep current credentials</div>
                  </div>
                `}
              </div>

              <div id="edit-error" class="alert alert-danger d-none" role="alert"></div>
            </form>

            <div class="modal-footer">
              <button type="button" id="cancel-edit" class="btn btn-secondary">Cancel</button>
              <button type="submit" form="edit-credential-form" class="btn btn-warning">Update Credential</button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(dialog);

      // Close handlers
      dialog.querySelector('#close-edit-credential')?.addEventListener('click', () => {
        dialog.remove();
      });

      dialog.querySelector('#cancel-edit')?.addEventListener('click', () => {
        dialog.remove();
      });

      // Form submit
      dialog.querySelector('#edit-credential-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleEditCredential(dialog, id, credential.service_type);
      });

      // Close on backdrop click
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
          dialog.remove();
        }
      });
    } catch (error) {
      this.showNotification('Failed to load credential', 'error');
    }
  }

  private async handleEditCredential(dialog: HTMLElement, id: number, serviceType: string): Promise<void> {
    const name = (dialog.querySelector('#edit-cred-name') as HTMLInputElement).value;
    const description = (dialog.querySelector('#edit-cred-description') as HTMLTextAreaElement).value;
    const errorDiv = dialog.querySelector('#edit-error') as HTMLDivElement;

    errorDiv.classList.remove('visible');

    try {
      const updateData: any = {
        name,
        description: description || undefined
      };

      const fields = credentialsService.getServiceTypeFields(serviceType);
      
      if (fields.length === 0) {
        // Custom fields - parse JSON
        const customData = (dialog.querySelector('#edit-cred-custom-data') as HTMLTextAreaElement)?.value.trim();
        if (customData) {
          try {
            updateData.data = JSON.parse(customData);
          } catch {
            errorDiv.textContent = 'Invalid JSON format';
            errorDiv.classList.remove('d-none');
            return;
          }
        }
      } else {
        // Collect field values (only if they're not empty)
        const data: any = {};
        let hasData = false;
        
        fields.forEach(field => {
          const input = dialog.querySelector(`#edit-cred-field-${field.name}`) as HTMLInputElement;
          if (input && input.value) {
            data[field.name] = input.value;
            hasData = true;
          }
        });

        if (hasData) {
          updateData.data = data;
        }
      }

      await credentialsService.update(id, updateData);
      
      this.showNotification('Credential updated successfully!', 'success');
      dialog.remove();
      
      // Refresh the credentials list
      const credentialsDialog = document.querySelector('#credentials-dialog');
      if (credentialsDialog) {
        credentialsDialog.remove();
        await this.showCredentialsDialog();
      }
    } catch (error: any) {
      errorDiv.textContent = error.message || 'Failed to update credential';
      errorDiv.classList.remove('d-none');
    }
  }

  private async testCredential(id: number): Promise<void> {
    try {
      const result = await credentialsService.test(id);
      
      if (result.valid) {
        this.showNotification(`✅ ${result.message}`, 'success');
      } else {
        this.showNotification(`⚠️ ${result.message}`, 'warning');
      }
    } catch (error: any) {
      this.showNotification(`❌ Test failed: ${error.message}`, 'error');
    }
  }

  private async deleteCredential(id: number): Promise<void> {
    const credential = this.credentials.find(c => c.id === id);
    if (!credential) return;

    const confirmed = confirm(
      `Are you sure you want to delete the credential "${credential.name}"?\n\n` +
      `This action cannot be undone. Any widgets using this credential will stop working.`
    );

    if (!confirmed) return;

    try {
      await credentialsService.delete(id);
      this.showNotification('Credential deleted successfully!', 'success');
      
      // Refresh the credentials list
      const credentialsDialog = document.querySelector('#credentials-dialog');
      if (credentialsDialog) {
        credentialsDialog.remove();
        await this.showCredentialsDialog();
      }
    } catch (error: any) {
      this.showNotification(`Failed to delete credential: ${error.message}`, 'error');
    }
  }

  private showNotification(message: string, type: 'success' | 'error' | 'warning'): void {
    const notification = document.createElement('div');
    notification.className = `message message-${type} credential-notification`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('credential-notification-exit');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

export const credentialsUI = new CredentialsUI();
