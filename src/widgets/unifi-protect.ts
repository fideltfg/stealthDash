import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';
import { credentialsService } from '../services/credentials';
import { authService } from '../services/auth';

interface UnifiProtectContent {
  host: string; // UniFi Protect Console host (e.g., 'https://192.168.1.1')
  credentialId?: number; // ID of saved credential to use
  selectedCameras?: string[]; // Array of camera IDs to display
  displayMode?: 'detections' | 'cameras' | 'both'; // What to display
  viewMode?: 'snapshots' | 'streams' | 'both'; // How to view cameras
  maxDetections?: number; // Maximum number of detections to show (default: 10)
  detectionTypes?: string[]; // Types of detections to show (motion, person, vehicle, etc.)
  refreshInterval?: number; // Refresh interval in seconds (default: 30)
  autoRefreshDetections?: boolean; // Auto-refresh detection list
}

// UniFi Protect API response structures
interface ProtectCamera {
  id: string;
  name: string;
  type: string;
  model: string;
  mac: string;
  host: string;
  state: string;
  isConnected: boolean;
  isMotionDetected: boolean;
  isRecording: boolean;
  lastSeen: number;
  channels: {
    id: number;
    name: string;
    enabled: boolean;
    isRtspEnabled: boolean;
    rtspAlias?: string;
  }[];
  stats?: {
    rxBytes: number;
    txBytes: number;
    video: {
      recordingStart: number;
      recordingEnd: number;
    };
  };
}

interface ProtectEvent {
  id: string;
  type: string;
  score: number;
  smartDetectTypes: string[];
  camera: string;
  cameraName?: string;
  start: number;
  end: number | null;
  thumbnail: string;
  heatmap?: string;
  modelKey?: string;
}

interface ProtectBootstrap {
  cameras: ProtectCamera[];
  events: ProtectEvent[];
}

class UnifiProtectRenderer implements WidgetRenderer {
  private updateIntervals: Map<string, number> = new Map();
  private eventStreams: Map<string, EventSource> = new Map();

  configure(widget: Widget): void {
    this.showConfigDialog(widget);
  }

  render(container: HTMLElement, widget: Widget): void {
    const content = widget.content as UnifiProtectContent;
    
    // If widget has no host or credential configured, show configuration prompt
    if (!content.host || !content.credentialId) {
      this.renderConfigPrompt(container, widget);
      return;
    }

    // Clear existing interval
    const existingInterval = this.updateIntervals.get(widget.id);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    // Close existing event stream
    const existingStream = this.eventStreams.get(widget.id);
    if (existingStream) {
      existingStream.close();
      this.eventStreams.delete(widget.id);
    }

    // Create widget structure
    container.className = 'unifi-protect-widget flex flex-column';
    container.innerHTML = `
      <div class="protect-header widget-header-row">
        <h3 class="widget-title flex align-center gap-8">
          <span class="widget-icon-large"><i class="fas fa-video"></i></span>
          <span>UniFi Protect</span>
        </h3>
        <button class="refresh-btn widget-button secondary">🔄 Refresh</button>
      </div>
      <div class="protect-content flex-1 flex flex-column gap-12 overflow-auto">
        <div class="protect-loading widget-loading centered">
          Loading cameras and detections...
        </div>
      </div>
    `;

    const contentEl = container.querySelector('.protect-content') as HTMLElement;
    const refreshBtn = container.querySelector('.refresh-btn') as HTMLButtonElement;
    
    const fetchAndRender = async () => {
      try {
        if (!content.credentialId) {
          throw new Error('No credential configured. Please edit widget and select a saved credential.');
        }

        // Fetch bootstrap data from UniFi Protect
        const proxyUrl = new URL('/api/unifi-protect/bootstrap', window.location.origin.replace(':3000', ':3001'));
        proxyUrl.searchParams.set('host', content.host);
        proxyUrl.searchParams.set('credentialId', content.credentialId.toString());
        
        const response = await fetch(proxyUrl.toString(), {
          headers: {
            'Authorization': `Bearer ${authService.getToken() || ''}`
          }
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: response.statusText }));
          throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        const data: ProtectBootstrap = await response.json();
        
        // Render based on display mode
        const mode = content.displayMode || 'both';
        
        if (mode === 'detections') {
          this.renderDetections(contentEl, data, content);
        } else if (mode === 'cameras') {
          this.renderCameras(contentEl, data, content);
        } else {
          this.renderBoth(contentEl, data, content);
        }
        
      } catch (error: any) {
        console.error('Error fetching UniFi Protect data:', error);
        contentEl.innerHTML = `
          <div class="widget-error">
            <div class="widget-error-icon large">⚠️</div>
            <div class="widget-error-title" style="color: var(--error);">
              ${error.message || 'Failed to load UniFi Protect data'}
            </div>
            <div class="widget-error-message">
              Check console connection and credentials
            </div>
          </div>
        `;
      }
    };

