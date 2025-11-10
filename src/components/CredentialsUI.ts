import { credentialsService, Credential, CreateCredentialRequest } from '../services/credentials';

export class CredentialsUI {
  private credentials: Credential[] = [];

  async showCredentialsDialog(): Promise<void> {
    await this.loadCredentials();

    const dialog = document.createElement('div');
    dialog.id = 'credentials-dialog';
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
        min-width: 700px;
        max-width: 900px;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
          <h2 style="margin: 0; font-size: 28px;">🔐 Credential Management</h2>
          <button id="close-credentials" style="
            background: transparent;
            border: none;
            color: white;
            font-size: 24px;
            cursor: pointer;
            padding: 5px 10px;
          ">×</button>
        </div>

        <div style="margin-bottom: 20px;">
          <button id="add-credential-btn" style="
            padding: 12px 24px;
            background: #4CAF50;
            border: none;
            border-radius: 6px;
            color: white;
            cursor: pointer;
            font-size: 16px;
            font-weight: bold;
          ">➕ Add New Credential</button>
        </div>

        <div id="credentials-list" style="
          display: grid;
          gap: 15px;
        ">
          ${this.renderCredentialsList()}
        </div>

        ${this.credentials.length === 0 ? `
          <div style="
            text-align: center;
            padding: 60px 20px;
            color: rgba(255, 255, 255, 0.5);
          ">
            <div style="font-size: 48px; margin-bottom: 20px;">🔑</div>
            <p style="font-size: 18px; margin: 0;">No credentials saved yet</p>
            <p style="margin: 10px 0 0 0;">Add credentials to securely store API keys, passwords, and tokens</p>
          </div>
        ` : ''}
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
      <div style="
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        transition: all 0.3s;
      " onmouseover="this.style.background='rgba(255, 255, 255, 0.08)'" 
         onmouseout="this.style.background='rgba(255, 255, 255, 0.05)'">
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
            <span style="font-size: 24px;">${credentialsService.getServiceTypeIcon(cred.service_type)}</span>
            <h3 style="margin: 0; font-size: 18px;">${this.escapeHtml(cred.name)}</h3>
            <span style="
              padding: 4px 12px;
              background: rgba(76, 175, 80, 0.2);
              border: 1px solid rgba(76, 175, 80, 0.4);
              border-radius: 12px;
              font-size: 12px;
              color: #4CAF50;
            ">${credentialsService.getServiceTypeLabel(cred.service_type)}</span>
          </div>
          ${cred.description ? `
            <p style="margin: 0; font-size: 14px; color: rgba(255, 255, 255, 0.6);">
              ${this.escapeHtml(cred.description)}
            </p>
          ` : ''}
          <p style="margin: 8px 0 0 0; font-size: 12px; color: rgba(255, 255, 255, 0.4);">
            Created: ${new Date(cred.created_at).toLocaleDateString()}
          </p>
        </div>
        <div style="display: flex; gap: 10px;">
          <button class="test-credential-btn" data-id="${cred.id}" style="
            padding: 8px 16px;
            background: rgba(33, 150, 243, 0.2);
            border: 1px solid rgba(33, 150, 243, 0.4);
            border-radius: 6px;
            color: #2196F3;
            cursor: pointer;
            font-size: 14px;
          " title="Test credential">
            🧪 Test
          </button>
          <button class="edit-credential-btn" data-id="${cred.id}" style="
            padding: 8px 16px;
            background: rgba(255, 193, 7, 0.2);
            border: 1px solid rgba(255, 193, 7, 0.4);
            border-radius: 6px;
            color: #FFC107;
            cursor: pointer;
            font-size: 14px;
          " title="Edit credential">
            ✏️ Edit
          </button>
          <button class="delete-credential-btn" data-id="${cred.id}" style="
            padding: 8px 16px;
            background: rgba(244, 67, 54, 0.2);
            border: 1px solid rgba(244, 67, 54, 0.4);
            border-radius: 6px;
            color: #F44336;
            cursor: pointer;
            font-size: 14px;
          " title="Delete credential">
            🗑️ Delete
          </button>
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
    dialog.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100001;
    `;

    dialog.innerHTML = `
      <div style="
        background: #1e1e1e;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 12px;
        padding: 40px;
        min-width: 600px;
        max-width: 700px;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
          <h2 style="margin: 0; font-size: 24px;">➕ Add New Credential</h2>
          <button id="close-create-credential" style="
            background: transparent;
            border: none;
            color: white;
            font-size: 24px;
            cursor: pointer;
            padding: 5px 10px;
          ">×</button>
        </div>

        <form id="create-credential-form">
          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-size: 14px;">Name *</label>
            <input type="text" id="cred-name" required style="
              width: 100%;
              padding: 12px;
              box-sizing: border-box;
              background: rgba(255, 255, 255, 0.05);
              border: 1px solid rgba(255, 255, 255, 0.2);
              border-radius: 6px;
              color: white;
              font-size: 16px;
            " placeholder="e.g., My Pi-hole Server">
          </div>

          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-size: 14px;">Service Type *</label>
            <select id="cred-service-type" required style="
              width: 100%;
              padding: 12px;
              box-sizing: border-box;
              background: var(--surface, rgba(255, 255, 255, 0.05));
              border: 1px solid var(--border, rgba(255, 255, 255, 0.2));
              border-radius: 6px;
              color: var(--text, white);
              font-size: 16px;
              cursor: pointer;
              -webkit-appearance: none;
              -moz-appearance: none;
              appearance: none;
            ">
              <option value="" style="background: var(--surface, #2a2a2a); color: var(--muted, #999);">Select service type...</option>
              <option value="pihole" style="background: var(--surface, #2a2a2a); color: var(--text, white);">🛡️ Pi-hole</option>
              <option value="unifi" style="background: var(--surface, #2a2a2a); color: var(--text, white);">📡 UniFi Controller</option>
              <option value="home_assistant" style="background: var(--surface, #2a2a2a); color: var(--text, white);">🏠 Home Assistant</option>
              <option value="google_calendar" style="background: var(--surface, #2a2a2a); color: var(--text, white);">📅 Google Calendar</option>
              <option value="snmp" style="background: var(--surface, #2a2a2a); color: var(--text, white);">📊 SNMP</option>
              <option value="api" style="background: var(--surface, #2a2a2a); color: var(--text, white);">🔌 Generic API</option>
              <option value="custom" style="background: var(--surface, #2a2a2a); color: var(--text, white);">⭐ Custom</option>
            </select>
          </div>

          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-size: 14px;">Description</label>
            <textarea id="cred-description" style="
              width: 100%;
              padding: 12px;
              box-sizing: border-box;
              background: rgba(255, 255, 255, 0.05);
              border: 1px solid rgba(255, 255, 255, 0.2);
              border-radius: 6px;
              color: white;
              font-size: 16px;
              min-height: 80px;
              resize: vertical;
            " placeholder="Optional description..."></textarea>
          </div>

          <div id="credential-fields" style="margin-bottom: 20px;">
            <!-- Dynamic fields will be inserted here -->
          </div>

          <div id="create-error" style="
            display: none;
            padding: 12px;
            background: rgba(244, 67, 54, 0.2);
            border: 1px solid rgba(244, 67, 54, 0.4);
            border-radius: 6px;
            color: #F44336;
            margin-bottom: 20px;
          "></div>

          <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button type="button" id="cancel-create" style="
              padding: 12px 24px;
              background: rgba(255, 255, 255, 0.1);
              border: 1px solid rgba(255, 255, 255, 0.2);
              border-radius: 6px;
              color: white;
              cursor: pointer;
              font-size: 16px;
            ">Cancel</button>
            <button type="submit" style="
              padding: 12px 24px;
              background: #4CAF50;
              border: none;
              border-radius: 6px;
              color: white;
              cursor: pointer;
              font-size: 16px;
              font-weight: bold;
            ">Create Credential</button>
          </div>
        </form>
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
        <div style="
          padding: 20px;
          background: rgba(255, 193, 7, 0.1);
          border: 1px solid rgba(255, 193, 7, 0.3);
          border-radius: 6px;
          color: rgba(255, 255, 255, 0.7);
        ">
          <p style="margin: 0; font-size: 14px;">
            ℹ️ Custom credentials can store any key-value pairs. You'll need to manually enter the JSON data.
          </p>
        </div>
        <div style="margin-top: 15px;">
          <label style="display: block; margin-bottom: 8px; font-size: 14px;">Credential Data (JSON) *</label>
          <textarea id="cred-custom-data" required style="
            width: 100%;
            padding: 12px;
            box-sizing: border-box;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 6px;
            color: white;
            font-size: 14px;
            font-family: monospace;
            min-height: 120px;
            resize: vertical;
          " placeholder='{\n  "key1": "value1",\n  "key2": "value2"\n}'></textarea>
        </div>
      `;
    } else {
      container.innerHTML = fields.map(field => `
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 8px; font-size: 14px;">${field.label} *</label>
          <input 
            type="${field.type}" 
            id="cred-field-${field.name}" 
            required 
            style="
              width: 100%;
              padding: 12px;
              box-sizing: border-box;
              background: rgba(255, 255, 255, 0.05);
              border: 1px solid rgba(255, 255, 255, 0.2);
              border-radius: 6px;
              color: white;
              font-size: 16px;
            " 
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

    errorDiv.style.display = 'none';

    if (!name || !serviceType) {
      errorDiv.textContent = 'Name and service type are required';
      errorDiv.style.display = 'block';
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
            errorDiv.style.display = 'block';
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
      errorDiv.style.display = 'block';
    }
  }

