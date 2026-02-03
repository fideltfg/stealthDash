import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';
import { preventWidgetKeyboardDrag } from '../types/widget';
import { credentialsService } from '../services/credentials';
import { authService } from '../services/auth';

export interface DockerContent {
  host?: string;
  credentialId?: number | null;
  refreshInterval?: number; // seconds
  showAll?: boolean; // show all containers or just running ones
}

interface DockerContainer {
  Id: string;
  Names: string[];
  Image: string;
  ImageID: string;
  Command: string;
  State: string;
  Status: string;
  Created: number;
  Ports?: Array<{
    IP?: string;
    PrivatePort: number;
    PublicPort?: number;
    Type: string;
  }>;
  Labels?: Record<string, string>;
  NetworkSettings?: {
    Networks?: Record<string, any>;
  };
  Mounts?: Array<{
    Type: string;
    Source: string;
    Destination: string;
    Mode?: string;
    RW?: boolean;
  }>;
}

class DockerWidgetRenderer implements WidgetRenderer {
  private refreshIntervals: Map<string, number> = new Map();

  configure(widget: Widget): void {
    this.showConfigDialog(widget);
  }

  private formatPorts(ports: Array<{IP?: string; PrivatePort: number; PublicPort?: number; Type: string}>): string {
    if (!ports || ports.length === 0) return 'No exposed ports';
    
    // Get unique public ports
    const uniquePorts = new Set<string>();
    
    ports.forEach(port => {
      if (port.PublicPort) {
        uniquePorts.add(`${port.PublicPort}/${port.Type}`);
      }
    });
    
    if (uniquePorts.size === 0) return 'No exposed ports';
    
    return Array.from(uniquePorts).sort((a, b) => {
      const aNum = parseInt(a.split('/')[0]);
      const bNum = parseInt(b.split('/')[0]);
      return aNum - bNum;
    }).join(', ');
  }

  render(container: HTMLElement, widget: Widget): void {
    const content = (widget.content || {}) as DockerContent;

    container.style.cssText = `
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--surface);
      overflow: hidden;
    `;

    // Clear any existing refresh interval
    const existingInterval = this.refreshIntervals.get(widget.id);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    if (!content.host) {
      this.showEmptyState(container, widget);
      return;
    }

    this.renderContainerList(container, widget);

    // Start auto-refresh
    const interval = window.setInterval(() => {
      this.renderContainerList(container, widget);
    }, (content.refreshInterval || 30) * 1000);
    this.refreshIntervals.set(widget.id, interval);
  }

  private showEmptyState(container: HTMLElement, widget: Widget): void {
    container.innerHTML = `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        padding: 24px;
        text-align: center;
        gap: 16px;
      ">
        <div style="font-size: 48px;">🐋</div>
        <div style="font-size: 18px; font-weight: 600; color: var(--text);">
          Docker Containers
        </div>
        <div style="font-size: 14px; color: var(--muted); max-width: 300px;">
          Configure Docker host to monitor containers
        </div>
        <button id="configure-docker-btn" style="
          padding: 10px 24px;
          background: var(--accent);
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          margin-top: 8px;
        ">
          Configure
        </button>
      </div>
    `;

    const configBtn = container.querySelector('#configure-docker-btn') as HTMLButtonElement;
    configBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    configBtn.addEventListener('click', () => {
      this.showConfigDialog(widget);
    });
  }