    // Refresh button handler
    refreshBtn.addEventListener('click', () => {
      fetchAndRender();
    });

    // Initial fetch
    fetchAndRender();

    // Set up auto-refresh
    const interval = content.refreshInterval || 30;
    const intervalId = window.setInterval(fetchAndRender, interval * 1000);
    this.updateIntervals.set(widget.id, intervalId);
  }

  private renderConfigPrompt(container: HTMLElement, widget: Widget): void {
    container.className = 'flex flex-column align-center justify-center text-center';
    container.innerHTML = `
      <div class="widget-config-icon"><i class="fas fa-video"></i></div>
      <h3 class="widget-title mb-12">UniFi Protect Not Configured</h3>
      <p class="widget-text mb-20" style="max-width: 400px;">
        Configure this widget to display camera feeds and motion detections from your UniFi Protect console.
      </p>
      <button class="config-btn widget-button primary">
        Configure Widget
      </button>
    `;

    const configBtn = container.querySelector('.config-btn');
    configBtn?.addEventListener('click', () => {
      this.showConfigDialog(widget);
    });
  }

  private async showConfigDialog(widget: Widget): Promise<void> {
    const content = widget.content as UnifiProtectContent;
    
    // Fetch available credentials
    const credentials = await credentialsService.getAll();
    const unifiProtectCreds = credentials.filter((c: any) => 
      c.service_type === 'unifi-protect' || 
      c.service_type === 'basic' || 
      c.service_type === 'custom'
    );

    const overlay = document.createElement('div');
    overlay.className = 'widget-overlay';

    const modal = document.createElement('div');
    modal.className = 'widget-dialog scrollable' ;
    modal.style.maxWidth = '600px';

    modal.innerHTML = `
      <h2 class="mb-4">
        <i class="fas fa-video me-2"></i>Configure UniFi Protect Widget
      </h2>
      
      <div class="mb-3">
        <label class="form-label">
          UniFi Protect Console URL *
        </label>
        <input type="text" id="host-input" placeholder="https://192.168.1.1" value="${content.host || ''}"
          class="form-control">
        <div class="form-text">
          URL of your UniFi Protect console (Cloud Key, UDM Pro, UNVR, etc.)
        </div>
      </div>

      <div class="mb-3">
        <label class="form-label">
          Credentials *
        </label>
        <select id="credential-select" 
          class="form-select">
          <option value="">Select saved credentials...</option>
          ${unifiProtectCreds.map((cred: any) => 
            `<option value="${cred.id}" ${content.credentialId === cred.id ? 'selected' : ''}>
              ${cred.name}
            </option>`
          ).join('')}
        </select>
        <div class="form-text">
          Select credentials from Credentials Manager (local admin user recommended)
        </div>
      </div>

      <div class="mb-3">
        <label class="form-label">
          Display Mode
        </label>
        <select id="display-mode-select" 
          class="form-select">
          <option value="both" ${content.displayMode === 'both' ? 'selected' : ''}>Cameras & Detections</option>
          <option value="cameras" ${content.displayMode === 'cameras' ? 'selected' : ''}>Cameras Only</option>
          <option value="detections" ${content.displayMode === 'detections' ? 'selected' : ''}>Detections Only</option>
        </select>
      </div>

      <div class="mb-3">
        <label class="form-label">
          Camera View Mode
        </label>
        <select id="view-mode-select" 
          class="form-select">
          <option value="snapshots" ${content.viewMode === 'snapshots' ? 'selected' : ''}>Snapshots</option>
          <option value="streams" ${content.viewMode === 'streams' ? 'selected' : ''}>Live Streams</option>
          <option value="both" ${content.viewMode === 'both' ? 'selected' : ''}>Both</option>
        </select>
      </div>

      <div class="mb-3">
        <label class="form-label">
          Maximum Detections
        </label>
        <input type="number" id="max-detections-input" value="${content.maxDetections || 10}" min="1" max="50"
          class="form-control">
      </div>

      <div class="mb-3">
        <label class="form-label">
          Refresh Interval (seconds)
        </label>
        <input type="number" id="refresh-input" value="${content.refreshInterval || 30}" min="5" max="300"
          class="form-control">
      </div>

      <div class="d-flex gap-2 justify-content-end border-top pt-3">
        <button id="cancel-btn" 
          class="btn btn-secondary">
          Cancel
        </button>
        <button id="save-btn" 
          class="btn btn-primary">
          Save Configuration
        </button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Handle save
    const saveBtn = modal.querySelector('#save-btn');
    saveBtn?.addEventListener('click', async () => {
      const hostInput = modal.querySelector('#host-input') as HTMLInputElement;
      const credentialSelect = modal.querySelector('#credential-select') as HTMLSelectElement;
      const displayModeSelect = modal.querySelector('#display-mode-select') as HTMLSelectElement;
      const viewModeSelect = modal.querySelector('#view-mode-select') as HTMLSelectElement;
      const maxDetectionsInput = modal.querySelector('#max-detections-input') as HTMLInputElement;
      const refreshInput = modal.querySelector('#refresh-input') as HTMLInputElement;

      const host = hostInput.value.trim();
      const credentialId = parseInt(credentialSelect.value);
      const displayMode = displayModeSelect.value;
      const viewMode = viewModeSelect.value;
      const maxDetections = parseInt(maxDetectionsInput.value);
      const refreshInterval = parseInt(refreshInput.value);

      if (!host) {
        alert('Please enter UniFi Protect console URL');
        return;
      }

      if (!credentialId) {
        alert('Please select credentials for UniFi Protect authentication');
        return;
      }

      const newContent: UnifiProtectContent = {
        host,
        credentialId,
        displayMode: displayMode as 'detections' | 'cameras' | 'both',
        viewMode: viewMode as 'snapshots' | 'streams' | 'both',
        maxDetections,
        refreshInterval,
        selectedCameras: content.selectedCameras || [],
        detectionTypes: content.detectionTypes || [],
        autoRefreshDetections: content.autoRefreshDetections ?? true
      };

      // Dispatch update event
      const event = new CustomEvent('widget-update', {
        detail: { id: widget.id, content: newContent }
      });
      document.dispatchEvent(event);

      overlay.remove();
    });

    // Handle cancel
    const cancelBtn = modal.querySelector('#cancel-btn');
    cancelBtn?.addEventListener('click', () => {
      overlay.remove();
    });

    // Handle overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });
  }

  private renderDetections(container: HTMLElement, data: ProtectBootstrap, content: UnifiProtectContent): void {
    const events = data.events || [];
    const maxDetections = content.maxDetections || 10;
    const displayEvents = events.slice(0, maxDetections);

    if (displayEvents.length === 0) {
      container.innerHTML = `
        <div class="widget-empty">
          <div class="widget-empty-icon">✓</div>
          <div class="widget-text">No recent detections</div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="flex flex-column gap-12">
        <h4 class="protect-section-title">
          Recent Detections (${displayEvents.length})
        </h4>
        <div class="detections-list flex flex-column gap-8">
          ${displayEvents.map(event => this.renderDetectionCard(event, content, data.cameras)).join('')}
        </div>
      </div>
    `;
  }

  private renderDetectionCard(event: ProtectEvent, content: UnifiProtectContent, cameras: ProtectCamera[]): string {
    const camera = cameras.find(c => c.id === event.camera);
    const cameraName = camera?.name || 'Unknown Camera';
    const timestamp = new Date(event.start);
    const timeAgo = this.getTimeAgo(timestamp);
    const detectionType = event.smartDetectTypes.length > 0 
      ? event.smartDetectTypes.join(', ') 
      : event.type;

    const thumbnailUrl = event.thumbnail 
      ? `${content.host}/proxy/protect/api/events/${event.id}/thumbnail?${new URLSearchParams({ credentialId: content.credentialId?.toString() || '' })}`
      : '';

    return `
      <div class="card flex gap-12">
        ${thumbnailUrl ? `
          <div class="flex-shrink-0" style="width: 120px; height: 90px;">
            <img src="${thumbnailUrl}" 
              class="w-100 h-100 rounded-8"
              style="object-fit: cover;"
              onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'flex items-center justify-center h-100 text-gray\\'>No Image</div>'">
          </div>
        ` : ''}
        <div class="flex-1 truncate">
          <div class="flex-between items-start mb-4">
            <div class="text-base text-white">${cameraName}</div>
            <div class="text-xs text-gray">${timeAgo}</div>
          </div>
          <div class="flex items-center gap-8 mb-4">
            <span class="status-badge">
              ${detectionType}
            </span>
            ${event.score ? `
              <span class="text-xs text-gray">
                ${Math.round(event.score)}% confidence
              </span>
            ` : ''}
          </div>
          <div class="text-xs text-gray">
            ${timestamp.toLocaleString()}
          </div>
        </div>
      </div>
    `;
  }

  private renderCameras(container: HTMLElement, data: ProtectBootstrap, content: UnifiProtectContent): void {
    let cameras = data.cameras || [];
    
    // Filter by selected cameras if specified
    if (content.selectedCameras && content.selectedCameras.length > 0) {
      cameras = cameras.filter(c => content.selectedCameras!.includes(c.id));
    }

    if (cameras.length === 0) {
      container.innerHTML = `
        <div class="widget-empty">
          <div class="widget-empty-icon"><i class="fas fa-video"></i></div>
          <div class="widget-text">No cameras found</div>
        </div>
      `;
      return;
    }

    const viewMode = content.viewMode || 'snapshots';
    
    container.innerHTML = `
      <div class="flex flex-column gap-12">
        <h4 class="protect-section-title">
          Cameras (${cameras.length})
        </h4>
        <div class="cameras-grid protect-cameras-grid">
          ${cameras.map(camera => this.renderCameraCard(camera, content, viewMode)).join('')}
        </div>
      </div>
    `;
  }

  private renderCameraCard(camera: ProtectCamera, content: UnifiProtectContent, viewMode: string): string {
    const isOnline = camera.isConnected;
    const statusColor = isOnline ? 'var(--success)' : 'var(--error)';
    const statusText = isOnline ? 'Online' : 'Offline';
    
    const snapshotUrl = isOnline 
      ? `/api/unifi-protect/camera/${camera.id}/snapshot?host=${encodeURIComponent(content.host)}&credentialId=${content.credentialId}&ts=${Date.now()}`
      : '';

    return `
      <div style="background: var(--bg); border-radius: 8px; border: 1px solid var(--border); overflow: hidden;">
        ${(viewMode === 'snapshots' || viewMode === 'both') && isOnline ? `
          <div style="width: 100%; height: 180px; background: var(--surface); position: relative;">
            <img src="${snapshotUrl}" 
              style="width: 100%; height: 100%; object-fit: cover;"
              onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:14px;\\'>Snapshot unavailable</div>'">
            ${camera.isRecording ? `
              <div style="position: absolute; top: 8px; right: 8px; background: rgba(220, 38, 38, 0.9); color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                <span style="width: 8px; height: 8px; background: white; border-radius: 50%; animation: pulse 1.5s ease-in-out infinite;"></span>
                REC
              </div>
            ` : ''}
            ${camera.isMotionDetected ? `
              <div style="position: absolute; top: 8px; left: 8px; background: rgba(249, 115, 22, 0.9); color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">
                🚨 MOTION
              </div>
            ` : ''}
          </div>
        ` : `
          <div style="width: 100%; height: 180px; background: var(--surface); display: flex; align-items: center; justify-content: center; color: var(--muted);">
            <div style="text-align: center;">
              <div style="font-size: 48px; margin-bottom: 8px;"><i class="fas fa-video"></i></div>
              <div style="font-size: 14px;">${isOnline ? 'Camera' : 'Offline'}</div>
            </div>
          </div>
        `}
        <div style="padding: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
            <div style="font-weight: 600; font-size: 14px; color: var(--text);">${camera.name}</div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="width: 8px; height: 8px; background: ${statusColor}; border-radius: 50%;"></span>
              <span style="font-size: 12px; color: ${statusColor};">${statusText}</span>
            </div>
          </div>
          <div style="font-size: 12px; color: var(--muted); margin-bottom: 8px;">
            ${camera.model}
          </div>
          ${isOnline && camera.lastSeen ? `
            <div style="font-size: 11px; color: var(--muted);">
              Last seen: ${this.getTimeAgo(new Date(camera.lastSeen))}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  private renderBoth(container: HTMLElement, data: ProtectBootstrap, content: UnifiProtectContent): void {
    let cameras = data.cameras || [];
    
    // Filter by selected cameras if specified
    if (content.selectedCameras && content.selectedCameras.length > 0) {
      cameras = cameras.filter(c => content.selectedCameras!.includes(c.id));
    }

    const events = data.events || [];
    const maxDetections = content.maxDetections || 10;
    const displayEvents = events.slice(0, maxDetections);
    const viewMode = content.viewMode || 'snapshots';

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 20px;">
        ${cameras.length > 0 ? `
          <div>
            <h4 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: var(--text);">
              Cameras (${cameras.length})
            </h4>
            <div class="cameras-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px;">
              ${cameras.map(camera => this.renderCameraCard(camera, content, viewMode)).join('')}
            </div>
          </div>
        ` : ''}
        
        ${displayEvents.length > 0 ? `
          <div>
            <h4 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: var(--text);">
              Recent Detections (${displayEvents.length})
            </h4>
            <div class="detections-list" style="display: flex; flex-direction: column; gap: 8px;">
              ${displayEvents.map(event => this.renderDetectionCard(event, content, data.cameras)).join('')}
            </div>
          </div>
        ` : `
          <div style="text-align: center; padding: 20px; color: var(--muted);">
            <div style="font-size: 14px;">No recent detections</div>
          </div>
        `}
      </div>
    `;
  }

  private getTimeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  destroy(widget: Widget): void {
    const interval = this.updateIntervals.get(widget.id);
    if (interval) {
      clearInterval(interval);
      this.updateIntervals.delete(widget.id);
    }

    const stream = this.eventStreams.get(widget.id);
    if (stream) {
      stream.close();
      this.eventStreams.delete(widget.id);
    }
  }
}

export const widget = {
  type: 'unifi-protect',
  title: 'UniFi Protect',
  name: 'UniFi Protect',
  icon: '<i class="fas fa-video"></i>',
  description: 'View UniFi Protect cameras and motion detections',
  renderer: new UnifiProtectRenderer(),
  defaultContent: {
    host: '',
    displayMode: 'both',
    viewMode: 'snapshots',
    maxDetections: 10,
    refreshInterval: 30,
    selectedCameras: [],
    detectionTypes: [],
    autoRefreshDetections: true
  },
  hasSettings: true
};
