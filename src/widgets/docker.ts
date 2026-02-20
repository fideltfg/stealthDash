import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';
import { stopAllDragPropagation, dispatchWidgetUpdate } from '../utils/dom';
import { getPingServerUrl, getAuthHeaders } from '../utils/api';
import { WidgetPoller } from '../utils/polling';
import { renderConfigPrompt } from '../utils/widgetRendering';
import { populateCredentialSelect } from '../utils/credentials';

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
  private poller = new WidgetPoller();

  destroy(): void {
    this.poller.stopAll();
  }

  configure(widget: Widget): void {
    this.showConfigDialog(widget);
  }

  private formatPorts(ports: Array<{ IP?: string; PrivatePort: number; PublicPort?: number; Type: string }>): string {
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

    container.className = 'widget-content';

    // Stop any existing polling
    this.poller.stop(widget.id);

    if (!content.host) {
      this.showEmptyState(container, widget);
      return;
    }

    // Start polling (fires immediately, then every refreshInterval)
    this.poller.start(widget.id, () => this.renderContainerList(container, widget), (content.refreshInterval || 30) * 1000);
  }

  private showEmptyState(container: HTMLElement, widget: Widget): void {
    const btn = renderConfigPrompt(container, '🐋', 'Docker Containers', 'Configure Docker host to monitor containers');
    btn.addEventListener('click', () => this.showConfigDialog(widget));
  }

  private async showConfigDialog(widget: Widget): Promise<void> {
    const content = (widget.content || {}) as DockerContent;

    const overlay = document.createElement('div');
    overlay.className = 'widget-overlay dark';

    const dialog = document.createElement('div');
    dialog.className = 'widget-dialog large';

    dialog.innerHTML = `
      <h3 class="widget-dialog-title large docker-title">
        <i class="fab fa-docker"></i> Docker Configuration
      </h3>

      <div class="docker-config-info">
        <div class="docker-config-info-title"><i class="fas fa-info-circle"></i> Connection Types:</div>
        <div class="docker-config-info-text">
          • <strong>Unix Socket</strong> (unix:///var/run/docker.sock): No credentials needed<br>
          • <strong>TCP</strong> (http://host:2375): No credentials needed<br>
          • <strong>TLS</strong> (https://host:2376): Create Docker credentials from user menu
        </div>
      </div>
      
      <div class="widget-dialog-field large-margin">
        <label class="widget-dialog-label medium">
          Docker Host URL *
        </label>
        <input 
          type="text" 
          id="docker-host-input" 
          placeholder="unix:///var/run/docker.sock"
          value="${content.host || ''}"
          class="widget-dialog-input extended"
        />
        <small class="widget-field-hint">
          Examples: unix:///var/run/docker.sock • http://192.168.1.100:2375 • https://docker.example.com:2376
        </small>
      </div>

      <div class="widget-dialog-field large-margin">
        <label class="widget-dialog-label medium">
          TLS Credentials (Optional)
        </label>
        <select 
          id="docker-credential-select"
          class="widget-dialog-input extended"
        >
          <option value="">None (local socket or unsecured TCP)</option>
        </select>
        <small class="widget-field-hint">
          Only required for HTTPS connections. Create Docker credentials from the <i class="fas fa-user"></i> user menu.
        </small>
      </div>

      <div class="widget-dialog-field large-margin">
        <label class="widget-dialog-label medium">
          Refresh Interval (seconds)
        </label>
        <input 
          type="number" 
          id="docker-refresh-input" 
          min="10"
          max="300"
          value="${content.refreshInterval || 30}"
          class="widget-dialog-input extended"
        />
      </div>

      <div class="widget-dialog-field large-margin">
        <label class="widget-checkbox-label">
          <input 
            type="checkbox" 
            id="docker-show-all-input"
            ${content.showAll ? 'checked' : ''}
            class="widget-checkbox"
          />
          <span>Show all containers (including stopped)</span>
        </label>
      </div>

      <div class="widget-dialog-buttons border-top">
        <div id="cancel-btn" class="btn btn-small btn-secondary">
          Cancel
        </div>
        <div id="save-btn" class="btn btn-small btn-primary">
          Save
        </div>
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

    await populateCredentialSelect(credentialSelect, 'docker', content.credentialId ?? undefined);

    // Prevent widget dragging
    stopAllDragPropagation(dialog);

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

      dispatchWidgetUpdate(widget.id, { host, credentialId, refreshInterval, showAll });
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
            <div id="containers-list" class="card-list"></div>
        `;

        containersList = container.querySelector('#containers-list') as HTMLElement;

        // Set up event delegation once
        containersList.addEventListener('pointerdown', (e) => {
          const target = e.target as HTMLElement;
          if (target.closest('.btn-small')) {
            e.stopPropagation();
          }
        });

        containersList.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          const button = target.closest('.btn-small') as HTMLButtonElement;

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

            // Replace icon with spinner - don't restore, let the next render update it
            const icon = button.querySelector('i');
            if (icon) {
              icon.className = 'fas fa-spinner fa-spin';
            }

            // Don't remove loading state - let the button stay in loading state
            // until it's replaced by the next container list update
            this.controlContainer(fullContainer.Id, action as 'start' | 'stop' | 'restart', content, container, widget);
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
        <div class="widget-error-container centered">
          <div class="widget-error-icon">⚠️</div>
          <div class="widget-error-title">Connection Error</div>
          <div class="widget-error-message">
            ${error instanceof Error ? error.message : 'Failed to connect to Docker host'}
          </div>
          <button id="retry-btn" class="widget-button-primary">Retry</button>
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
        <div class="widget-empty-state centered">
          <div class="docker-empty-icon">📦</div>
          <div>No containers found</div>
        </div>
      `;
      return;
    }

    // Get existing cards
    const existingCards = Array.from(containersList.querySelectorAll('.card'));
    //const existingIds = new Set(existingCards.map(card => card.getAttribute('data-container-id')));
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
    const name = container.Names[0]?.replace(/^\//, '') || 'unknown';
    // Show control buttons if credentials are set OR if using Unix socket (which doesn't need credentials)
    const hasControlAccess = !!credentialId || (host && host.startsWith('unix://'));

    return `
      <div class="card" data-container-id="${container.Id}">
        <div class="card-header">
          <div>
            <h5>${name}</h5>
            
          </div>
          <div class="badge ${container.State.toLowerCase()}">${container.State}</div>
        </div>
        <div class="docker-container-details">
          <h6>${container.Status}</h6>
          ${container.Ports && container.Ports.length > 0 ? `
            <h6><i class="fas fa-network-wired"></i> ${this.formatPorts(container.Ports)}</h6>
          ` : ''}
          ${container.NetworkSettings?.Networks ? `
            <h6><i class="fas fa-globe"></i> ${Object.keys(container.NetworkSettings.Networks).join(', ')}</h6>
          ` : ''}
        </div>
        <div><subtitle>${container.Image}</subtitle></div>
        <div class="button-group">
          ${hasControlAccess ? `
            ${isRunning ? `
              <button class=" btn btn-small btn-danger" data-action="stop" data-id="${shortId}">
                <i class="fas fa-stop"></i>
              </button>
              <button class=" btn btn-small btn-warning" data-action="restart" data-id="${shortId}">
                <i class="fas fa-sync-alt"></i>
              </button>
            ` : `
              <button class=" btn btn-small btn-success" data-action="start" data-id="${shortId}">
                <i class="fas fa-play"></i>
              </button>
            `}
          ` : ''}
          <button class=" btn btn-small btn-secondary" data-action="logs" data-id="${shortId}">
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

    const pingServerUrl = getPingServerUrl();

    const response = await fetch(`${pingServerUrl}/api/docker/containers`, {
      method: 'POST',
      headers: getAuthHeaders(),
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
      const pingServerUrl = getPingServerUrl();

      const response = await fetch(`${pingServerUrl}/api/docker/containers/${action}`, {
        method: 'POST',
        headers: getAuthHeaders(),
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
    overlay.className = 'widget-overlay dark';

    const dialog = document.createElement('div');
    dialog.className = 'docker-logs-dialog';

    dialog.innerHTML = `
      <div class="docker-logs-header">
        <h3 class="docker-logs-title">
          <i class="fas fa-file-alt"></i>
          ${containerName} - Logs
        </h3>
        <div class="docker-logs-buttons">
          <button id="refresh-logs-btn" class="widget-button">
            <i class="fas fa-sync-alt"></i> Refresh
          </button>
          <button id="close-logs-btn" class="widget-button-secondary">
            <i class="fas fa-times"></i> Close
          </button>
        </div>
      </div>

      <div class="docker-logs-controls">
        <label class="docker-logs-control-label">
          <span>Lines:</span>
          <select id="log-lines-select" class="docker-logs-select">
            <option value="100">100</option>
            <option value="500" selected>500</option>
            <option value="1000">1000</option>
            <option value="all">All</option>
          </select>
        </label>
        <label class="widget-checkbox-label">
          <input type="checkbox" id="follow-logs-checkbox" class="widget-checkbox" />
          <span>Follow logs (auto-refresh)</span>
        </label>
      </div>

      <div id="logs-container" class="docker-logs-container">
        <div class="docker-logs-loading">
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
        logsContainer.innerHTML = '<div class="docker-logs-loading"><i class="fas fa-spinner fa-spin"></i> Loading logs...</div>';

        const pingServerUrl = getPingServerUrl();
        const response = await fetch(`${pingServerUrl}/api/docker/containers/logs`, {
          method: 'POST',
          headers: getAuthHeaders(),
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
          logsContainer.innerHTML = '<div class="docker-logs-empty">No logs available</div>';
        }

        // Auto-scroll to bottom
        logsContainer.scrollTop = logsContainer.scrollHeight;

      } catch (error) {
        logsContainer.innerHTML = `
          <div class="docker-logs-error">
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
