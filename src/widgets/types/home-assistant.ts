import type { Widget } from '../../types';
import type { WidgetRenderer } from './base';

interface HomeAssistantEntity {
  entity_id: string;
  state: string;
  attributes: {
    friendly_name?: string;
    [key: string]: any;
  };
  last_changed?: string;
  last_updated?: string;
}

interface HomeAssistantContent {
  url?: string;
  token?: string;
  entities?: {
    entity_id: string;
    display_name?: string;
    type: 'switch' | 'light' | 'sensor';
  }[];
  refreshInterval?: number; // seconds
}

export class HomeAssistantRenderer implements WidgetRenderer {
  private intervals: Map<string, number> = new Map();
  private entityStates: Map<string, Map<string, HomeAssistantEntity>> = new Map();

  configure(widget: Widget): void {
    this.showSettingsDialog(widget);
  }
  

  async render(container: HTMLElement, widget: Widget): Promise<void> {
    const content = widget.content as HomeAssistantContent;
    container.innerHTML = '';

    // If no URL/token configured, show config prompt
    if (!content.url || !content.token) {
      this.renderConfigPrompt(container, widget);
      return;
    }

    // If no entities configured, show add entities prompt
    if (!content.entities || content.entities.length === 0) {
      this.renderNoEntitiesPrompt(container, widget);
      return;
    }

    // Render entities
    await this.renderEntities(container, widget);
  }