  private async showEditCredentialDialog(id: number): Promise<void> {
    try {
      const credential = await credentialsService.getById(id);
      
      const dialog = document.createElement('div');
      dialog.id = 'edit-credential-dialog';
      dialog.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100001;
      `;

      const fields = credentialsService.getServiceTypeFields(credential.service_type);
      
      dialog.innerHTML = `
        <div style="
          background: #1e1e1e;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          padding: 40px;
          min-width: 600px;
          max-width: 700px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        ">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
            <h2 style="margin: 0; font-size: 24px;">✏️ Edit Credential</h2>
            <button id="close-edit-credential" style="
              background: transparent;
              border: none;
              color: white;
              font-size: 24px;
              cursor: pointer;
              padding: 5px 10px;
            ">×</button>
          </div>

          <form id="edit-credential-form">
            <div style="margin-bottom: 20px;">
              <label style="display: block; margin-bottom: 8px; font-size: 14px;">Name *</label>
              <input type="text" id="edit-cred-name" required value="${this.escapeHtml(credential.name)}" style="
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

            <div style="margin-bottom: 20px;">
              <label style="display: block; margin-bottom: 8px; font-size: 14px;">Service Type</label>
              <input type="text" value="${credentialsService.getServiceTypeLabel(credential.service_type)}" disabled style="
                width: 100%;
                padding: 12px;
                box-sizing: border-box;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 6px;
                color: rgba(255, 255, 255, 0.5);
                font-size: 16px;
              ">
              <small style="opacity: 0.5; font-size: 12px;">Service type cannot be changed</small>
            </div>

            <div style="margin-bottom: 20px;">
              <label style="display: block; margin-bottom: 8px; font-size: 14px;">Description</label>
              <textarea id="edit-cred-description" style="
                width: 100%;
                padding: 12px;
                box-sizing: border-box;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 6px;
                color: white;
                font-size: 16px;
                min-height: 80px;
                resize: vertical;
              ">${this.escapeHtml(credential.description || '')}</textarea>
            </div>

            <div style="margin-bottom: 20px;">
              <h3 style="margin: 0 0 15px 0; font-size: 16px;">Update Credentials</h3>
              ${fields.length > 0 ? fields.map(field => `
                <div style="margin-bottom: 15px;">
                  <label style="display: block; margin-bottom: 8px; font-size: 14px;">${field.label}</label>
                  <input 
                    type="${field.type}" 
                    id="edit-cred-field-${field.name}" 
                    value="${this.escapeHtml(credential.data?.[field.name] || '')}"
                    style="
                      width: 100%;
                      padding: 12px;
                      box-sizing: border-box;
                      background: rgba(255, 255, 255, 0.05);
                      border: 1px solid rgba(255, 255, 255, 0.2);
                      border-radius: 6px;
                      color: white;
                      font-size: 16px;
                    " 
                    placeholder="Leave empty to keep unchanged">
                </div>
              `).join('') : `
                <div>
                  <label style="display: block; margin-bottom: 8px; font-size: 14px;">Credential Data (JSON)</label>
                  <textarea id="edit-cred-custom-data" style="
                    width: 100%;
                    padding: 12px;
                    box-sizing: border-box;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 6px;
                    color: white;
                    font-size: 14px;
                    font-family: monospace;
                    min-height: 120px;
                    resize: vertical;
                  " placeholder="Leave empty to keep unchanged">${JSON.stringify(credential.data || {}, null, 2)}</textarea>
                  <small style="opacity: 0.5; font-size: 12px;">Leave empty to keep current credentials</small>
                </div>
              `}
            </div>

            <div id="edit-error" style="
              display: none;
              padding: 12px;
              background: rgba(244, 67, 54, 0.2);
              border: 1px solid rgba(244, 67, 54, 0.4);
              border-radius: 6px;
              color: #F44336;
              margin-bottom: 20px;
            "></div>

            <div style="display: flex; gap: 10px; justify-content: flex-end;">
              <button type="button" id="cancel-edit" style="
                padding: 12px 24px;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 6px;
                color: white;
                cursor: pointer;
                font-size: 16px;
              ">Cancel</button>
              <button type="submit" style="
                padding: 12px 24px;
                background: #FFC107;
                border: none;
                border-radius: 6px;
                color: black;
                cursor: pointer;
                font-size: 16px;
                font-weight: bold;
              ">Update Credential</button>
            </div>
          </form>
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

    errorDiv.style.display = 'none';

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
            errorDiv.style.display = 'block';
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
      errorDiv.style.display = 'block';
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
    const colors = {
      success: { bg: 'rgba(76, 175, 80, 0.2)', border: 'rgba(76, 175, 80, 0.4)', text: '#4CAF50' },
      error: { bg: 'rgba(244, 67, 54, 0.2)', border: 'rgba(244, 67, 54, 0.4)', text: '#F44336' },
      warning: { bg: 'rgba(255, 193, 7, 0.2)', border: 'rgba(255, 193, 7, 0.4)', text: '#FFC107' }
    };

    const color = colors[type];
    
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 16px 24px;
      background: ${color.bg};
      border: 1px solid ${color.border};
      border-radius: 8px;
      color: ${color.text};
      font-size: 16px;
      z-index: 100002;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      animation: slideIn 0.3s ease-out;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-out';
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