  private async showConfigDialog(widget: Widget): Promise<void> {
    const content = (widget.content || {}) as DockerContent;

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
    `;

    // Load credentials
    const credentials = await credentialsService.getAll();
    const dockerCredentials = credentials.filter(c => c.service_type === 'docker');

    const credentialOptions = dockerCredentials
      .map(c => `<option value="${c.id}" ${content.credentialId === c.id ? 'selected' : ''}>${c.name}</option>`)
      .join('');

    dialog.innerHTML = `
      <h3 style="margin-top: 0; color: var(--text); display: flex; align-items: center; gap: 8px;">
        <i class="fab fa-docker"></i> Docker Configuration
      </h3>

      <div style="
        background: #2196F322;
        border-left: 4px solid #2196F3;
        padding: 12px;
        margin-bottom: 20px;
        border-radius: 4px;
        font-size: 13px;
        color: var(--text);
      ">
        <div style="font-weight: 600; margin-bottom: 6px;"><i class="fas fa-info-circle"></i> Connection Types:</div>
        <div style="opacity: 0.9; line-height: 1.6;">
          • <strong>Unix Socket</strong> (unix:///var/run/docker.sock): No credentials needed<br>
          • <strong>TCP</strong> (http://host:2375): No credentials needed<br>
          • <strong>TLS</strong> (https://host:2376): Create Docker credentials from user menu
        </div>
      </div>
      
      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: var(--text);">
          Docker Host URL *
        </label>
        <input 
          type="text" 
          id="docker-host-input" 
          placeholder="unix:///var/run/docker.sock"
          value="${content.host || ''}"
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
        <small style="display: block; margin-top: 6px; opacity: 0.7; color: var(--muted); font-size: 12px;">
          Examples: unix:///var/run/docker.sock • http://192.168.1.100:2375 • https://docker.example.com:2376
        </small>
      </div>

      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: var(--text);">
          TLS Credentials (Optional)
        </label>
        <select 
          id="docker-credential-select"
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
        >
          <option value="">None (local socket or unsecured TCP)</option>
          ${credentialOptions}
        </select>
        <small style="display: block; margin-top: 6px; opacity: 0.7; color: var(--muted); font-size: 12px;">
          Only required for HTTPS connections. Create Docker credentials from the <i class="fas fa-user"></i> user menu.
        </small>
      </div>

      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: var(--text);">
          Refresh Interval (seconds)
        </label>
        <input 
          type="number" 
          id="docker-refresh-input" 
          min="10"
          max="300"
          value="${content.refreshInterval || 30}"
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
      </div>

      <div style="margin-bottom: 20px;">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
          <input 
            type="checkbox" 
            id="docker-show-all-input"
            ${content.showAll ? 'checked' : ''}
            style="cursor: pointer;"
          />
          <span style="color: var(--text); font-size: 14px;">Show all containers (including stopped)</span>
        </label>
      </div>

      <div style="display: flex; gap: 12px; justify-content: flex-end; border-top: 1px solid var(--border); padding-top: 15px; margin-top: 20px;">
        <button id="cancel-btn" style="
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
        <button id="save-btn" style="
          padding: 10px 20px;
          cursor: pointer;
          background: var(--accent);
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
        ">
          Save
        </button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const hostInput = dialog.querySelector('#docker-host-input') as HTMLInputElement;
    const credentialSelect = dialog.querySelector('#docker-credential-select') as HTMLSelectElement;
    const refreshInput = dialog.querySelector('#docker-refresh-input') as HTMLInputElement;
    const showAllInput = dialog.querySelector('#docker-show-all-input') as HTMLInputElement;
    const saveBtn = dialog.querySelector('#save-btn') as HTMLButtonElement;
    const cancelBtn = dialog.querySelector('#cancel-btn') as HTMLButtonElement;

    // Prevent widget dragging
    [hostInput, credentialSelect, refreshInput, showAllInput, saveBtn, cancelBtn].forEach(el => {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
        preventWidgetKeyboardDrag(el);
      }
    });

    cancelBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    saveBtn.addEventListener('click', () => {
      const host = hostInput.value.trim();
      const credentialId = credentialSelect.value ? parseInt(credentialSelect.value) : null;
      const refreshInterval = parseInt(refreshInput.value);
      const showAll = showAllInput.checked;

      if (!host) {
        alert('Please enter Docker host URL');
        return;
      }

      overlay.remove();

      const event = new CustomEvent('widget-update', {
        detail: {
          id: widget.id,
          content: { host, credentialId, refreshInterval, showAll }
        }
      });
      document.dispatchEvent(event);
    });
  }

  private async renderContainerList(container: HTMLElement, widget: Widget): Promise<void> {
    const content = widget.content as DockerContent;

    try {
      const containers = await this.fetchContainers(content);
      
      // Check if we need to do initial render
      let containersList = container.querySelector('#containers-list') as HTMLElement;
      
      if (!containersList) {
        // Initial render - create the structure
        container.innerHTML = `
          <div style="
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow: hidden;
            container-type: inline-size;
          ">
            <div style="
              padding: 12px 16px;
              border-bottom: 1px solid var(--border);
              display: flex;
              justify-content: space-between;
              align-items: center;
            ">
              <div style="font-weight: 600; color: var(--text);">
                🐋 Docker Containers
              </div>
              <div id="container-count" style="
                font-size: 12px;
                color: var(--muted);
                background: rgba(0, 150, 255, 0.1);
                padding: 4px 8px;
                border-radius: 4px;
              ">
                ${containers.length} container${containers.length !== 1 ? 's' : ''}
              </div>
            </div>
            
            <div id="containers-list" style="
              overflow-y: auto;
            ">
            </div>
          </div>
        `;
        
        containersList = container.querySelector('#containers-list') as HTMLElement;
        
        // Set up event delegation once
        containersList.addEventListener('pointerdown', (e) => {
          const target = e.target as HTMLElement;
          if (target.closest('.docker-btn')) {
            e.stopPropagation();
          }
        });

        containersList.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          const button = target.closest('.docker-btn') as HTMLButtonElement;
          
          if (!button || button.disabled || button.classList.contains('loading')) {
            return;
          }

          const action = button.dataset.action;
          const containerId = button.dataset.id;
          
          if (!action || !containerId) {
            return;
          }

          // Get stored containers from the element
          const storedContainers = (containersList as any).__containers || [];
          const fullContainer = storedContainers.find((c: DockerContainer) => c.Id.startsWith(containerId));
          
          if (!fullContainer) {
            return;
          }

          if (action === 'logs') {
            this.showContainerLogs(fullContainer.Id, fullContainer.Names[0]?.replace(/^\//, '') || 'unknown', content);
          } else if (action === 'start' || action === 'stop' || action === 'restart') {
            button.classList.add('loading');
            button.disabled = true;
            
            this.controlContainer(fullContainer.Id, action as 'start' | 'stop' | 'restart', content, container, widget)
              .finally(() => {
                button.classList.remove('loading');
                button.disabled = false;
              });
          }
        });
      }
      
      // Store containers for event handlers
      (containersList as any).__containers = containers;
      
      // Update container count
      const countEl = container.querySelector('#container-count');
      if (countEl) {
        countEl.textContent = `${containers.length} container${containers.length !== 1 ? 's' : ''}`;
      }
      
      // Update containers individually
      this.updateContainersList(containersList, containers, content);

    } catch (error) {
      container.innerHTML = `
        <div style="
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          padding: 20px;
          text-align: center;
          color: var(--text);
        ">
          <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
          <div style="font-weight: 600; margin-bottom: 8px;">Connection Error</div>
          <div style="font-size: 14px; color: var(--muted); max-width: 300px;">
            ${error instanceof Error ? error.message : 'Failed to connect to Docker host'}
          </div>
          <button id="retry-btn" style="
            margin-top: 16px;
            padding: 8px 16px;
            background: var(--accent);
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
          ">
            Retry
          </button>
        </div>
      `;

      const retryBtn = container.querySelector('#retry-btn') as HTMLButtonElement;
      if (retryBtn) {
        retryBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
        retryBtn.addEventListener('click', () => this.renderContainerList(container, widget));
      }
    }
  }

  private updateContainersList(containersList: HTMLElement, containers: DockerContainer[], content: DockerContent): void {
    if (containers.length === 0) {
      containersList.innerHTML = `
        <div style="
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--muted);
          gap: 8px;
        ">
          <div style="font-size: 32px;">📦</div>
          <div>No containers found</div>
        </div>
      `;
      return;
    }
    
    // Get existing cards
    const existingCards = Array.from(containersList.querySelectorAll('.docker-container-card'));
    const existingIds = new Set(existingCards.map(card => card.getAttribute('data-container-id')));
    const newIds = new Set(containers.map(c => c.Id));
    
    // Remove containers that no longer exist
    existingCards.forEach(card => {
      const cardId = card.getAttribute('data-container-id');
      if (cardId && !newIds.has(cardId)) {
        card.remove();
      }
    });
    
    // Update or add containers
    containers.forEach((container, index) => {
      const existingCard = containersList.querySelector(`[data-container-id="${container.Id}"]`);
      const cardHtml = this.renderContainerCard(container, content.credentialId, content.host);
      
      if (existingCard) {
        // Update existing card
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = cardHtml;
        const newCard = tempDiv.firstElementChild as HTMLElement;
        
        // Only update if content has changed
        if (existingCard.innerHTML !== newCard.innerHTML) {
          existingCard.innerHTML = newCard.innerHTML;
        }
      } else {
        // Add new card
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = cardHtml;
        const newCard = tempDiv.firstElementChild as HTMLElement;
        
        // Insert at the correct position to maintain order
        if (index === 0) {
          containersList.insertBefore(newCard, containersList.firstChild);
        } else {
          const prevContainer = containers[index - 1];
          const prevCard = containersList.querySelector(`[data-container-id="${prevContainer.Id}"]`);
          if (prevCard && prevCard.nextSibling) {
            containersList.insertBefore(newCard, prevCard.nextSibling);
          } else {
            containersList.appendChild(newCard);
          }
        }
      }
    });
  }

  private renderContainerCard(container: DockerContainer, credentialId?: number | null, host?: string): string {
    const isRunning = container.State === 'running';
    const shortId = container.Id.substring(0, 12);
    const name = container.Names[0]?.replace(/^\//,  '') || 'unknown';
    // Show control buttons if credentials are set OR if using Unix socket (which doesn't need credentials)
    const hasControlAccess = !!credentialId || (host && host.startsWith('unix://'));

    const statusText = container.Status;

    return `
      <div class="docker-container-card" data-container-id="${container.Id}">
        <div class="docker-container-header">
          <div class="docker-container-info">
            <div class="docker-container-name">${name}</div>
            <div class="docker-container-image">${container.Image}</div>
          </div>
          <div class="docker-status-badge ${container.State.toLowerCase()}">${container.State}</div>
        </div>

        <div class="docker-container-details">
          <div>${statusText}</div>
          ${container.Ports && container.Ports.length > 0 ? `
            <div><i class="fas fa-network-wired"></i> ${this.formatPorts(container.Ports)}</div>
          ` : ''}
          ${container.NetworkSettings?.Networks ? `
            <div><i class="fas fa-globe"></i> ${Object.keys(container.NetworkSettings.Networks).join(', ')}</div>
          ` : ''}
        </div>

        <div class="docker-button-group">
          ${hasControlAccess ? `
            ${isRunning ? `
              <button class="docker-btn stop" data-action="stop" data-id="${shortId}">
                <i class="fas fa-stop"></i>
              </button>
              <button class="docker-btn restart" data-action="restart" data-id="${shortId}">
                <i class="fas fa-sync-alt"></i>
              </button>
            ` : `
              <button class="docker-btn start" data-action="start" data-id="${shortId}">
                <i class="fas fa-play"></i>
              </button>
            `}
          ` : ''}
          <button class="docker-btn logs" data-action="logs" data-id="${shortId}">
            <i class="fas fa-file-alt"></i>
          </button>
        </div>
      </div>
    `;
  }

  private async fetchContainers(content: DockerContent): Promise<DockerContainer[]> {
    if (!content.host) {
      throw new Error('Docker host is required');
    }

    const pingServerUrl = this.getPingServerUrl();
    
    const response = await fetch(`${pingServerUrl}/api/docker/containers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authService.getToken() || ''}`
      },
      body: JSON.stringify({
        host: content.host,
        credentialId: content.credentialId,
        all: content.showAll || false
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  private async controlContainer(
    containerId: string,
    action: 'start' | 'stop' | 'restart',
    content: DockerContent,
    container: HTMLElement,
    widget: Widget
  ): Promise<void> {
    try {
      const pingServerUrl = this.getPingServerUrl();
      
      const response = await fetch(`${pingServerUrl}/api/docker/containers/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authService.getToken() || ''}`
        },
        body: JSON.stringify({
          host: content.host,
          credentialId: content.credentialId,
          containerId
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      // Refresh the container list after action
      setTimeout(() => {
        this.renderContainerList(container, widget);
      }, 1000);

    } catch (error) {
      console.error(`Failed to ${action} container:`, error);
      alert(`Failed to ${action} container: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async showContainerLogs(
    containerId: string,
    containerName: string,
    content: DockerContent
  ): Promise<void> {
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
      width: 90%;
      max-width: 1000px;
      height: 80vh;
      max-height: 800px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    `;

    dialog.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 style="margin: 0; color: var(--text); display: flex; align-items: center; gap: 8px;">
          <i class="fas fa-file-alt"></i>
          ${containerName} - Logs
        </h3>
        <div style="display: flex; gap: 8px;">
          <button id="refresh-logs-btn" style="
            padding: 6px 12px;
            background: var(--accent);
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
          ">
            <i class="fas fa-sync-alt"></i> Refresh
          </button>
          <button id="close-logs-btn" style="
            padding: 6px 12px;
            background: #666;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
          ">
            <i class="fas fa-times"></i> Close
          </button>
        </div>
      </div>

      <div style="margin-bottom: 12px; display: flex; gap: 12px; align-items: center;">
        <label style="display: flex; align-items: center; gap: 8px; color: var(--text); font-size: 14px;">
          <span>Lines:</span>
          <select id="log-lines-select" style="
            padding: 6px 10px;
            background: var(--bg);
            border: 1px solid var(--border);
            border-radius: 4px;
            color: var(--text);
            font-size: 14px;
          ">
            <option value="100">100</option>
            <option value="500" selected>500</option>
            <option value="1000">1000</option>
            <option value="all">All</option>
          </select>
        </label>
        <label style="display: flex; align-items: center; gap: 8px; color: var(--text); font-size: 14px;">
          <input type="checkbox" id="follow-logs-checkbox" />
          <span>Follow logs (auto-refresh)</span>
        </label>
      </div>

      <div id="logs-container" style="
        flex: 1;
        background: #1e1e1e;
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 12px;
        overflow: auto;
        font-family: 'Courier New', monospace;
        font-size: 12px;
        color: #d4d4d4;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-all;
      ">
        <div style="text-align: center; padding: 20px; color: #888;">
          <i class="fas fa-spinner fa-spin"></i> Loading logs...
        </div>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const logsContainer = dialog.querySelector('#logs-container') as HTMLElement;
    const closeBtn = dialog.querySelector('#close-logs-btn') as HTMLButtonElement;
    const refreshBtn = dialog.querySelector('#refresh-logs-btn') as HTMLButtonElement;
    const linesSelect = dialog.querySelector('#log-lines-select') as HTMLSelectElement;
    const followCheckbox = dialog.querySelector('#follow-logs-checkbox') as HTMLInputElement;

    let followInterval: number | null = null;

    const fetchLogs = async () => {
      try {
        const lines = linesSelect.value;
        logsContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;"><i class="fas fa-spinner fa-spin"></i> Loading logs...</div>';

        const pingServerUrl = this.getPingServerUrl();
        const response = await fetch(`${pingServerUrl}/api/docker/containers/logs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authService.getToken() || ''}`
          },
          body: JSON.stringify({
            host: content.host,
            credentialId: content.credentialId,
            containerId,
            tail: lines === 'all' ? 'all' : parseInt(lines)
          })
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: response.statusText }));
          throw new Error(error.error || `HTTP ${response.status}`);
        }

        const logs = await response.text();
        
        if (logs.trim()) {
          logsContainer.textContent = logs;
        } else {
          logsContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">No logs available</div>';
        }
        
        // Auto-scroll to bottom
        logsContainer.scrollTop = logsContainer.scrollHeight;

      } catch (error) {
        logsContainer.innerHTML = `
          <div style="text-align: center; padding: 20px; color: #f44336;">
            <i class="fas fa-exclamation-triangle"></i> Error loading logs:<br/>
            ${error instanceof Error ? error.message : 'Unknown error'}
          </div>
        `;
      }
    };

    const startFollow = () => {
      if (followInterval) clearInterval(followInterval);
      followInterval = window.setInterval(fetchLogs, 2000);
    };

    const stopFollow = () => {
      if (followInterval) {
        clearInterval(followInterval);
        followInterval = null;
      }
    };

    // Event listeners
    closeBtn.addEventListener('click', () => {
      stopFollow();
      document.body.removeChild(overlay);
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        stopFollow();
        document.body.removeChild(overlay);
      }
    });

    refreshBtn.addEventListener('click', fetchLogs);
    linesSelect.addEventListener('change', fetchLogs);
    
    followCheckbox.addEventListener('change', () => {
      if (followCheckbox.checked) {
        startFollow();
      } else {
        stopFollow();
      }
    });

    // Initial fetch
    fetchLogs();
  }

  private getPingServerUrl(): string {
    if (typeof window !== 'undefined') {
      return window.location.origin.replace(':3000', ':3001');
    }
    return 'http://localhost:3001';
  }
}

export const widget = {
  type: 'docker',
  name: 'Docker',
  icon: '<i class="fab fa-docker"></i>',
  description: 'Monitor and manage Docker containers',
  renderer: new DockerWidgetRenderer(),
  defaultSize: { w: 400, h: 500 },
  defaultContent: {
    host: '',
    credentialId: null,
    refreshInterval: 30,
    showAll: false
  },
  hasSettings: true
};
