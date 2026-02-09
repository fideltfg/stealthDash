import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';
import { preventWidgetKeyboardDrag } from '../types/widget';
import { credentialsService } from '../services/credentials';
import { authService } from '../services/auth';

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

interface EntityConfig {
  entity_id: string;
  display_name?: string;
  type: 'switch' | 'light' | 'sensor';
}

interface EntityGroup {
  id: string;
  label: string;
  entities: EntityConfig[];
  collapsed?: boolean;
}

interface HomeAssistantContent {
  url?: string;
  token?: string; // Deprecated - use credentialId
  credentialId?: number;
  entities?: EntityConfig[]; // Ungrouped entities
  groups?: EntityGroup[];
  refreshInterval?: number; // seconds
}

export class HomeAssistantRenderer implements WidgetRenderer {
  private intervals: Map<string, number> = new Map();
  private entityStates: Map<string, Map<string, HomeAssistantEntity>> = new Map();

  configure(widget: Widget): void {
    this.showSettingsDialog(widget);
  }

  getHeaderButtons(widget: Widget): HTMLElement[] {
    const entitiesBtn = document.createElement('button');
    entitiesBtn.innerHTML = '👻';
    entitiesBtn.title = 'Manage Entities';
    entitiesBtn.className = 'widget-settings-btn';
    entitiesBtn.onclick = (e) => {
      e.stopPropagation();
      this.showManageEntitiesDialog(widget);
    };
    entitiesBtn.addEventListener('pointerdown', (e) => e.stopPropagation());


    // Add group button
    const groupBtn = document.createElement('button');
    groupBtn.innerHTML = '+';
    groupBtn.title = 'Create new group';
    groupBtn.className = 'widget-settings-btn';
    groupBtn.onclick = (e) => {
      e.stopPropagation();
      this.createNewGroup(widget);
    };
    groupBtn.addEventListener('pointerdown', (e) => e.stopPropagation());

    return [groupBtn, entitiesBtn];
  }

  async render(container: HTMLElement, widget: Widget): Promise<void> {
    const content = widget.content as HomeAssistantContent;
    container.innerHTML = '';

    // If no URL/credential configured, show config prompt
    if (!content.url || (!content.credentialId && !content.token)) {
      this.renderConfigPrompt(container, widget);
      return;
    }

    // Check if there are any entities (either ungrouped or in groups)
    const hasUngroupedEntities = content.entities && content.entities.length > 0;
    const hasGroupedEntities = content.groups && content.groups.some(g => g.entities && g.entities.length > 0);
    
    // If no entities configured anywhere, show add entities prompt
    if (!hasUngroupedEntities && !hasGroupedEntities) {
      this.renderNoEntitiesPrompt(container, widget);
      return;
    }

    // Render entities
    await this.renderEntities(container, widget);
  }

  private renderConfigPrompt(container: HTMLElement, widget: Widget): void {
    const content = widget.content as HomeAssistantContent;
    const prompt = document.createElement('div');
    prompt.className = 'text-center p-4';
    prompt.innerHTML = `
      <div class="mx-auto" style="max-width: 400px;">
        <div class="display-1 mb-3"><i class="fa-regular fa-house"></i></div>
        <h3 class="h5 mb-3">Configure Home Assistant</h3>
        <div class="d-flex flex-column gap-3">
          <div>
            <label class="form-label text-start w-100">Home Assistant URL:</label>
            <input type="text" id="ha-url" placeholder="http://homeassistant.local:8123" 
                   class="form-control" 
                   value="${content.url || ''}">
          </div>
          <div>
            <label class="form-label text-start w-100">Credentials:</label>
            <select id="ha-credential" class="form-select">
              <option value="">Select saved credential...</option>
            </select>
            <div class="form-text text-start">
              <i class="fas fa-lightbulb"></i> Tip: Create Home Assistant credentials from the user menu (<i class="fas fa-key"></i> Credentials). Store your long-lived access token from Profile → Security → Long-Lived Access Tokens
            </div>
          </div>
          <button id="save-ha-config" class="btn btn-primary">
            Save Configuration
          </button>
        </div>
      </div>
    `;
    container.appendChild(prompt);

    // Load credentials
    const credentialSelect = prompt.querySelector('#ha-credential') as HTMLSelectElement;
    (async () => {
      try {
        const credentials = await credentialsService.getAll();
        credentials.forEach(cred => {
          const option = document.createElement('option');
          option.value = cred.id.toString();
          option.textContent = `🔑 ${cred.name}${cred.description ? ` - ${cred.description}` : ''}`;
          credentialSelect.appendChild(option);
        });
        if (content.credentialId) {
          credentialSelect.value = content.credentialId.toString();
        }
      } catch (error) {
        console.error('Failed to load credentials:', error);
      }
    })();

    // Save button handler
    const saveBtn = prompt.querySelector('#save-ha-config') as HTMLButtonElement;
    const urlInput = prompt.querySelector('#ha-url') as HTMLInputElement;

    saveBtn.addEventListener('click', () => {
      const url = urlInput.value.trim();
      const credId = credentialSelect.value;

      if (!url || !credId) {
        alert('Please enter URL and select a credential');
        return;
      }

      // Trigger widget update
      const event = new CustomEvent('widget-update', {
        detail: { id: widget.id, content: { ...content, url, credentialId: parseInt(credId) } }
      });
      document.dispatchEvent(event);
    });

    // Stop propagation so widget isn't dragged
    [urlInput, credentialSelect, saveBtn].forEach(el => {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      // Prevent keyboard events from bubbling up to widget drag handlers
      if (el instanceof HTMLInputElement) {
        preventWidgetKeyboardDrag(el);
      } else if (el instanceof HTMLSelectElement) {
        el.addEventListener('keydown', (e) => e.stopPropagation());
        el.addEventListener('keyup', (e) => e.stopPropagation());
      }
    });
  }