  private renderConfigPrompt(container: HTMLElement, widget: Widget): void {
    const content = widget.content as HomeAssistantContent;
    const prompt = document.createElement('div');
    prompt.className = 'config-prompt';
    prompt.innerHTML = `
      <div style="text-align: center; padding: 20px;">
        <div style="font-size: 48px; margin-bottom: 20px;">🏠</div>
        <h3 style="margin-bottom: 20px;">Configure Home Assistant</h3>
        <div style="max-width: 400px; margin: 0 auto;">
          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; text-align: left;">Home Assistant URL:</label>
            <input type="text" id="ha-url" placeholder="http://homeassistant.local:8123" 
                   style="width: 100%; padding: 8px; box-sizing: border-box;" 
                   value="${content.url || ''}">
          </div>
          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; text-align: left;">Long-Lived Access Token:</label>
            <input type="password" id="ha-token" placeholder="Enter your token" 
                   style="width: 100%; padding: 8px; box-sizing: border-box;"
                   value="${content.token || ''}">
            <small style="display: block; text-align: left; margin-top: 5px; opacity: 0.7;">
              Create in Home Assistant: Profile → Security → Long-Lived Access Tokens
            </small>
          </div>
          <button id="save-ha-config" style="padding: 10px 20px; cursor: pointer;">
            Save Configuration
          </button>
        </div>
      </div>
    `;
    container.appendChild(prompt);

    // Save button handler
    const saveBtn = prompt.querySelector('#save-ha-config') as HTMLButtonElement;
    const urlInput = prompt.querySelector('#ha-url') as HTMLInputElement;
    const tokenInput = prompt.querySelector('#ha-token') as HTMLInputElement;
    
    saveBtn.addEventListener('click', () => {
      const url = urlInput.value.trim();
      const token = tokenInput.value.trim();
      
      if (!url || !token) {
        alert('Please enter both URL and token');
        return;
      }

      // Trigger widget update
      const event = new CustomEvent('widget-update', { 
        detail: { id: widget.id, content: { ...content, url, token } }
      });
      document.dispatchEvent(event);
    });
    
    // Stop propagation so widget isn't dragged
    urlInput.addEventListener('pointerdown', (e) => e.stopPropagation());
    tokenInput.addEventListener('pointerdown', (e) => e.stopPropagation());
    saveBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  private renderNoEntitiesPrompt(container: HTMLElement, widget: Widget): void {
    const prompt = document.createElement('div');
    prompt.className = 'no-entities-prompt';
    prompt.innerHTML = `
      <div style="text-align: center; padding: 20px;">
        <div style="font-size: 48px; margin-bottom: 20px;">🏠</div>
        <h3 style="margin-bottom: 20px;">No Entities Added</h3>
        <p style="margin-bottom: 20px;">Add Home Assistant entities to monitor and control.</p>
        <button id="add-entity-btn" style="padding: 10px 20px; cursor: pointer;">
          + Add Entity
        </button>
      </div>
    `;
    container.appendChild(prompt);

    const addBtn = prompt.querySelector('#add-entity-btn') as HTMLButtonElement;
    addBtn.addEventListener('click', () => {
      this.showAddEntityDialog(widget);
    });
    addBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  private async renderEntities(container: HTMLElement, widget: Widget): Promise<void> {
    const content = widget.content as HomeAssistantContent;

    // Create grid container first
    const grid = document.createElement('div');
    grid.className = 'ha-entities-grid';
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 10px;
      padding: 10px;
    `;
    container.appendChild(grid);

    // Add floating action buttons
    container.style.position = 'relative';

    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'ha-floating-buttons';
    buttonContainer.style.cssText = `
      position: absolute;
      top: 8px;
      right: 8px;
      display: flex;
      gap: 8px;
      z-index: 100;
    `;

    // Entities button
    const entitiesBtn = document.createElement('button');
    entitiesBtn.className = 'ha-entities-btn';
    entitiesBtn.innerHTML = '📋';
    entitiesBtn.title = 'Manage Entities';
    entitiesBtn.style.cssText = `
      width: 32px;
      height: 32px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: rgba(0, 0, 0, 0.7);
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      transition: background 0.2s;
      backdrop-filter: blur(10px);
    `;
    entitiesBtn.addEventListener('mouseenter', () => {
      entitiesBtn.style.background = 'rgba(0, 0, 0, 0.9)';
    });
    entitiesBtn.addEventListener('mouseleave', () => {
      entitiesBtn.style.background = 'rgba(0, 0, 0, 0.7)';
    });
    entitiesBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showManageEntitiesDialog(widget);
    });
    entitiesBtn.addEventListener('pointerdown', (e) => e.stopPropagation());

 

    buttonContainer.appendChild(entitiesBtn);
    container.appendChild(buttonContainer);

    // Render each entity with loading state
    const entities = content.entities || [];
    for (const entity of entities) {
      const card = this.createEntityCard(entity, widget, container);
      grid.appendChild(card);
    }

    // Fetch current states and update cards
    await this.fetchEntityStates(widget);
    this.updateEntityCards(widget, grid);

    // Start auto-refresh
    this.startAutoRefresh(widget, grid);
  }

  private createEntityCard(
    entity: { entity_id: string; display_name?: string; type: 'switch' | 'light' | 'sensor' },
    widget: Widget,
    container: HTMLElement
  ): HTMLElement {
    const widgetStates = this.entityStates.get(widget.id) || new Map();
    const state = widgetStates.get(entity.entity_id);
    const card = document.createElement('div');
    card.className = 'ha-entity-card';
    card.style.cssText = `
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 15px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;

    // Entity name
    const name = document.createElement('div');
    name.style.cssText = 'font-weight: bold; font-size: 14px;';
    name.textContent = entity.display_name || state?.attributes.friendly_name || entity.entity_id;
    card.appendChild(name);

    // State display
    const stateDiv = document.createElement('div');
    stateDiv.className = 'ha-entity-state';
    stateDiv.style.cssText = 'font-size: 12px; opacity: 0.8;';
    stateDiv.textContent = state ? `State: ${state.state}` : 'Loading...';
    card.appendChild(stateDiv);

    // Control based on type
    if (entity.type === 'switch' || entity.type === 'light') {
      const toggleBtn = document.createElement('button');
      toggleBtn.style.cssText = `
        padding: 8px 12px;
        cursor: pointer;
        border-radius: 4px;
        border: none;
        background: ${state?.state === 'on' ? '#4CAF50' : '#666'};
        color: white;
        transition: background 0.3s;
      `;
      toggleBtn.textContent = state?.state === 'on' ? 'Turn Off' : 'Turn On';
      toggleBtn.addEventListener('click', async () => {
        // Show loading state
        const originalBg = toggleBtn.style.background;
        const originalText = toggleBtn.textContent;
        toggleBtn.style.background = '#FF9800';
        toggleBtn.textContent = '⏳ Please wait...';
        toggleBtn.disabled = true;
        toggleBtn.style.cursor = 'not-allowed';
        
        try {
          await this.toggleEntity(entity.entity_id, widget);
          // Refresh state and update cards (don't re-render everything)
          await this.fetchEntityStates(widget);
          const grid = container.querySelector('.ha-entities-grid') as HTMLElement;
          if (grid) {
            this.updateEntityCards(widget, grid);
          }
        } catch (error) {
          // Restore original state on error
          toggleBtn.style.background = originalBg;
          toggleBtn.textContent = originalText;
          toggleBtn.disabled = false;
          toggleBtn.style.cursor = 'pointer';
        }
      });
      toggleBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
      card.appendChild(toggleBtn);
    }

    return card;
  }

  private updateEntityCards(widget: Widget, grid: HTMLElement): void {
    const content = widget.content as HomeAssistantContent;
    const entities = content.entities || [];
    const widgetStates = this.entityStates.get(widget.id) || new Map();
    
    // Update entity cards
    const cards = grid.querySelectorAll('.ha-entity-card');
    entities.forEach((entity, index) => {
      const state = widgetStates.get(entity.entity_id);
      const card = cards[index] as HTMLElement;
      if (card) {
        // Update entity name if we got friendly name from state
        if (state?.attributes.friendly_name && !entity.display_name) {
          const nameDiv = card.querySelector('div:first-child') as HTMLElement;
          if (nameDiv) {
            nameDiv.textContent = state.attributes.friendly_name;
          }
        }

        // Update state display
        const stateDiv = card.querySelector('.ha-entity-state') as HTMLElement;
        if (stateDiv) {
          stateDiv.textContent = state ? `State: ${state.state}` : 'Unavailable';
        }

        // Update button color and text for switches/lights
        const button = card.querySelector('button') as HTMLButtonElement;
        if (button && state && (entity.type === 'switch' || entity.type === 'light')) {
          button.style.background = state.state === 'on' ? '#4CAF50' : '#666';
          button.textContent = state.state === 'on' ? 'Turn Off' : 'Turn On';
          button.disabled = false;
          button.style.cursor = 'pointer';
        }
      }
    });
  }

  private async fetchEntityStates(widget: Widget): Promise<void> {
    const content = widget.content as HomeAssistantContent;
    if (!content.url || !content.token) return;
    
    try {
      // Use ping-server proxy to avoid CORS issues
      const pingServerUrl = this.getPingServerUrl();
      const response = await fetch(`${pingServerUrl}/home-assistant/states`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: content.url,
          token: content.token
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const allStates: HomeAssistantEntity[] = await response.json();
      
      // Store states for this widget
      const widgetStates = new Map<string, HomeAssistantEntity>();
      const entities = content.entities || [];
      for (const entity of entities) {
        const state = allStates.find(s => s.entity_id === entity.entity_id);
        if (state) {
          widgetStates.set(entity.entity_id, state);
        }
      }
      this.entityStates.set(widget.id, widgetStates);
    } catch (error) {
      console.error('Failed to fetch entity states:', error);
    }
  }

  private async toggleEntity(entityId: string, widget: Widget): Promise<void> {
    const content = widget.content as HomeAssistantContent;
    if (!content.url || !content.token) return;
    
    try {
      const widgetStates = this.entityStates.get(widget.id) || new Map();
      const domain = entityId.split('.')[0];
      const service = widgetStates.get(entityId)?.state === 'on' ? 'turn_off' : 'turn_on';
      
      // Use ping-server proxy to avoid CORS issues
      const pingServerUrl = this.getPingServerUrl();
      const response = await fetch(`${pingServerUrl}/home-assistant/service`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: content.url,
          token: content.token,
          domain,
          service,
          entity_id: entityId
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to toggle entity:', error);
      alert(`Failed to toggle ${entityId}: ${error}`);
    }
  }

  private getPingServerUrl(): string {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    return `${protocol}//${hostname}:3001`;
  }

  private showAddEntityDialog(widget: Widget): void {
    const content = widget.content as HomeAssistantContent;
    
    // Create overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;
    
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      min-width: 400px;
      max-width: 500px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      color: var(--text);
    `;

    dialog.innerHTML = `
      <h3 style="margin-top: 0; color: var(--text);">Add Entity</h3>
      <div style="margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 5px; color: var(--text); font-weight: 500;">Entity ID:</label>
        <input type="text" id="entity-id" placeholder="light.living_room" 
               style="
                 width: 100%; 
                 padding: 10px; 
                 box-sizing: border-box;
                 background: var(--background);
                 color: var(--text);
                 border: 1px solid var(--border);
                 border-radius: 6px;
                 font-size: 14px;
               ">
        <small style="opacity: 0.7; color: var(--muted); font-size: 12px;">Example: light.kitchen, switch.fan, sensor.temperature</small>
      </div>
      <div style="margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 5px; color: var(--text); font-weight: 500;">Display Name (optional):</label>
        <input type="text" id="display-name" placeholder="Living Room Light" 
               style="
                 width: 100%; 
                 padding: 10px; 
                 box-sizing: border-box;
                 background: var(--background);
                 color: var(--text);
                 border: 1px solid var(--border);
                 border-radius: 6px;
                 font-size: 14px;
               ">
      </div>
      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 5px; color: var(--text); font-weight: 500;">Type:</label>
        <select id="entity-type" style="
          width: 100%; 
          padding: 10px;
          background: var(--background);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: 6px;
          font-size: 14px;
        ">
          <option value="light">Light</option>
          <option value="switch">Switch</option>
          <option value="sensor">Sensor</option>
        </select>
      </div>
      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        <button id="cancel-entity" style="
          padding: 10px 20px; 
          cursor: pointer;
          background: rgba(255, 255, 255, 0.1);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: 6px;
          font-size: 14px;
        ">Cancel</button>
        <button id="save-entity" style="
          padding: 10px 20px; 
          cursor: pointer; 
          background: var(--accent); 
          color: white; 
          border: none; 
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
        ">
          Add Entity
        </button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const entityIdInput = dialog.querySelector('#entity-id') as HTMLInputElement;
    const displayNameInput = dialog.querySelector('#display-name') as HTMLInputElement;
    const entityTypeSelect = dialog.querySelector('#entity-type') as HTMLSelectElement;
    const cancelBtn = dialog.querySelector('#cancel-entity') as HTMLButtonElement;
    const saveBtn = dialog.querySelector('#save-entity') as HTMLButtonElement;

    // Stop propagation for all inputs
    [entityIdInput, displayNameInput, entityTypeSelect, cancelBtn, saveBtn].forEach(el => {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
    });

    // Cancel button
    cancelBtn.addEventListener('click', () => {
      overlay.remove();
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });

    // Save button
    saveBtn.addEventListener('click', () => {
      const entityId = entityIdInput.value.trim();
      const displayName = displayNameInput.value.trim();
      const type = entityTypeSelect.value as 'light' | 'switch' | 'sensor';

      if (!entityId) {
        alert('Please enter an entity ID');
        return;
      }

      const entities = content.entities || [];
      entities.push({
        entity_id: entityId,
        display_name: displayName || undefined,
        type: type
      });

      overlay.remove();

      // Trigger widget update
      const event = new CustomEvent('widget-update', { 
        detail: { id: widget.id, content: { ...content, entities } }
      });
      document.dispatchEvent(event);
    });
  }

  private showEditEntityDialog(widget: Widget, entityIndex: number): void {
    const content = widget.content as HomeAssistantContent;
    const entities = content.entities || [];
    const entity = entities[entityIndex];
    
    if (!entity) {
      alert('Entity not found');
      return;
    }
    
    // Create overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;
    
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      min-width: 400px;
      max-width: 500px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      color: var(--text);
    `;

    dialog.innerHTML = `
      <h3 style="margin-top: 0; color: var(--text);">Edit Entity</h3>
      <div style="margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 5px; color: var(--text); font-weight: 500;">Entity ID:</label>
        <input type="text" id="edit-entity-id" placeholder="light.living_room" 
               value="${entity.entity_id}"
               style="
                 width: 100%; 
                 padding: 10px; 
                 box-sizing: border-box;
                 background: var(--background);
                 color: var(--text);
                 border: 1px solid var(--border);
                 border-radius: 6px;
                 font-size: 14px;
               ">
        <small style="opacity: 0.7; color: var(--muted); font-size: 12px;">Example: light.kitchen, switch.fan, sensor.temperature</small>
      </div>
      <div style="margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 5px; color: var(--text); font-weight: 500;">Display Name (optional):</label>
        <input type="text" id="edit-display-name" placeholder="Living Room Light" 
               value="${entity.display_name || ''}"
               style="
                 width: 100%; 
                 padding: 10px; 
                 box-sizing: border-box;
                 background: var(--background);
                 color: var(--text);
                 border: 1px solid var(--border);
                 border-radius: 6px;
                 font-size: 14px;
               ">
      </div>
      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 5px; color: var(--text); font-weight: 500;">Type:</label>
        <select id="edit-entity-type" style="
          width: 100%; 
          padding: 10px;
          background: var(--background);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: 6px;
          font-size: 14px;
        ">
          <option value="light" ${entity.type === 'light' ? 'selected' : ''}>Light</option>
          <option value="switch" ${entity.type === 'switch' ? 'selected' : ''}>Switch</option>
          <option value="sensor" ${entity.type === 'sensor' ? 'selected' : ''}>Sensor</option>
        </select>
      </div>
      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        <button id="cancel-edit-entity" style="
          padding: 10px 20px; 
          cursor: pointer;
          background: rgba(255, 255, 255, 0.1);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: 6px;
          font-size: 14px;
        ">Cancel</button>
        <button id="save-edit-entity" style="
          padding: 10px 20px; 
          cursor: pointer; 
          background: var(--accent); 
          color: white; 
          border: none; 
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
        ">
          Save Changes
        </button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const entityIdInput = dialog.querySelector('#edit-entity-id') as HTMLInputElement;
    const displayNameInput = dialog.querySelector('#edit-display-name') as HTMLInputElement;
    const entityTypeSelect = dialog.querySelector('#edit-entity-type') as HTMLSelectElement;
    const cancelBtn = dialog.querySelector('#cancel-edit-entity') as HTMLButtonElement;
    const saveBtn = dialog.querySelector('#save-edit-entity') as HTMLButtonElement;

    // Stop propagation for all inputs
    [entityIdInput, displayNameInput, entityTypeSelect, cancelBtn, saveBtn].forEach(el => {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
    });

    // Cancel button
    cancelBtn.addEventListener('click', () => {
      overlay.remove();
      // Return to manage entities dialog
      this.showManageEntitiesDialog(widget);
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        this.showManageEntitiesDialog(widget);
      }
    });

    // Save button
    saveBtn.addEventListener('click', () => {
      const entityId = entityIdInput.value.trim();
      const displayName = displayNameInput.value.trim();
      const type = entityTypeSelect.value as 'light' | 'switch' | 'sensor';

      if (!entityId) {
        alert('Please enter an entity ID');
        return;
      }

      // Update the entity at the specified index
      entities[entityIndex] = {
        entity_id: entityId,
        display_name: displayName || undefined,
        type: type
      };

      overlay.remove();

      // Trigger widget update
      const event = new CustomEvent('widget-update', { 
        detail: { id: widget.id, content: { ...content, entities } }
      });
      document.dispatchEvent(event);
      
      // Return to manage entities dialog to show updated list
      this.showManageEntitiesDialog(widget);
    });
  }

  private showSettingsDialog(widget: Widget): void {
    const content = widget.content as HomeAssistantContent;
    
    // Create overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;
    
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      min-width: 500px;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      color: var(--text);
    `;

    dialog.innerHTML = `
      <h3 style="margin-top: 0; color: var(--text);">⚙️ Home Assistant Settings</h3>
      
      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: var(--text);">
          Home Assistant URL
        </label>
        <input 
          type="text" 
          id="ha-url-input" 
          placeholder="http://homeassistant.local:8123"
          value="${content.url || ''}"
          style="
            width: 100%;
            padding: 10px;
            background: var(--bg);
            border: 1px solid var(--border);
            border-radius: 6px;
            color: var(--text);
            font-size: 14px;
            box-sizing: border-box;
          "
        />
        <small style="display: block; margin-top: 6px; opacity: 0.7; color: var(--muted);">
          The base URL of your Home Assistant instance
        </small>
      </div>

      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: var(--text);">
          Long-Lived Access Token
        </label>
        <input 
          type="password" 
          id="ha-token-input" 
          placeholder="Enter your access token"
          value="${content.token || ''}"
          style="
            width: 100%;
            padding: 10px;
            background: var(--bg);
            border: 1px solid var(--border);
            border-radius: 6px;
            color: var(--text);
            font-size: 14px;
            box-sizing: border-box;
          "
        />
        <small style="display: block; margin-top: 6px; opacity: 0.7; color: var(--muted);">
          Create in Home Assistant: Profile → Security → Long-Lived Access Tokens
        </small>
      </div>

      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: var(--text);">
          Refresh Interval (seconds)
        </label>
        <input 
          type="number" 
          id="ha-refresh-input" 
          min="1"
          max="300"
          value="${content.refreshInterval || 5}"
          style="
            width: 100%;
            padding: 10px;
            background: var(--bg);
            border: 1px solid var(--border);
            border-radius: 6px;
            color: var(--text);
            font-size: 14px;
            box-sizing: border-box;
          "
        />
        <small style="display: block; margin-top: 6px; opacity: 0.7; color: var(--muted);">
          How often to refresh entity states
        </small>
      </div>

      <div style="display: flex; gap: 12px; justify-content: flex-end; border-top: 1px solid var(--border); padding-top: 15px; margin-top: 20px;">
        <button id="cancel-settings-btn" style="
          padding: 10px 20px;
          cursor: pointer;
          background: rgba(255, 255, 255, 0.1);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: 6px;
          font-size: 14px;
        ">
          Cancel
        </button>
        <button id="save-settings-btn" style="
          padding: 10px 20px;
          cursor: pointer;
          background: var(--accent);
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
        ">
          Save Settings
        </button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Get input elements
    const urlInput = dialog.querySelector('#ha-url-input') as HTMLInputElement;
    const tokenInput = dialog.querySelector('#ha-token-input') as HTMLInputElement;
    const refreshInput = dialog.querySelector('#ha-refresh-input') as HTMLInputElement;
    const saveBtn = dialog.querySelector('#save-settings-btn') as HTMLButtonElement;
    const cancelBtn = dialog.querySelector('#cancel-settings-btn') as HTMLButtonElement;

    // Save button handler
    saveBtn.addEventListener('click', () => {
      const url = urlInput.value.trim();
      const token = tokenInput.value.trim();
      const refreshInterval = parseInt(refreshInput.value);

      if (!url || !token) {
        alert('Please enter both URL and token');
        return;
      }

      if (refreshInterval < 1 || refreshInterval > 300) {
        alert('Refresh interval must be between 1 and 300 seconds');
        return;
      }

      // Trigger widget update
      const event = new CustomEvent('widget-update', {
        detail: { 
          id: widget.id, 
          content: { 
            ...content, 
            url, 
            token, 
            refreshInterval 
          } 
        }
      });
      document.dispatchEvent(event);

      overlay.remove();
    });
    saveBtn.addEventListener('pointerdown', (e) => e.stopPropagation());

    // Cancel button handler
    cancelBtn.addEventListener('click', () => {
      overlay.remove();
    });
    cancelBtn.addEventListener('pointerdown', (e) => e.stopPropagation());

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });

    // Prevent dialog from being dragged
    dialog.addEventListener('pointerdown', (e) => e.stopPropagation());
    urlInput.addEventListener('pointerdown', (e) => e.stopPropagation());
    tokenInput.addEventListener('pointerdown', (e) => e.stopPropagation());
    refreshInput.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  private showManageEntitiesDialog(widget: Widget): void {
    const content = widget.content as HomeAssistantContent;
    
    // Create overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;
    
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      min-width: 500px;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      color: var(--text);
    `;

    const entities = content.entities || [];
    
    let dialogHTML = `
      <h3 style="margin-top: 0; color: var(--text);">Manage Entities</h3>
      <div style="margin-bottom: 20px;">
    `;

    if (entities.length === 0) {
      dialogHTML += `<p style="opacity: 0.7; color: var(--muted);">No entities added yet.</p>`;
    } else {
      dialogHTML += `<div style="display: flex; flex-direction: column; gap: 10px;">`;
      entities.forEach((entity, index) => {
        dialogHTML += `
          <div style="
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 12px;
            background: var(--surface-hover);
            border: 1px solid var(--border);
            border-radius: 6px;
          ">
            <div style="flex: 1;">
              <div style="font-weight: bold; color: var(--text);">${entity.display_name || entity.entity_id}</div>
              <div style="font-size: 12px; opacity: 0.7; color: var(--muted);">${entity.entity_id} (${entity.type})</div>
            </div>
            <button 
              class="edit-entity-btn" 
              data-index="${index}"
              style="
                padding: 8px 14px;
                background: var(--accent);
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 500;
              "
            >Edit</button>
            <button 
              class="remove-entity-btn" 
              data-index="${index}"
              style="
                padding: 8px 14px;
                background: #f44336;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 500;
              "
            >Remove</button>
          </div>
        `;
      });
      dialogHTML += `</div>`;
    }

    dialogHTML += `
      </div>
      <div style="display: flex; gap: 12px; justify-content: space-between; border-top: 1px solid var(--border); padding-top: 15px;">
        <button id="add-new-entity-btn" style="
          padding: 10px 20px; 
          cursor: pointer; 
          background: var(--accent); 
          color: white; 
          border: none; 
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
        ">
          + Add Entity
        </button>
        <button id="close-manage-dialog" style="
          padding: 10px 20px; 
          cursor: pointer;
          background: rgba(255, 255, 255, 0.1);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: 6px;
          font-size: 14px;
        ">
          Close
        </button>
      </div>
    `;

    dialog.innerHTML = dialogHTML;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Close button
    const closeBtn = dialog.querySelector('#close-manage-dialog') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => {
      overlay.remove();
    });
    closeBtn.addEventListener('pointerdown', (e) => e.stopPropagation());

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });

    // Add new entity button
    const addBtn = dialog.querySelector('#add-new-entity-btn') as HTMLButtonElement;
    addBtn.addEventListener('click', () => {
      overlay.remove();
      this.showAddEntityDialog(widget);
    });
    addBtn.addEventListener('pointerdown', (e) => e.stopPropagation());

    // Edit entity buttons
    const editButtons = dialog.querySelectorAll('.edit-entity-btn');
    editButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt((e.target as HTMLElement).getAttribute('data-index') || '0');
        overlay.remove();
        this.showEditEntityDialog(widget, index);
      });
      btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    });

    // Remove entity buttons
    const removeButtons = dialog.querySelectorAll('.remove-entity-btn');
    removeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt((e.target as HTMLElement).getAttribute('data-index') || '0');
        
        if (confirm(`Remove ${entities[index].display_name || entities[index].entity_id}?`)) {
          entities.splice(index, 1);
          
          // Trigger widget update
          const event = new CustomEvent('widget-update', { 
            detail: { id: widget.id, content: { ...content, entities } }
          });
          document.dispatchEvent(event);
          
          overlay.remove();
        }
      });
      btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    });

    // Prevent dialog from being dragged
    dialog.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  private startAutoRefresh(widget: Widget, grid: HTMLElement): void {
    const content = widget.content as HomeAssistantContent;
    
    // Clear existing interval
    const existingInterval = this.intervals.get(widget.id);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    // Set up new interval
    const interval = (content.refreshInterval || 5) * 1000;
    const intervalId = window.setInterval(async () => {
      await this.fetchEntityStates(widget);
      this.updateEntityCards(widget, grid);
    }, interval);

    this.intervals.set(widget.id, intervalId);
  }

  cleanup(widgetId: string): void {
    // Clear auto-refresh interval
    const interval = this.intervals.get(widgetId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(widgetId);
    }

    // Remove global click listener
    const clickHandler = this.intervals.get(`${widgetId}-click`);
    if (clickHandler) {
      document.removeEventListener('click', clickHandler as any);
      this.intervals.delete(`${widgetId}-click`);
    }

    // Clear cached states
    this.entityStates.delete(widgetId);
  }
}

// Plugin configuration
export const widget = {
  type: 'home-assistant',
  name: 'Home Assistant',
  icon: '🏠',
  description: 'Monitor and control Home Assistant entities',
  renderer: new HomeAssistantRenderer(),
  defaultSize: { w: 600, h: 400 },
  defaultContent: {
    url: '',
    token: '',
    entities: [],
    refreshInterval: 5
  }
};

