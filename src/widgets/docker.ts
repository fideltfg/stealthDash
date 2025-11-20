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
      <h3 style="margin-top: 0; color: var(--text);">🐋 Docker Configuration</h3>
      
      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: var(--text);">
          Docker Host URL *
        </label>
        <input 
          type="text" 
          id="docker-host-input" 
          placeholder="unix:///var/run/docker.sock or http://remote-host:2375"
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
        <small style="display: block; margin-top: 6px; opacity: 0.7; color: var(--muted);">
          Local: unix:///var/run/docker.sock<br>
          Remote TCP: http://192.168.1.100:2375<br>
          Secure Remote: https://docker.example.com:2376
        </small>
      </div>

      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: var(--text);">
          TLS Credential (Optional)
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
          <option value="">None (for unix socket or unsecured TCP)</option>
          ${credentialOptions}
        </select>
        <small style="display: block; margin-top: 6px; opacity: 0.7; color: var(--muted);">
          Only needed for secure HTTPS connections with client certificates
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

      container.innerHTML = `
        <div style="
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
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
            <div style="
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
            flex: 1;
            overflow-y: auto;
            padding: 8px;
          ">
            ${containers.length === 0 ? `
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
            ` : containers.map(c => this.renderContainerCard(c, content.credentialId)).join('')}
          </div>
        </div>
      `;

      // Attach event listeners to control buttons only if credential is set
      if (content.credentialId) {
        containers.forEach(c => {
          const startBtn = container.querySelector(`#start-${c.Id.substring(0, 12)}`) as HTMLButtonElement;
          const stopBtn = container.querySelector(`#stop-${c.Id.substring(0, 12)}`) as HTMLButtonElement;
          const restartBtn = container.querySelector(`#restart-${c.Id.substring(0, 12)}`) as HTMLButtonElement;

          if (startBtn) {
            startBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
            startBtn.addEventListener('click', () => this.controlContainer(c.Id, 'start', content, container, widget));
          }
          if (stopBtn) {
            stopBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
            stopBtn.addEventListener('click', () => this.controlContainer(c.Id, 'stop', content, container, widget));
          }
          if (restartBtn) {
            restartBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
            restartBtn.addEventListener('click', () => this.controlContainer(c.Id, 'restart', content, container, widget));
          }
        });
      }

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

  private renderContainerCard(container: DockerContainer, credentialId?: number | null): string {
    const isRunning = container.State === 'running';
    const shortId = container.Id.substring(0, 12);
    const name = container.Names[0]?.replace(/^\//, '') || 'unknown';
    const hasCredential = !!credentialId;

    const statusColor = isRunning ? '#4CAF50' : '#FF9800';
    const statusText = container.Status;

    return `
      <div style="
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 8px;
      ">
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 8px;
        ">
          <div style="flex: 1; min-width: 0;">
            <div style="
              font-weight: 600;
              color: var(--text);
              margin-bottom: 4px;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            ">
              ${name}
            </div>
            <div style="
              font-size: 12px;
              color: var(--muted);
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            ">
              ${container.Image}
            </div>
          </div>
          <div style="
            display: inline-block;
            padding: 4px 8px;
            background: ${statusColor}22;
            color: ${statusColor};
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            white-space: nowrap;
            margin-left: 8px;
          ">
            ${container.State}
          </div>
        </div>

        <div style="
          font-size: 11px;
          color: var(--muted);
          margin-bottom: 8px;
        ">
          <div style="margin-bottom: 4px;">${statusText}</div>
          ${container.Ports && container.Ports.length > 0 ? `
            <div style="margin-bottom: 4px;">
              📡 ${container.Ports.filter(p => p.PublicPort).map(p => 
                `${p.PublicPort}:${p.PrivatePort}/${p.Type}`
              ).join(', ') || 'No exposed ports'}
            </div>
          ` : ''}
          ${container.NetworkSettings?.Networks ? `
            <div>
              🌐 ${Object.keys(container.NetworkSettings.Networks).join(', ')}
            </div>
          ` : ''}
        </div>

        ${hasCredential ? `
          <div style="
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
          ">
            ${isRunning ? `
              <button id="stop-${shortId}" style="
                flex: 1;
                min-width: 80px;
                padding: 6px 12px;
                background: #f44336;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 500;
              ">
                ⏹️ Stop
              </button>
              <button id="restart-${shortId}" style="
                flex: 1;
                min-width: 80px;
                padding: 6px 12px;
                background: #FF9800;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 500;
              ">
                🔄 Restart
              </button>
            ` : `
              <button id="start-${shortId}" style="
                flex: 1;
                padding: 6px 12px;
                background: #4CAF50;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 500;
              ">
                ▶️ Start
              </button>
            `}
          </div>
        ` : ''}
      </div>
    `;
  }

  private async fetchContainers(content: DockerContent): Promise<DockerContainer[]> {
    if (!content.host) {
      throw new Error('Docker host is required');
    }

    const pingServerUrl = this.getPingServerUrl();
    const showAll = content.showAll ? 'true' : 'false';
    
    const response = await fetch(`${pingServerUrl}/api/docker/containers?all=${showAll}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authService.getToken() || ''}`
      },
      body: JSON.stringify({
        host: content.host,
        credentialId: content.credentialId
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
  icon: '🐋',
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