  private renderNoEntitiesPrompt(container: HTMLElement, widget: Widget): void {
    const prompt = document.createElement('div');
    prompt.className = 'text-center p-4';
    prompt.innerHTML = `
      <div>
        <div class="display-1 mb-3"><i class="fas fa-home"></i></div>
        <h3 class="h5 mb-3">No Entities Added</h3>
        <p class="text-muted mb-3">Add Home Assistant entities to monitor and control.</p>
        <button id="add-entity-btn" class="btn btn-primary">
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

    // Create main container
    const mainContainer = document.createElement('div');
    mainContainer.className = 'flex flex-col gap-16';
    container.appendChild(mainContainer);

    const entities = content.entities || [];
    const groups = content.groups || [];

    // Render ungrouped entities (without a section header)
    if (entities.length > 0) {
      const ungroupedGrid = document.createElement('div');
      ungroupedGrid.className = 'grid-auto gap-8';

      // Make it a drop zone for ungrouped entities
      ungroupedGrid.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer!.dropEffect = 'move';
        ungroupedGrid.classList.add('ha-drop-highlight');
      });

      ungroupedGrid.addEventListener('dragleave', (e) => {
        if (e.target === ungroupedGrid) {
          ungroupedGrid.classList.remove('ha-drop-highlight');
        }
      });

      ungroupedGrid.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        ungroupedGrid.classList.remove('ha-drop-highlight');

        const dragData = e.dataTransfer!.getData('text/plain');
        const [sourceGroupId, entityId] = dragData.split('|');

        if (sourceGroupId !== 'ungrouped') {
          await this.moveEntityToGroup(widget, entityId, sourceGroupId, 'ungrouped');
        }
      });

      entities.forEach((entity, index) => {
        const card = this.createEntityCard(entity, widget, `ungrouped-${index}`, null);
        ungroupedGrid.appendChild(card);
      });

      mainContainer.appendChild(ungroupedGrid);
    }

    // Render each group
    groups.forEach((group) => {
      const groupSection = this.createSection(group.label, group, widget);
      mainContainer.appendChild(groupSection);
      
      const groupGrid = groupSection.querySelector('.grid-auto') as HTMLElement;
      group.entities.forEach((entity, index) => {
        const card = this.createEntityCard(entity, widget, `${group.id}-${index}`, group.id);
        groupGrid.appendChild(card);
      });
    });

    // Fetch current states and update cards
    await this.fetchEntityStates(widget);
    this.updateEntityCards(widget, mainContainer);

    // Start auto-refresh
    this.startAutoRefresh(widget, mainContainer);
  }

  private createEntityCard(
    entity: EntityConfig,
    widget: Widget,
    cardId: string,
    groupId: string | null
  ): HTMLElement {
    const widgetStates = this.entityStates.get(widget.id) || new Map();
    const state = widgetStates.get(entity.entity_id);
    const card = document.createElement('div');
    card.className = 'card flex-between items-center';
    card.draggable = true;
    card.dataset.cardId = cardId;
    card.dataset.entityId = entity.entity_id;
    card.dataset.groupId = groupId || 'ungrouped';

    // Drag handlers
    card.addEventListener('dragstart', (e) => {
      // Prevent dragging when dashboard is locked
      const isLocked = document.getElementById('app')?.classList.contains('locked');
      if (isLocked) {
        e.preventDefault();
        return;
      }
      
      e.stopPropagation();
      card.classList.add('dragging');
      e.dataTransfer!.effectAllowed = 'move';
      const sourceGroupId = card.dataset.groupId || 'ungrouped';
      e.dataTransfer!.setData('text/plain', `${sourceGroupId}|${entity.entity_id}`);
    });
    
    card.addEventListener('dragend', (e) => {
      e.stopPropagation();
      card.classList.remove('dragging');
    });

    // Make card a drop target for reordering within same group
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dragging = document.querySelector('.dragging');
      if (dragging && dragging !== card) {
        e.dataTransfer!.dropEffect = 'move';
        card.classList.add('ha-drop-target');
      }
    });

    card.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      card.classList.remove('ha-drop-target');
    });

    card.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      card.classList.remove('ha-drop-target');
      
      const dragData = e.dataTransfer!.getData('text/plain');
      const [sourceGroupId, draggedEntityId] = dragData.split('|');
      const targetGroupId = card.dataset.groupId || 'ungrouped';
      const targetEntityId = entity.entity_id;

      if (draggedEntityId !== targetEntityId) {
        if (sourceGroupId === targetGroupId) {
          // Reorder within same group
          await this.reorderEntity(widget, draggedEntityId, targetEntityId, targetGroupId);
        } else {
          // Move between groups and place before target
          await this.moveEntityToGroup(widget, draggedEntityId, sourceGroupId, targetGroupId, targetEntityId);
        }
      }
    });

    // Context menu for ungrouping
    if (groupId) {
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Remove any existing context menus
        document.querySelectorAll('.ha-context-menu').forEach(m => m.remove());
        
        // Create context menu
        const menu = document.createElement('div');
        menu.className = 'ha-context-menu';
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
        
        const ungroupOption = document.createElement('div');
        ungroupOption.className = 'ha-context-menu-item';
        ungroupOption.textContent = '↑ Ungroup';
        
        ungroupOption.addEventListener('click', async () => {
          await this.moveEntityToGroup(widget, entity.entity_id, groupId, 'ungrouped');
          if (menu.parentNode) {
            document.body.removeChild(menu);
          }
        });
        
        menu.appendChild(ungroupOption);
        document.body.appendChild(menu);
        
        // Close menu on any click outside
        const closeMenu = (e: MouseEvent) => {
          if (!menu.contains(e.target as Node)) {
            if (menu.parentNode) {
              document.body.removeChild(menu);
            }
            document.removeEventListener('click', closeMenu);
          }
        };
        
        setTimeout(() => {
          document.addEventListener('click', closeMenu);
        }, 0);
      });
    }

    // Entity name
    const name = document.createElement('div');
    name.className = 'text-base text-white flex-1';
    name.textContent = entity.display_name || state?.attributes.friendly_name || entity.entity_id;
    card.appendChild(name);

    // Control based on type
    if (entity.type === 'switch' || entity.type === 'light') {
      
      // Toggle switch wrapper
      const toggleWrapper = document.createElement('label');
      toggleWrapper.className = 'ha-toggle-wrapper';

      // Hidden checkbox for state
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = state?.state === 'on';

      // Slider
      const slider = document.createElement('span');
      slider.className = 'ha-toggle-slider';
      slider.style.background = state?.state === 'on' ? '#4CAF50' : '#666';

      // Slider button
      const sliderButton = document.createElement('span');
      sliderButton.style.left = state?.state === 'on' ? '27px' : '3px';
      slider.appendChild(sliderButton);

      toggleWrapper.appendChild(checkbox);
      toggleWrapper.appendChild(slider);

      // Prevent dragging when interacting with the toggle
      toggleWrapper.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });
      toggleWrapper.addEventListener('dragstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      // Click handler
      toggleWrapper.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Show loading state
        const isCurrentlyOn = checkbox.checked;
        slider.style.opacity = '0.6';
        slider.style.cursor = 'not-allowed';
        toggleWrapper.style.pointerEvents = 'none';

        try {
          await this.toggleEntity(entity.entity_id, widget);
          // Refresh state and update cards
          await this.fetchEntityStates(widget);
          const widgetElement = document.querySelector(`[data-widget-id="${widget.id}"]`);
          if (widgetElement) {
            const mainContainer = widgetElement.querySelector('.widget-content') as HTMLElement;
            if (mainContainer) {
              this.updateEntityCards(widget, mainContainer);
            }
          }
        } catch (error) {
          // Restore original state on error
          checkbox.checked = isCurrentlyOn;
          slider.style.background = isCurrentlyOn ? '#4CAF50' : '#666';
          sliderButton.style.left = isCurrentlyOn ? '27px' : '3px';
          slider.style.opacity = '1';
          slider.style.cursor = 'pointer';
          toggleWrapper.style.pointerEvents = 'auto';
        }
      });
      toggleWrapper.addEventListener('pointerdown', (e) => e.stopPropagation());

      card.appendChild(toggleWrapper);
    } else if (entity.type === 'sensor') {
      // Display sensor value
      const valueDisplay = document.createElement('div');
      valueDisplay.className = 'text-sm text-white';
      
      if (state) {
        const unit = state.attributes.unit_of_measurement || '';
        const stateValue = state.state.toLowerCase();
        
        if (stateValue === 'unavailable' || stateValue === 'unknown') {
          valueDisplay.textContent = `⚠ ERROR`;
          valueDisplay.classList.add('alarm-flash-error');
        } else {
          valueDisplay.textContent = `${state.state} ${unit}`.trim();
          valueDisplay.style.color = '#4CAF50';
        }
      } else {
        valueDisplay.textContent = '—';
        valueDisplay.style.color = '#666';
      }
      
      card.appendChild(valueDisplay);
    }

    return card;
  }

  private updateEntityCards(widget: Widget, mainContainer: HTMLElement): void {
    const widgetStates = this.entityStates.get(widget.id) || new Map();

    // Update all entity cards - find by entity-id data attribute
    mainContainer.querySelectorAll('[data-entity-id]').forEach((card) => {
      const htmlCard = card as HTMLElement;
      const entityId = htmlCard.dataset.entityId;
      if (!entityId) return;

      const state = widgetStates.get(entityId);
      if (!state) return;

      // Update entity name if we got friendly name from state
      const nameDiv = htmlCard.querySelector('.text-base.text-white.flex-1') as HTMLElement;
      if (nameDiv && state.attributes.friendly_name) {
        nameDiv.textContent = state.attributes.friendly_name;
      }

      // Update toggle switch for switches/lights
      const checkbox = htmlCard.querySelector('input[type="checkbox"]') as HTMLInputElement;
      const slider = htmlCard.querySelector('.ha-toggle-slider') as HTMLElement;
      const sliderButton = slider?.querySelector('span') as HTMLElement;
      const toggleWrapper = htmlCard.querySelector('.ha-toggle-wrapper') as HTMLElement;

      if (checkbox && slider && sliderButton) {
        const isOn = state.state === 'on';
        checkbox.checked = isOn;
        slider.style.background = isOn ? '#4CAF50' : '#666';
        sliderButton.style.left = isOn ? '27px' : '3px';
        // Restore interactive state
        slider.style.opacity = '1';
        slider.style.cursor = 'pointer';
        if (toggleWrapper) {
          toggleWrapper.style.pointerEvents = 'auto';
        }
      }
      
      // Update sensor value
      const valueDisplay = htmlCard.querySelector('.text-sm.text-white') as HTMLElement;
      if (valueDisplay) {
        const unit = state.attributes.unit_of_measurement || '';
        const stateValue = state.state.toLowerCase();
        
        // Remove any existing alarm classes and inline styles
        valueDisplay.classList.remove('alarm-flash-error');
        valueDisplay.style.removeProperty('color');
        valueDisplay.style.removeProperty('background-color');
        
        if (stateValue === 'unavailable' || stateValue === 'unknown') {
          valueDisplay.textContent = `⚠ ERROR`;
          valueDisplay.classList.add('alarm-flash-error');
        } else {
          valueDisplay.textContent = `${state.state} ${unit}`.trim();
          valueDisplay.style.color = '#4CAF50';
        }
      }
    });
  }

  private async fetchEntityStates(widget: Widget): Promise<void> {
    const content = widget.content as HomeAssistantContent;
    if (!content.url || (!content.credentialId && !content.token)) return;

    try {
      // Use ping-server proxy to avoid CORS issues
      const pingServerUrl = this.getPingServerUrl();
      
      let response;
      if (content.credentialId) {
        // Use credentialId (new method)
        response = await fetch(`${pingServerUrl}/home-assistant/states`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authService.getToken() || ''}`
          },
          body: JSON.stringify({
            url: content.url,
            credentialId: content.credentialId
          })
        });
      } else {
        // Legacy: use token directly
        response = await fetch(`${pingServerUrl}/home-assistant/states`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url: content.url,
            token: content.token
          })
        });
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const allStates: HomeAssistantEntity[] = await response.json();

      // Store states for this widget
      const widgetStates = new Map<string, HomeAssistantEntity>();
      
      // Fetch states for ungrouped entities
      const entities = content.entities || [];
      for (const entity of entities) {
        const state = allStates.find(s => s.entity_id === entity.entity_id);
        if (state) {
          widgetStates.set(entity.entity_id, state);
        }
      }
      
      // Fetch states for entities in groups
      const groups = content.groups || [];
      for (const group of groups) {
        for (const entity of group.entities) {
          const state = allStates.find(s => s.entity_id === entity.entity_id);
          if (state) {
            widgetStates.set(entity.entity_id, state);
          }
        }
      }
      
      this.entityStates.set(widget.id, widgetStates);
    } catch (error) {
      console.error('Failed to fetch entity states:', error);
    }
  }

  private async toggleEntity(entityId: string, widget: Widget): Promise<void> {
    const content = widget.content as HomeAssistantContent;
    if (!content.url || (!content.credentialId && !content.token)) return;

    try {
      const widgetStates = this.entityStates.get(widget.id) || new Map();
      const domain = entityId.split('.')[0];
      const service = widgetStates.get(entityId)?.state === 'on' ? 'turn_off' : 'turn_on';

      // Use ping-server proxy to avoid CORS issues
      const pingServerUrl = this.getPingServerUrl();
      
      let response;
      if (content.credentialId) {
        // Use credentialId (new method)
        response = await fetch(`${pingServerUrl}/home-assistant/service?credentialId=${content.credentialId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authService.getToken() || ''}`
          },
          body: JSON.stringify({
            url: content.url,
            domain,
            service,
            entity_id: entityId
          })
        });
      } else {
        // Legacy: use token directly
        response = await fetch(`${pingServerUrl}/home-assistant/service`, {
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
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to toggle entity:', error);
      alert(`Failed to toggle ${entityId}: ${error}`);
    }
  }

  private async toggleEntityToState(entityId: string, widget: Widget, turnOn: boolean): Promise<void> {
    const content = widget.content as HomeAssistantContent;
    if (!content.url || (!content.credentialId && !content.token)) return;

    try {
      const domain = entityId.split('.')[0];
      const service = turnOn ? 'turn_on' : 'turn_off';

      // Use ping-server proxy to avoid CORS issues
      const pingServerUrl = this.getPingServerUrl();
      
      let response;
      if (content.credentialId) {
        response = await fetch(`${pingServerUrl}/home-assistant/service`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authService.getToken() || ''}`
          },
          body: JSON.stringify({
            url: content.url,
            credentialId: content.credentialId,
            domain,
            service,
            entity_id: entityId
          })
        });
      } else {
        response = await fetch(`${pingServerUrl}/home-assistant/service`, {
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
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error(`Failed to ${turnOn ? 'turn on' : 'turn off'} entity:`, error);
      throw error;
    }
  }

  private getPingServerUrl(): string {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    return `${protocol}//${hostname}:3001`;
  }

  private async fetchAllEntities(widget: Widget): Promise<HomeAssistantEntity[]> {
    const content = widget.content as HomeAssistantContent;
    if (!content.url || (!content.credentialId && !content.token)) return [];

    try {
      const pingServerUrl = this.getPingServerUrl();
      
      let response;
      if (content.credentialId) {
        response = await fetch(`${pingServerUrl}/home-assistant/states`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authService.getToken() || ''}`
          },
          body: JSON.stringify({
            url: content.url,
            credentialId: content.credentialId
          })
        });
      } else {
        response = await fetch(`${pingServerUrl}/home-assistant/states`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url: content.url,
            token: content.token
          })
        });
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const allStates: HomeAssistantEntity[] = await response.json();
      return allStates;
    } catch (error) {
      console.error('Failed to fetch all entities:', error);
      throw error;
    }
  }

  private async showAddEntityDialog(widget: Widget): Promise<void> {
    const content = widget.content as HomeAssistantContent;

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'widget-overlay dark';

    const dialog = document.createElement('div');
    dialog.className = 'widget-dialog extended large';

    dialog.innerHTML = `
      <h3>Add Entity</h3>
      <div class="widget-dialog-field">
        <label class="widget-dialog-label medium">Search Entity:</label>
        <input type="text" id="entity-search" placeholder="Search entities..." class="widget-dialog-input extended">
      </div>
      <div id="entity-list-container" class="flex flex-col gap-8 p-8 overflow-auto" style="max-height: 300px;">
        <div class="text-center text-gray">
          Loading entities...
        </div>
      </div>
      <div class="widget-dialog-field">
        <label class="widget-dialog-label medium">Display Name (optional):</label>
        <input type="text" id="display-name" placeholder="Custom display name" class="widget-dialog-input extended">
      </div>
      <div class="widget-dialog-buttons">
        <button id="cancel-entity" class="widget-dialog-button-cancel extended">Cancel</button>
        <button id="save-entity" disabled class="widget-dialog-button-save extended">Add Entity</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const searchInput = dialog.querySelector('#entity-search') as HTMLInputElement;
    const entityListContainer = dialog.querySelector('#entity-list-container') as HTMLElement;
    const displayNameInput = dialog.querySelector('#display-name') as HTMLInputElement;
    const cancelBtn = dialog.querySelector('#cancel-entity') as HTMLButtonElement;
    const saveBtn = dialog.querySelector('#save-entity') as HTMLButtonElement;

    let selectedEntity: HomeAssistantEntity | null = null;
    let allEntities: HomeAssistantEntity[] = [];

    // Fetch entities
    try {
      allEntities = await this.fetchAllEntities(widget);

      if (allEntities.length === 0) {
        entityListContainer.innerHTML = `
          <div class="text-center text-gray">
            No entities found in Home Assistant
          </div>
        `;
      } else {
        renderEntityList(allEntities);
      }
    } catch (error) {
      entityListContainer.innerHTML = `
        <div class="text-center text-gray">
          Failed to load entities: ${error}
        </div>
      `;
    }

    function renderEntityList(entities: HomeAssistantEntity[]) {
      if (entities.length === 0) {
        entityListContainer.innerHTML = `
          <div class="text-center text-gray">
            No matching entities found
          </div>
        `;
        return;
      }

      entityListContainer.innerHTML = '';
      entities.forEach(entity => {
        const item = document.createElement('div');
        item.className = 'card cursor-pointer';
        item.style.padding = '8px';
        
        const domain = entity.entity_id.split('.')[0];
        const icon = domain === 'light' ? '<i class="fas fa-lightbulb"></i>' : domain === 'switch' ? '<i class="fas fa-plug"></i>' : domain === 'sensor' ? '<i class="fas fa-chart-bar"></i>' : '<i class="fas fa-home"></i>';
        
        item.innerHTML = `
          <div class="flex items-center gap-12">
            <div class="text-accent">${icon}</div>
            <div class="flex-1">
              <div class="text-base text-white">${entity.attributes.friendly_name || entity.entity_id}</div>
              <div class="text-xs text-gray">${entity.entity_id}</div>
            </div>
            <div class="status-badge">${domain}</div>
          </div>
        `;

        item.addEventListener('click', () => {
          // Deselect all
          entityListContainer.querySelectorAll('.card').forEach(el => {
            el.classList.remove('selected');
          });

          // Select this one
          item.classList.add('selected');
          selectedEntity = entity;
          
          // Auto-fill display name if empty
          if (!displayNameInput.value) {
            displayNameInput.value = entity.attributes.friendly_name || entity.entity_id;
          }

          // Enable save button
          saveBtn.disabled = false;
          saveBtn.style.opacity = '1';
          saveBtn.style.cursor = 'pointer';
        });

        item.addEventListener('pointerdown', (e) => e.stopPropagation());
        entityListContainer.appendChild(item);
      });
    }

    // Search filter
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.toLowerCase();
      const filtered = allEntities.filter(entity => 
        entity.entity_id.toLowerCase().includes(query) ||
        (entity.attributes.friendly_name?.toLowerCase().includes(query))
      );
      renderEntityList(filtered);
    });

    // Stop propagation for all inputs
    [searchInput, displayNameInput, cancelBtn, saveBtn].forEach(el => {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      // Prevent keyboard events from bubbling up to widget drag handlers
      if (el instanceof HTMLInputElement) {
        preventWidgetKeyboardDrag(el);
      }
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
      if (!selectedEntity) {
        alert('Please select an entity');
        return;
      }

      const displayName = displayNameInput.value.trim();
      const domain = selectedEntity.entity_id.split('.')[0];
      
      // Determine type based on domain
      let type: 'light' | 'switch' | 'sensor' = 'sensor';
      if (domain === 'light') type = 'light';
      else if (domain === 'switch') type = 'switch';

      const entities = content.entities || [];
      
      // Check if entity already exists
      if (entities.some(e => e.entity_id === selectedEntity!.entity_id)) {
        alert('This entity has already been added');
        return;
      }

      entities.push({
        entity_id: selectedEntity.entity_id,
        display_name: displayName || undefined,
        type: type
      });

      overlay.remove();

      // Update widget content
      content.entities = entities;
      
      // Update dashboard state and save
      const dashboard = (window as any).dashboard;
      if (dashboard && dashboard.state && dashboard.state.widgets) {
        const widgetInState = dashboard.state.widgets.find((w: Widget) => w.id === widget.id);
        if (widgetInState) {
          if (!widgetInState.content) widgetInState.content = {};
          (widgetInState.content as HomeAssistantContent).entities = entities;
        }
      }

      // Trigger widget update for UI refresh
      const event = new CustomEvent('widget-update', {
        detail: { id: widget.id, content: { ...content, entities } }
      });
      document.dispatchEvent(event);
    });

    // Prevent dialog from being dragged
    dialog.addEventListener('pointerdown', (e) => e.stopPropagation());
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
    overlay.className = 'widget-overlay dark';

    const dialog = document.createElement('div');
    dialog.className = 'widget-dialog extended large';

    dialog.innerHTML = `
      <h3>Edit Entity</h3>
      <div class="widget-dialog-field">
        <label class="widget-dialog-label medium">Entity ID:</label>
        <input type="text" id="edit-entity-id" placeholder="light.living_room" 
               value="${entity.entity_id}"
               class="widget-dialog-input extended">
        <small class="ha-dialog-hint">Example: light.kitchen, switch.fan, sensor.temperature</small>
      </div>
      <div class="widget-dialog-field">
        <label class="widget-dialog-label medium">Display Name (optional):</label>
        <input type="text" id="edit-display-name" placeholder="Living Room Light" 
               value="${entity.display_name || ''}"
               class="widget-dialog-input extended">
      </div>
      <div class="widget-dialog-field">
        <label class="widget-dialog-label medium">Type:</label>
        <select id="edit-entity-type" class="widget-dialog-input extended">
          <option value="light" ${entity.type === 'light' ? 'selected' : ''}>Light</option>
          <option value="switch" ${entity.type === 'switch' ? 'selected' : ''}>Switch</option>
          <option value="sensor" ${entity.type === 'sensor' ? 'selected' : ''}>Sensor</option>
        </select>
      </div>
      <div class="widget-dialog-buttons">
        <button id="cancel-edit-entity" class="widget-dialog-button-cancel extended">Cancel</button>
        <button id="save-edit-entity" class="widget-dialog-button-save extended">Save Changes</button>
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
      // Prevent keyboard events from bubbling up to widget drag handlers
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
        preventWidgetKeyboardDrag(el);
      }
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

      // Update widget content
      content.entities = entities;
      
      // Update dashboard state and save
      const dashboard = (window as any).dashboard;
      if (dashboard && dashboard.state && dashboard.state.widgets) {
        const widgetInState = dashboard.state.widgets.find((w: Widget) => w.id === widget.id);
        if (widgetInState) {
          if (!widgetInState.content) widgetInState.content = {};
          (widgetInState.content as HomeAssistantContent).entities = entities;
        }
      }

      // Trigger widget update
      const event = new CustomEvent('widget-update', {
        detail: { id: widget.id, content: { ...content, entities } }
      });
      document.dispatchEvent(event);

      // Return to manage entities dialog to show updated list
      this.showManageEntitiesDialog(widget);
    });
  }

  private async showSettingsDialog(widget: Widget): Promise<void> {
    const content = widget.content as HomeAssistantContent;

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'widget-overlay dark';

    const dialog = document.createElement('div');
    dialog.className = 'widget-dialog extended large';

    // Load credentials for the selector
    const credentials = await credentialsService.getAll();
    const homeAssistantCredentials = credentials.filter(c => c.service_type === 'home_assistant');

    const credentialOptions = homeAssistantCredentials
      .map(c => `<option value="${c.id}" ${content.credentialId === c.id ? 'selected' : ''}>${c.name}</option>`)
      .join('');

    dialog.innerHTML = `
      <h3 class="ha-dialog-title">⚙️ Home Assistant Settings</h3>
      
      <div class="widget-dialog-field">
        <label class="widget-dialog-label medium">
          Home Assistant URL
        </label>
        <input 
          type="text" 
          id="ha-url-input" 
          class="widget-dialog-input extended"
          placeholder="http://homeassistant.local:8123"
          value="${content.url || ''}"
        />
        <small class="ha-dialog-hint">
          The base URL of your Home Assistant instance
        </small>
      </div>

      <div class="widget-dialog-field">
        <label class="widget-dialog-label medium">
          Saved Credential
        </label>
        <select 
          id="ha-credential-select"
          class="widget-dialog-input extended"
        >
          <option value="">Select saved credential...</option>
          ${credentialOptions}
        </select>
        <small class="ha-dialog-hint">
          Use saved credentials instead of storing token directly
        </small>
      </div>

      <div class="widget-dialog-field">
        <label class="widget-dialog-label medium">
          Or Enter Token Directly (Legacy)
        </label>
        <input 
          type="password" 
          id="ha-token-input" 
          class="widget-dialog-input extended"
          placeholder="Enter your access token"
          value="${content.token || ''}"
        />
        <small class="ha-dialog-hint">
          Create in Home Assistant: Profile → Security → Long-Lived Access Tokens
        </small>
      </div>

      <div class="widget-dialog-field">
        <label class="widget-dialog-label medium">
          Refresh Interval (seconds)
        </label>
        <input 
          type="number" 
          id="ha-refresh-input" 
          class="widget-dialog-input extended"
          min="1"
          max="300"
          value="${content.refreshInterval || 5}"
        />
        <small class="ha-dialog-hint">
          How often to refresh entity states
        </small>
      </div>

      <div class="widget-dialog-buttons">
        <button id="cancel-settings-btn" class="widget-dialog-button-cancel extended">
          Cancel
        </button>
        <button id="save-settings-btn" class="widget-dialog-button-save extended">
          Save Settings
        </button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Get input elements
    const urlInput = dialog.querySelector('#ha-url-input') as HTMLInputElement;
    const credentialSelect = dialog.querySelector('#ha-credential-select') as HTMLSelectElement;
    const tokenInput = dialog.querySelector('#ha-token-input') as HTMLInputElement;
    const refreshInput = dialog.querySelector('#ha-refresh-input') as HTMLInputElement;
    const saveBtn = dialog.querySelector('#save-settings-btn') as HTMLButtonElement;
    const cancelBtn = dialog.querySelector('#cancel-settings-btn') as HTMLButtonElement;

    // Stop propagation for all inputs
    [urlInput, credentialSelect, tokenInput, refreshInput, saveBtn, cancelBtn].forEach(el => {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
        preventWidgetKeyboardDrag(el);
      }
    });

    // Save button handler
    saveBtn.addEventListener('click', () => {
      const url = urlInput.value.trim();
      const credentialId = credentialSelect.value ? parseInt(credentialSelect.value) : undefined;
      const token = tokenInput.value.trim();
      const refreshInterval = parseInt(refreshInput.value);

      if (!url) {
        alert('Please enter Home Assistant URL');
        return;
      }

      if (!credentialId && !token) {
        alert('Please select a saved credential or enter a token');
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
            credentialId,
            token: credentialId ? undefined : token, // Clear token if using credentialId
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
    
    // Prevent keyboard events from bubbling up to widget drag handlers
    [urlInput, tokenInput, refreshInput].forEach(input => {
      input.addEventListener('pointerdown', (e) => e.stopPropagation());
      preventWidgetKeyboardDrag(input);
    });
  }

  private showManageEntitiesDialog(widget: Widget): void {
    const content = widget.content as HomeAssistantContent;

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'widget-overlay dark';

    const dialog = document.createElement('div');
    dialog.className = 'widget-dialog extended large';

    // Collect all entities (ungrouped and grouped)
    const allEntities: Array<{ entity: EntityConfig; groupId: string | null; groupName: string | null }> = [];
    
    // Add ungrouped entities
    (content.entities || []).forEach(entity => {
      allEntities.push({ entity, groupId: null, groupName: null });
    });
    
    // Add grouped entities
    (content.groups || []).forEach(group => {
      group.entities.forEach(entity => {
        allEntities.push({ entity, groupId: group.id, groupName: group.label });
      });
    });

    let dialogHTML = `
      <h3 class="ha-dialog-title">Manage Entities</h3>
      <div class="ha-manage-entities-list">
    `;

    if (allEntities.length === 0) {
      dialogHTML += `<p class="ha-dialog-hint">No entities added yet.</p>`;
    } else {
      dialogHTML += `<div class="ha-entity-items">`;
      allEntities.forEach((item, index) => {
        const groupBadge = item.groupName ? `<span class="ha-entity-group-badge">${item.groupName}</span>` : '<span class="ha-entity-group-badge ha-entity-ungrouped">Ungrouped</span>';
        dialogHTML += `
          <div class="ha-entity-item">
            <div class="ha-entity-item-info">
              <div class="ha-entity-item-name">${item.entity.display_name || item.entity.entity_id}</div>
              <div class="ha-entity-item-id">${item.entity.entity_id} (${item.entity.type}) ${groupBadge}</div>
            </div>
            <button 
              class="edit-entity-btn ha-entity-item-button ha-entity-item-button-edit" 
              data-index="${index}"
              data-group-id="${item.groupId || ''}"
            >Edit</button>
            <button 
              class="remove-entity-btn ha-entity-item-button ha-entity-item-button-remove" 
              data-index="${index}"
              data-group-id="${item.groupId || ''}"
              data-entity-id="${item.entity.entity_id}"
            >Remove</button>
          </div>
        `;
      });
      dialogHTML += `</div>`;
    }

    dialogHTML += `
      </div>
      <div class="widget-dialog-buttons spaced">
        <button id="add-new-entity-btn" class="widget-dialog-button-save extended">
          + Add Entity
        </button>
        <button id="close-manage-dialog" class="widget-dialog-button-cancel extended">
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
        const target = e.target as HTMLElement;
        const index = parseInt(target.getAttribute('data-index') || '0');
        const groupId = target.getAttribute('data-group-id') || null;
        const entityId = target.getAttribute('data-entity-id') || '';
        
        const item = allEntities[index];

        if (confirm(`Remove ${item.entity.display_name || item.entity.entity_id}?`)) {
          // Remove from the correct location
          if (groupId) {
            // Remove from group
            const groups = content.groups || [];
            const group = groups.find(g => g.id === groupId);
            if (group) {
              group.entities = group.entities.filter(e => e.entity_id !== entityId);
            }
          } else {
            // Remove from ungrouped entities
            const entities = content.entities || [];
            const entityIndex = entities.findIndex(e => e.entity_id === entityId);
            if (entityIndex !== -1) {
              entities.splice(entityIndex, 1);
            }
            content.entities = entities;
          }
          
          // Trigger widget update
          const event = new CustomEvent('widget-update', {
            detail: { id: widget.id, content }
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

  private createSection(label: string, group: EntityGroup | null, widget: Widget): HTMLElement {
    const section = document.createElement('div');
    section.className = 'flex flex-col gap-8';
    
    if (group) {
      section.dataset.groupId = group.id;
    }

    // Header with label and controls
    const header = document.createElement('div');
    header.className = 'flex-between items-center';

    const labelEl = document.createElement('div');
    labelEl.className = 'text-lg text-white';
    labelEl.textContent = label;
    header.appendChild(labelEl);

    // Controls for groups (not ungrouped)
    if (group) {
      const controls = document.createElement('div');
      controls.className = 'flex gap-8';

      const deleteBtn = document.createElement('button');
      deleteBtn.innerHTML = '🗑️';
      deleteBtn.title = 'Delete group';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Prevent deletion when dashboard is locked
        const isLocked = document.getElementById('app')?.classList.contains('locked');
        if (isLocked) return;
        
        this.deleteGroup(widget, group.id);
      });

      controls.appendChild(deleteBtn);
      header.appendChild(controls);
    }

    section.appendChild(header);

    // Grid for entities with drop zone
    const grid = document.createElement('div');
    grid.className = 'grid-auto gap-8';

    // Make the grid a drop zone
    grid.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer!.dropEffect = 'move';
      grid.classList.add('ha-drop-highlight');
    });

    grid.addEventListener('dragleave', (e) => {
      if (e.target === grid) {
        grid.classList.remove('ha-drop-highlight');
      }
    });

    grid.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      grid.classList.remove('ha-drop-highlight');

      const dragData = e.dataTransfer!.getData('text/plain');
      const [sourceGroupId, entityId] = dragData.split('|');
      const targetGroupId = group?.id || 'ungrouped';

      if (sourceGroupId !== targetGroupId) {
        await this.moveEntityToGroup(widget, entityId, sourceGroupId, targetGroupId);
      }
    });

    section.appendChild(grid);
    return section;
  }

  private async createNewGroup(widget: Widget): Promise<void> {
    const label = prompt('Enter group name:');
    if (!label) return;

    const content = widget.content as HomeAssistantContent;
    
    const newGroup: EntityGroup = {
      id: `group-${Date.now()}`,
      label,
      entities: [],
      collapsed: false
    };

    const updatedGroups = [...(content.groups || []), newGroup];
    
    // Trigger widget update event - this will save to database
    const event = new CustomEvent('widget-update', {
      detail: { 
        id: widget.id, 
        content: {
          url: content.url,
          credentialId: content.credentialId,
          entities: content.entities || [],
          groups: updatedGroups,
          refreshInterval: content.refreshInterval
        }
      }
    });
    document.dispatchEvent(event);
  }

  private async deleteGroup(widget: Widget, groupId: string): Promise<void> {
    // Prevent deletion when dashboard is locked
    const isLocked = document.getElementById('app')?.classList.contains('locked');
    if (isLocked) return;
    
    if (!confirm('Delete this group? Entities will be moved to Ungrouped.')) return;

    const content = widget.content as HomeAssistantContent;
    const groups = content.groups || [];
    const group = groups.find(g => g.id === groupId);
    
    if (!group) return;

    // Move all entities back to ungrouped
    const updatedEntities = [...(content.entities || []), ...group.entities];
    const updatedGroups = groups.filter(g => g.id !== groupId);
    
    // Trigger widget update event - this will save to database
    const event = new CustomEvent('widget-update', {
      detail: { 
        id: widget.id, 
        content: {
          url: content.url,
          credentialId: content.credentialId,
          entities: updatedEntities,
          groups: updatedGroups,
          refreshInterval: content.refreshInterval
        }
      }
    });
    document.dispatchEvent(event);
  }

  private async moveEntityToGroup(widget: Widget, entityId: string, sourceGroupId: string, targetGroupId: string, beforeEntityId?: string): Promise<void> {
    const content = widget.content as HomeAssistantContent;
    let entity: EntityConfig | undefined;

    // Create new arrays to avoid mutation issues
    const entities = [...(content.entities || [])];
    const groups = JSON.parse(JSON.stringify(content.groups || [])) as EntityGroup[];

    // Find and remove entity from source
    if (sourceGroupId === 'ungrouped') {
      const index = entities.findIndex(e => e.entity_id === entityId);
      if (index >= 0) {
        entity = entities.splice(index, 1)[0];
      }
    } else {
      const sourceGroup = groups.find(g => g.id === sourceGroupId);
      if (sourceGroup) {
        const index = sourceGroup.entities.findIndex(e => e.entity_id === entityId);
        if (index >= 0) {
          entity = sourceGroup.entities.splice(index, 1)[0];
        }
      }
    }

    if (!entity) return;

    // Add entity to target at specific position if beforeEntityId is provided
    if (targetGroupId === 'ungrouped') {
      if (beforeEntityId) {
        const targetIndex = entities.findIndex(e => e.entity_id === beforeEntityId);
        if (targetIndex >= 0) {
          entities.splice(targetIndex, 0, entity);
        } else {
          entities.push(entity);
        }
      } else {
        entities.push(entity);
      }
    } else {
      const targetGroup = groups.find(g => g.id === targetGroupId);
      if (targetGroup) {
        if (beforeEntityId) {
          const targetIndex = targetGroup.entities.findIndex(e => e.entity_id === beforeEntityId);
          if (targetIndex >= 0) {
            targetGroup.entities.splice(targetIndex, 0, entity);
          } else {
            targetGroup.entities.push(entity);
          }
        } else {
          targetGroup.entities.push(entity);
        }
      }
    }

    // Trigger widget update event - this will save to database
    const event = new CustomEvent('widget-update', {
      detail: { 
        id: widget.id, 
        content: {
          url: content.url,
          credentialId: content.credentialId,
          entities: entities,
          groups: groups,
          refreshInterval: content.refreshInterval
        }
      }
    });
    document.dispatchEvent(event);
  }

  private async reorderEntity(widget: Widget, entityId: string, beforeEntityId: string, groupId: string): Promise<void> {
    const content = widget.content as HomeAssistantContent;
    const entities = [...(content.entities || [])];
    const groups = JSON.parse(JSON.stringify(content.groups || [])) as EntityGroup[];

    let entity: EntityConfig | undefined;
    let targetArray: EntityConfig[];

    // Find the array and remove the entity
    if (groupId === 'ungrouped') {
      targetArray = entities;
      const index = entities.findIndex(e => e.entity_id === entityId);
      if (index >= 0) {
        entity = entities.splice(index, 1)[0];
      }
    } else {
      const group = groups.find(g => g.id === groupId);
      if (!group) return;
      targetArray = group.entities;
      const index = group.entities.findIndex(e => e.entity_id === entityId);
      if (index >= 0) {
        entity = group.entities.splice(index, 1)[0];
      }
    }

    if (!entity) return;

    // Insert before the target entity
    const targetIndex = targetArray.findIndex(e => e.entity_id === beforeEntityId);
    if (targetIndex >= 0) {
      targetArray.splice(targetIndex, 0, entity);
    } else {
      targetArray.push(entity);
    }

    // Trigger widget update event - this will save to database
    const event = new CustomEvent('widget-update', {
      detail: { 
        id: widget.id, 
        content: {
          url: content.url,
          credentialId: content.credentialId,
          entities: entities,
          groups: groups,
          refreshInterval: content.refreshInterval
        }
      }
    });
    document.dispatchEvent(event);
  }
}

// Plugin configuration
export const widget = {
  title: 'Home Assistant',
  type: 'home-assistant',
  name: 'Home Assistant',
  icon: '<i class="fas fa-home"></i>',
  description: 'Monitor and control Home Assistant entities',
  renderer: new HomeAssistantRenderer(),
  defaultSize: { w: 600, h: 400 },
  defaultContent: {
    url: '',
    token: '',
    entities: [],
    groups: [],
    refreshInterval: 5
  }
};

