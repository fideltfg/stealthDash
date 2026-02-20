import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';
import { credentialsService } from '../services/credentials';
import { getPingServerUrl, getAuthHeaders } from '../utils/api';
import { WidgetPoller } from '../utils/polling';
import { dispatchWidgetUpdate, stopAllDragPropagation } from '../utils/dom';
import { formatTimeAgo } from '../utils/formatting';

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
  private poller = new WidgetPoller();
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

    // Close existing event stream
    const existingStream = this.eventStreams.get(widget.id);
    if (existingStream) {
      existingStream.close();
      this.eventStreams.delete(widget.id);
    }

    // Create widget structure
    container.innerHTML = `
      <div class="unifi-protect-widget">
        <div class="protect-content card-list">
          <div class="protect-loading widget-loading centered">
            Loading cameras and detections...
          </div>
        </div>
      </div>
    `;

    const contentEl = container.querySelector('.protect-content') as HTMLElement;
    
    const fetchAndRender = async () => {
      try {
        if (!content.credentialId) {
          throw new Error('No credential configured. Please edit widget and select a saved credential.');
        }

        // Fetch bootstrap data from UniFi Protect
        const proxyUrl = new URL('/api/unifi-protect/bootstrap', getPingServerUrl());
        proxyUrl.searchParams.set('host', content.host);
        proxyUrl.searchParams.set('credentialId', content.credentialId.toString());
        
        const response = await fetch(proxyUrl.toString(), {
          headers: getAuthHeaders(false)
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


    // Start polling (fires immediately, then every interval)
    const interval = content.refreshInterval || 30;
    this.poller.start(widget.id, fetchAndRender, interval * 1000);
  }

  private renderConfigPrompt(container: HTMLElement, widget: Widget): void {
    container.innerHTML = `
      <div class="widget-container flex flex-column align-center justify-center text-center">
        <div class="widget-config-icon"><i class="fas fa-video"></i></div>
        <h3 class="widget-title mb-12">UniFi Protect Not Configured</h3>
        <p class="widget-text mb-20" style="max-width: 400px;">
          Configure this widget to display camera feeds and motion detections from your UniFi Protect console.
        </p>
        <button class="config-btn widget-button primary">
          Configure Widget
        </button>
      </div>
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
      <h2 class="widget-dialog-title large mb-20">
        Configure UniFi Protect Widget
      </h2>
      
      <div class="widget-dialog-field large-margin">
        <label class="widget-dialog-label">
          UniFi Protect Console URL *
        </label>
        <input type="text" id="host-input" placeholder="https://192.168.1.1" value="${content.host || ''}"
          class="widget-dialog-input">
        <small class="widget-dialog-hint">
          URL of your UniFi Protect console (Cloud Key, UDM Pro, UNVR, etc.)
        </small>
      </div>

      <div class="widget-dialog-field large-margin">
        <label class="widget-dialog-label">
          Credentials *
        </label>
        <select id="credential-select" 
          class="widget-dialog-input">
          <option value="">Select saved credentials...</option>
          ${unifiProtectCreds.map((cred: any) => 
            `<option value="${cred.id}" ${content.credentialId === cred.id ? 'selected' : ''}>
              ${cred.name}
            </option>`
          ).join('')}
        </select>
        <small class="widget-dialog-hint">
          Select credentials from Credentials Manager (local admin user recommended)
        </small>
      </div>

      <div class="widget-dialog-field large-margin">
        <label class="widget-dialog-label">
          Display Mode
        </label>
        <select id="display-mode-select" 
          class="widget-dialog-input">
          <option value="both" ${content.displayMode === 'both' ? 'selected' : ''}>Cameras & Detections</option>
          <option value="cameras" ${content.displayMode === 'cameras' ? 'selected' : ''}>Cameras Only</option>
          <option value="detections" ${content.displayMode === 'detections' ? 'selected' : ''}>Detections Only</option>
        </select>
      </div>

      <div class="widget-dialog-field large-margin">
        <label class="widget-dialog-label">
          Camera View Mode
        </label>
        <select id="view-mode-select" 
          class="widget-dialog-input">
          <option value="snapshots" ${content.viewMode === 'snapshots' ? 'selected' : ''}>Snapshots</option>
          <option value="streams" ${content.viewMode === 'streams' ? 'selected' : ''}>Live Streams</option>
          <option value="both" ${content.viewMode === 'both' ? 'selected' : ''}>Both</option>
        </select>
      </div>

      <div class="widget-dialog-field large-margin">
        <label class="widget-dialog-label">
          Maximum Detections
        </label>
        <input type="number" id="max-detections-input" value="${content.maxDetections || 10}" min="1" max="50"
          class="widget-dialog-input">
      </div>

      <div class="widget-dialog-field large-margin">
        <label class="widget-dialog-label">
          Refresh Interval (seconds)
        </label>
        <input type="number" id="refresh-input" value="${content.refreshInterval || 30}" min="5" max="300"
          class="widget-dialog-input">
      </div>

      <div class="widget-dialog-field large-margin" id="camera-selection-container" style="display: none;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <label class="widget-dialog-label" style="margin-bottom: 0;">
            Select Cameras to Display
          </label>
          <button id="toggle-all-cameras" class="widget-dialog-button" style="padding: 4px 12px; font-size: 12px; display: none;">
            Select All
          </button>
        </div>
        <div id="camera-selection-loading" class="widget-dialog-hint" style="padding: 12px; text-align: center;">
          Loading cameras...
        </div>
        <div id="camera-selection-list" style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border); border-radius: 4px; padding: 8px; display: none;">
        </div>
        <small class="widget-dialog-hint">
          Leave all unchecked to display all cameras
        </small>
      </div>

      <div class="widget-dialog-buttons top-margin">
        <button id="cancel-btn" 
          class="widget-dialog-button-cancel">
          Cancel
        </button>
        <button id="save-btn" 
          class="widget-dialog-button-save">
          Save Configuration
        </button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Function to fetch and display cameras
    const loadCameras = async (host: string, credentialId: number) => {
      const container = modal.querySelector('#camera-selection-container') as HTMLElement;
      const loading = modal.querySelector('#camera-selection-loading') as HTMLElement;
      const list = modal.querySelector('#camera-selection-list') as HTMLElement;
      
      if (!host || !credentialId) {
        container.style.display = 'none';
        return;
      }

      container.style.display = 'block';
      loading.style.display = 'block';
      list.style.display = 'none';
      list.innerHTML = '';

      try {
        const proxyUrl = new URL('/api/unifi-protect/bootstrap', getPingServerUrl());
        proxyUrl.searchParams.set('host', host);
        proxyUrl.searchParams.set('credentialId', credentialId.toString());
        
        const response = await fetch(proxyUrl.toString(), {
          headers: getAuthHeaders(false)
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch cameras: ${response.statusText}`);
        }

        const data: ProtectBootstrap = await response.json();
        const cameras = data.cameras || [];

        if (cameras.length === 0) {
          list.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--muted);">No cameras found</div>';
        } else {
          const selectedCameras = content.selectedCameras || [];
          list.innerHTML = cameras.map(camera => `
            <div style="padding: 8px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--border);">
              <input type="checkbox" 
                id="camera-${camera.id}" 
                value="${camera.id}" 
                class="camera-checkbox"
                ${selectedCameras.length === 0 || selectedCameras.includes(camera.id) ? 'checked' : ''}>
              <label for="camera-${camera.id}" style="flex: 1; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                <span style="font-weight: 500;">${camera.name}</span>
                <span style="color: var(--muted); font-size: 12px;">${camera.model}</span>
                ${camera.isConnected ? '<span style="color: var(--success); font-size: 12px;">●</span>' : '<span style="color: var(--error); font-size: 12px;">●</span>'}
              </label>
            </div>
          `).join('');
        }

        loading.style.display = 'none';
        list.style.display = 'block';
        
        // Show toggle button and update its text
        const toggleBtn = modal.querySelector('#toggle-all-cameras') as HTMLButtonElement;
        if (toggleBtn) {
          toggleBtn.style.display = 'block';
          
          // Function to update button text based on checkbox states
          const updateToggleButtonText = () => {
            const checkboxes = modal.querySelectorAll('.camera-checkbox') as NodeListOf<HTMLInputElement>;
            const allChecked = Array.from(checkboxes).every(cb => cb.checked);
            toggleBtn.textContent = allChecked ? 'Deselect All' : 'Select All';
          };
          
          // Set initial text
          updateToggleButtonText();
          
          // Add listeners to checkboxes to update button text
          const checkboxes = modal.querySelectorAll('.camera-checkbox') as NodeListOf<HTMLInputElement>;
          checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', updateToggleButtonText);
          });
        }
      } catch (error: any) {
        console.error('Error loading cameras:', error);
        list.innerHTML = `<div style="padding: 12px; text-align: center; color: var(--error);">Failed to load cameras: ${error.message}</div>`;
        loading.style.display = 'none';
        list.style.display = 'block';
      }
    };

    // Load cameras if host and credential are already set
    if (content.host && content.credentialId) {
      loadCameras(content.host, content.credentialId);
    }

    // Listen for credential changes to reload cameras
    const hostInput = modal.querySelector('#host-input') as HTMLInputElement;
    const credentialSelect = modal.querySelector('#credential-select') as HTMLSelectElement;
    
    const onConfigChange = () => {
      const host = hostInput.value.trim();
      const credentialId = parseInt(credentialSelect.value);
      if (host && credentialId) {
        loadCameras(host, credentialId);
      }
    };

    hostInput.addEventListener('blur', onConfigChange);
    credentialSelect.addEventListener('change', onConfigChange);

    // Handle toggle all cameras
    const toggleAllBtn = modal.querySelector('#toggle-all-cameras') as HTMLButtonElement;
    toggleAllBtn?.addEventListener('click', () => {
      const checkboxes = modal.querySelectorAll('.camera-checkbox') as NodeListOf<HTMLInputElement>;
      const allChecked = Array.from(checkboxes).every(cb => cb.checked);
      
      checkboxes.forEach(checkbox => {
        checkbox.checked = !allChecked;
      });
      
      // Update button text
      toggleAllBtn.textContent = allChecked ? 'Select All' : 'Deselect All';
    });

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

      // Get selected cameras
      const cameraCheckboxes = modal.querySelectorAll('.camera-checkbox') as NodeListOf<HTMLInputElement>;
      const selectedCameras: string[] = [];
      cameraCheckboxes.forEach(checkbox => {
        if (checkbox.checked) {
          selectedCameras.push(checkbox.value);
        }
      });

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
        selectedCameras: selectedCameras.length > 0 ? selectedCameras : [],
        detectionTypes: content.detectionTypes || [],
        autoRefreshDetections: content.autoRefreshDetections ?? true
      };

      // Dispatch update event
      dispatchWidgetUpdate(widget.id, newContent);

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
        <div class="list">
          ${displayEvents.map(event => this.renderDetectionCard(event, content, data.cameras)).join('')}
        </div>
      </div>
    `;
  }

  private renderDetectionCard(event: ProtectEvent, content: UnifiProtectContent, cameras: ProtectCamera[]): string {
    const camera = cameras.find(c => c.id === event.camera);
    const cameraName = camera?.name || 'Unknown Camera';
    const timestamp = new Date(event.start);
    const timeAgo = formatTimeAgo(timestamp.getTime());
    const detectionType = event.smartDetectTypes.length > 0 
      ? event.smartDetectTypes.join(', ') 
      : event.type;

    const thumbnailUrl = event.thumbnail 
      ? `${content.host}/proxy/protect/api/events/${event.id}/thumbnail?${new URLSearchParams({ credentialId: content.credentialId?.toString() || '' })}`
      : '';

    return `
      <div class="list-item">
        ${thumbnailUrl ? `
          <div class="protect-detection-thumbnail">
            <img src="${thumbnailUrl}" 
              class="protect-detection-img"
              onerror="this.onerror=null; this.src='https://placehold.co/60';">
          </div>
        ` : ''}
        <div class="flex-1 truncate">
          <div class="flex space-between align-start mb-4">
            <div class="protect-detection-camera">${cameraName}</div>
            <div class="protect-detection-time">${timeAgo}</div>
          </div>
          <div class="flex align-center gap-8 mb-4">
            <span class="protect-detection-badge">
              ${detectionType}
            </span>
            ${event.score ? `
              <span class="protect-detection-confidence">
                ${Math.round(event.score)}% confidence
              </span>
            ` : ''}
          </div>
          <div class="protect-detection-timestamp">
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
      <div class="card-list">
        ${cameras.map(camera => this.renderCameraCard(camera, content, viewMode)).join('')}
      </div>
    `;
  }

  private renderCameraCard(camera: ProtectCamera, content: UnifiProtectContent, viewMode: string): string {
    const isOnline = camera.isConnected;
    const statusColor = isOnline ? 'badge-success' : 'badge-error';
    const statusText = isOnline ? 'Online' : 'Offline';
    
    const snapshotUrl = isOnline 
      ? `/api/unifi-protect/camera/${camera.id}/snapshot?host=${encodeURIComponent(content.host)}&credentialId=${content.credentialId}&ts=${Date.now()}`
      : '';

    return `
      <div class="card" style="overflow: hidden;">
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
            <div class="badge ${statusColor}">${statusText}</div>
            </div>
          </div>
          <div><subtitle style="float: left;">${camera.model}</subtitle><subtitle style="float: right;">Last seen: ${formatTimeAgo(camera.lastSeen)}
            </subtitle>
          </div>
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
      <div style="display: flex; flex-direction: column; gap: 20px; height: 100%;">
        ${cameras.length > 0 ? `
          <div style="flex: 1; display: flex; flex-direction: column; min-height: 0;">
            <h4 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: var(--text); flex-shrink: 0;">
              Cameras (${cameras.length})
            </h4>
            <div class="card-list" style="flex: 1;">
              ${cameras.map(camera => this.renderCameraCard(camera, content, viewMode)).join('')}
            </div>
          </div>
        ` : ''}
        
        ${displayEvents.length > 0 ? `
          <div style="flex-shrink: 0;">
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

  destroy(): void {
    this.poller.stopAll();
    this.eventStreams.forEach(stream => stream.close());
    this.eventStreams.clear();
  }
}

export const widget = {
  type: 'unifi-protect',
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
