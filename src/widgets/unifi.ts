import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';
import { credentialsService } from '../services/credentials';
import { getPingServerUrl, getAuthHeaders } from '../utils/api';
import { WidgetPoller } from '../utils/polling';
import { dispatchWidgetUpdate, stopAllDragPropagation } from '../utils/dom';
import { formatBytes, formatUptime, formatNumber, formatTimeAgo } from '../utils/formatting';

interface UnifiContent {
  host: string; // UniFi Controller host (e.g., 'https://192.168.1.1:8443')
  username?: string; // UniFi controller username (deprecated - use credentialId)
  password?: string; // UniFi controller password (deprecated - use credentialId)
  credentialId?: number; // ID of saved credential to use
  site?: string; // Site name (default: 'default')
  refreshInterval?: number; // Refresh interval in seconds (default: 30)
  displayMode?: 'compact' | 'detailed' | 'minimal' | 'devices' | 'clients' | 'full' | 'active' | 'throughput' | 'speeds'; // Display style
  showClients?: boolean; // Show connected clients count
  showAlerts?: boolean; // Show recent alerts/logs
}

// UniFi API response structures
interface UnifiDevice {
  name: string;
  model: string;
  type: string;
  ip: string;
  mac: string;
  state: number;
  adopted: boolean;
  uptime: number;
  version: string;
  upgradable: boolean;
  num_sta: number;
  user_num_sta: number;
  guest_num_sta: number;
  bytes: number;
  tx_bytes: number;
  rx_bytes: number;
  satisfaction: number;
  cpu: number;
  mem: number;
}

interface UnifiClient {
  name: string;
  mac: string;
  ip: string;
  network: string;
  essid?: string;
  is_guest: boolean;
  is_wired: boolean;
  signal?: number;
  rssi?: number;
  tx_bytes: number;
  rx_bytes: number;
  tx_rate?: number;
  rx_rate?: number;
  uptime: number;
  last_seen: number;
  ap_mac?: string;
  channel?: number;
  radio?: string;
}

interface UnifiAlarm {
  datetime: number;
  msg: string;
  key: string;
  subsystem?: string;
  archived: boolean;
}

interface UnifiStats {
  site_name?: string;
  num_user?: number;
  num_guest?: number;
  num_iot?: number;
  wan_ip?: string;
  uptime?: number;
  wan_uptime?: number;
  gateways?: number;
  switches?: number;
  access_points?: number;
  latency?: number;
  speedtest_ping?: number;
  xput_up?: number;
  xput_down?: number;
  num_lan?: number;
  gateway_status?: string;
  devices?: UnifiDevice[];
  clients?: UnifiClient[];
  alarms?: UnifiAlarm[];
  traffic?: {
    tx_bytes: number;
    rx_bytes: number;
    tx_packets: number;
    rx_packets: number;
  };
}

class UnifiRenderer implements WidgetRenderer {
  private poller = new WidgetPoller();

  configure(widget: Widget): void {
    this.showConfigDialog(widget);
  }

  render(container: HTMLElement, widget: Widget): void {
    const content = widget.content as UnifiContent;
    
   // console.log('UniFi widget render - Full content:', content);
   // console.log('UniFi widget render - Has credentialId?', !!content.credentialId);
    
    // If widget has no host or credential configured, show configuration prompt
    if (!content.host || !content.credentialId) {
      this.renderConfigPrompt(container, widget);
      return;
    }

    // Create widget structure
    container.innerHTML = `
      <div class="unifi-widget w-100 h-100 flex flex-column gap-16 overflow-auto" style="padding: 16px; background: var(--surface);">
        <div class="unifi-header flex space-between align-center mb-16">
          <h3 class="unifi-title flex align-center gap-8">
            <span class="unifi-icon"><i class="fas fa-wifi"></i></span>
            <span>UniFi Network</span>
          </h3>
        </div>
        <div class="unifi-content flex-1 flex flex-column gap-12">
          <div class="widget-loading text-center">
            Loading...
          </div>
        </div>
      </div>
    `;

    const contentEl = container.querySelector('.unifi-content') as HTMLElement;
    
    const fetchAndRender = async () => {
      try {
        // Check if credentialId exists
        if (!content.credentialId) {
          throw new Error('No credential configured. Please edit widget and select a saved credential.');
        }

        // Use the ping-server proxy to avoid CORS issues
        const proxyUrl = new URL('/api/unifi/stats', getPingServerUrl());
        proxyUrl.searchParams.set('host', content.host);
        proxyUrl.searchParams.set('site', content.site || 'default');
        proxyUrl.searchParams.set('credentialId', content.credentialId.toString());
        
        const response = await fetch(proxyUrl.toString(), {
          headers: getAuthHeaders(false)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: response.statusText }));
          throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        const data: UnifiStats = await response.json();
        
        //console.log('UniFi data received:', data);

        // Render based on display mode
        const mode = content.displayMode || 'compact';
        
        if (mode === 'minimal') {
          this.renderMinimal(contentEl, data);
        } else if (mode === 'detailed') {
          this.renderDetailed(contentEl, data);
        } else if (mode === 'devices') {
          this.renderDevices(contentEl, data);
        } else if (mode === 'clients') {
          this.renderClients(contentEl, data);
        } else if (mode === 'full') {
          this.renderFull(contentEl, data);
        } else if (mode === 'active') {
          this.renderMostActive(contentEl, data);
        } else if (mode === 'throughput') {
          this.renderThroughput(contentEl, data);
        } else if (mode === 'speeds') {
          this.renderNetworkSpeeds(contentEl, data);
        } else {
          this.renderCompact(contentEl, data);
        }
        
      } catch (error: any) {
        console.error('Error fetching UniFi data:', error);
        contentEl.innerHTML = `
          <div class="widget-error text-center">
            <div class="widget-error-icon">⚠️</div>
            <div class="widget-error-title" style="color: #ff3b30;">Error loading UniFi data</div>
            <div class="widget-error-message">${error.message}</div>
            <div class="widget-error-hint">Check host: ${content.host}</div>
          </div>
        `;
      }
    };

    // Start polling (fires immediately, then every interval)
    this.poller.start(widget.id, fetchAndRender, (content.refreshInterval || 30) * 1000);
  }

  private renderConfigPrompt(container: HTMLElement, widget: Widget): void {
    container.innerHTML = `
      <div class="widget-config-screen padded text-center h-100">
        <div class="widget-config-icon"><i class="fas fa-wifi"></i></div>
        <div class="unifi-config-title">UniFi Network Widget</div>
        <div class="widget-config-description">Configure your UniFi Controller connection</div>
        <div class="widget-config-sublabel">💡 Tip: Create credentials first from the user menu (🔐 Credentials)</div>
        <button class="configure-btn widget-config-button">Configure</button>
      </div>
    `;

    const configBtn = container.querySelector('.configure-btn');
    configBtn?.addEventListener('click', () => {
      this.showConfigDialog(widget);
    });
  }

  private async showConfigDialog(widget: Widget): Promise<void> {
    const content = widget.content as UnifiContent;
    
    const overlay = document.createElement('div');
    overlay.className = 'widget-overlay';

    const modal = document.createElement('div');
    modal.className = 'widget-dialog scrollable';

    // Load credentials for dropdown
    const credentials = await credentialsService.getAll();
    const unifiCredentials = credentials.filter((c: any) => c.service_type === 'unifi');
    
    const credentialOptions = unifiCredentials.length > 0
      ? unifiCredentials.map((c: any) => 
          `<option value="${c.id}" ${content.credentialId === c.id ? 'selected' : ''} style="background: var(--surface); color: var(--text);">${c.name}</option>`
        ).join('')
      : '<option value="" disabled style="background: var(--surface); color: var(--muted);">No credentials available</option>';

    modal.innerHTML = `
      <div class="unifi-config-header">
        <span class="unifi-config-header-icon"><i class="fas fa-wifi"></i></span>
        <div>
          <h2 class="widget-dialog-title">UniFi Network Configuration</h2>
          <p class="unifi-config-subtitle">Connect to your UniFi Controller</p>
        </div>
      </div>

      <form id="unifi-config-form" class="unifi-config-form">
        <div class="widget-dialog-field">
          <label class="widget-dialog-label">Controller Host *</label>
          <input 
            type="text" 
            id="unifi-host" 
            value="${content.host || 'https://192.168.1.1:8443'}"
            placeholder="https://192.168.1.1:8443 or https://unifi.local:8443"
            required
            class="widget-dialog-input extended"
          />
          <small class="widget-dialog-hint">Include protocol (https://) and port (usually 8443)</small>
        </div>

        <div class="widget-dialog-field">
          <label class="widget-dialog-label">Credentials *</label>
          <select 
            id="unifi-credential"
            required
            class="widget-dialog-input extended"
          >
            <option value="">Select credentials...</option>
            ${credentialOptions}
          </select>
          <small class="widget-dialog-hint">Create credentials from the user menu (🔐 Credentials)</small>
        </div>

        <div class="widget-dialog-field">
          <label class="widget-dialog-label">Site Name</label>
          <input 
            type="text" 
            id="unifi-site" 
            value="${content.site || 'default'}"
            placeholder="default"
            class="widget-dialog-input extended"
          />
          <small class="widget-dialog-hint">Usually "default" unless you have multiple sites</small>
        </div>

        <div class="widget-dialog-field">
          <label class="widget-dialog-label">Display Mode</label>
          <select 
            id="unifi-display-mode"
            class="widget-dialog-input extended"
          >
            <option value="minimal" ${content.displayMode === 'minimal' ? 'selected' : ''}>Minimal - Client count only</option>
            <option value="compact" ${content.displayMode === 'compact' ? 'selected' : ''}>Compact - Key stats</option>
            <option value="detailed" ${content.displayMode === 'detailed' ? 'selected' : ''}>Detailed - Infrastructure view</option>
            <option value="devices" ${content.displayMode === 'devices' ? 'selected' : ''}>Devices - Full device list</option>
            <option value="clients" ${content.displayMode === 'clients' ? 'selected' : ''}>Clients - Active connections</option>
            <option value="active" ${content.displayMode === 'active' ? 'selected' : ''}>Most Active - Top clients by traffic</option>
            <option value="throughput" ${content.displayMode === 'throughput' ? 'selected' : ''}>Throughput - Network traffic analysis</option>
            <option value="speeds" ${content.displayMode === 'speeds' ? 'selected' : ''}>Network Speeds - WAN & client speeds</option>
            <option value="full" ${content.displayMode === 'full' ? 'selected' : ''}>Full - Complete overview</option>
          </select>
        </div>

        <div class="widget-dialog-field">
          <label class="widget-dialog-label">Refresh Interval (seconds)</label>
          <input 
            type="number" 
            id="unifi-refresh" 
            value="${content.refreshInterval || 30}"
            min="10"
            max="300"
            class="widget-dialog-input extended"
          />
        </div>

        <div class="widget-dialog-buttons top-margin">
          <button type="submit" class="widget-dialog-button-save extended">Save</button>
          <button type="button" id="cancel-btn" class="widget-dialog-button-cancel extended">Cancel</button>
        </div>
      </form>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Handle form submission
    const form = modal.querySelector('#unifi-config-form') as HTMLFormElement;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const hostInput = document.getElementById('unifi-host') as HTMLInputElement;
      const credentialSelect = document.getElementById('unifi-credential') as HTMLSelectElement;
      const siteInput = document.getElementById('unifi-site') as HTMLInputElement;
      const displayModeSelect = document.getElementById('unifi-display-mode') as HTMLSelectElement;
      const refreshInput = document.getElementById('unifi-refresh') as HTMLInputElement;

      // Prevent drag propagation on all interactive elements
      stopAllDragPropagation(modal);
      
      const host = hostInput.value.trim();
      const credentialId = parseInt(credentialSelect.value);
      const site = siteInput.value.trim();
      const displayMode = displayModeSelect.value;
      const refreshInterval = parseInt(refreshInput.value);

      // Validate credential selection
      if (!credentialId) {
        alert('Please select credentials for UniFi authentication');
        return;
      }

      console.log('Saving UniFi config:', { host, credentialId, site, displayMode, refreshInterval });

      const newContent: UnifiContent = {
        host,
        credentialId,
        site,
        displayMode: displayMode as 'minimal' | 'compact' | 'detailed' | 'devices' | 'clients' | 'full' | 'active' | 'throughput' | 'speeds',
        refreshInterval,
        showClients: content.showClients ?? true,
        showAlerts: content.showAlerts ?? true
      };

      console.log('New content being saved');

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

  private renderMinimal(container: HTMLElement, data: UnifiStats): void {
    const clients = (data.num_user || 0);
    
    container.innerHTML = `
      <div class="unifi-minimal flex flex-column gap-12 align-center justify-center h-100">
        <div class="unifi-minimal-value">${clients}</div>
        <div class="unifi-minimal-label">Connected Clients</div>
      </div>
    `;
  }

  private renderCompact(container: HTMLElement, data: UnifiStats): void {
    const clients = (data.num_user || 0);
    const guests = (data.num_guest || 0);
    const devices = (data.gateways || 0) + (data.switches || 0) + (data.access_points || 0);
    
    container.innerHTML = `
      <div class="unifi-compact flex flex-column gap-12">
        <div class="unifi-stats-grid">
          <div class="unifi-stat-card">
            <div class="unifi-stat-value accent">${clients}</div>
            <div class="unifi-stat-label">Clients</div>
          </div>
          
          <div class="unifi-stat-card">
            <div class="unifi-stat-value">${guests}</div>
            <div class="unifi-stat-label">Guests</div>
          </div>
          
          <div class="unifi-stat-card">
            <div class="unifi-stat-value">${devices}</div>
            <div class="unifi-stat-label">Devices</div>
          </div>
        </div>
        
        ${data.site_name ? `
          <div class="unifi-info-row">
            <span class="unifi-info-label">Site</span>
            <span class="unifi-info-value">${data.site_name}</span>
          </div>
        ` : ''}
        
        ${data.wan_ip ? `
          <div class="unifi-info-row">
            <span class="unifi-info-label">WAN IP</span>
            <span class="unifi-info-value mono">${data.wan_ip}</span>
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderDetailed(container: HTMLElement, data: UnifiStats): void {
    const clients = (data.num_user || 0);
    const guests = (data.num_guest || 0);
    const iot = (data.num_iot || 0);
    const gateways = (data.gateways || 0);
    const switches = (data.switches || 0);
    const aps = (data.access_points || 0);
    const uptime = data.uptime ? formatUptime(data.uptime) : 'Unknown';
    
    container.innerHTML = `
      <div class="unifi-detailed flex flex-column gap-16">
        <div class="unifi-stats-grid-small">
          <div class="unifi-stat-card">
            <div class="unifi-stat-value-small accent">${clients}</div>
            <div class="unifi-stat-label-small">Clients</div>
          </div>
          
          <div class="unifi-stat-card">
            <div class="unifi-stat-value-small">${guests}</div>
            <div class="unifi-stat-label-small">Guests</div>
          </div>
          
          <div class="unifi-stat-card">
            <div class="unifi-stat-value-small">${iot}</div>
            <div class="unifi-stat-label-small">IoT</div>
          </div>
        </div>
        
        <div class="unifi-section">
          <div class="unifi-section-title">Infrastructure</div>
          <div class="flex flex-column gap-8">
            <div class="unifi-info-row">
              <span class="unifi-info-label"><i class="fas fa-globe"></i> Gateways</span>
              <span class="unifi-info-value">${gateways}</span>
            </div>
            <div class="unifi-info-row">
              <span class="unifi-info-label"><i class="fas fa-network-wired"></i> Switches</span>
              <span class="unifi-info-value">${switches}</span>
            </div>
            <div class="unifi-info-row">
              <span class="unifi-info-label"><i class="fas fa-wifi"></i> Access Points</span>
              <span class="unifi-info-value">${aps}</span>
            </div>
          </div>
        </div>
        
        <div class="unifi-section">
          <div class="flex flex-column gap-8">
            ${data.site_name ? `
              <div class="unifi-info-row">
                <span class="unifi-info-label">Site</span>
                <span class="unifi-info-value">${data.site_name}</span>
              </div>
            ` : ''}
            ${data.wan_ip ? `
              <div class="unifi-info-row">
                <span class="unifi-info-label">WAN IP</span>
                <span class="unifi-info-value mono">${data.wan_ip}</span>
              </div>
            ` : ''}
            <div class="unifi-info-row">
              <span class="unifi-info-label">Uptime</span>
              <span class="unifi-info-value">${uptime}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderDevices(container: HTMLElement, data: UnifiStats): void {
    const devices = data.devices || [];
    
    container.innerHTML = `
      <div class="flex flex-column gap-12 h-100 overflow-auto">
        <div class="unifi-devices-header">
          <div class="unifi-devices-title">Network Devices (${devices.length})</div>
          <div class="unifi-devices-summary">${(data.gateways || 0)} GW | ${(data.switches || 0)} SW | ${(data.access_points || 0)} AP</div>
        </div>
        
        ${devices.length === 0 ? `
          <div class="widget-loading text-center">No devices found</div>
        ` : devices.map(device => {
          const statusColor = device.state === 1 ? '#34c759' : '#ff3b30';
          const typeIcon = device.type === 'uap' ? '<i class="fas fa-wifi"></i>' : device.type === 'usw' ? '<i class="fas fa-network-wired"></i>' : device.type === 'ugw' ? '<i class="fas fa-globe"></i>' : '<i class="fas fa-server"></i>';
          
          return `
            <div class="unifi-device-card" style="border-left-color: ${statusColor};">
              <div class="unifi-device-header">
                <div class="unifi-device-icon-wrapper">
                  <span class="unifi-device-icon">${typeIcon}</span>
                  <div>
                    <div class="unifi-device-name">${device.name}</div>
                    <div class="unifi-device-ip">${device.ip}</div>
                  </div>
                </div>
                ${device.upgradable ? '<span class="unifi-device-badge">Update</span>' : ''}
              </div>
              
              <div class="unifi-device-info-grid">
                <div class="unifi-device-info-item">
                  <span class="widget-muted">Model:</span>
                  <span class="widget-text-bold">${device.model || 'N/A'}</span>
                </div>
                <div class="unifi-device-info-item">
                  <span class="widget-muted">Clients:</span>
                  <span class="widget-text-bold">${device.num_sta || 0}</span>
                </div>
                <div class="unifi-device-info-item">
                  <span class="widget-muted">Uptime:</span>
                  <span class="widget-text-bold">${formatUptime(device.uptime || 0)}</span>
                </div>
                ${device.satisfaction !== undefined ? `
                  <div class="unifi-device-info-item">
                    <span class="widget-muted">Score:</span>
                    <span class="widget-text-bold">${device.satisfaction}%</span>
                  </div>
                ` : ''}
                ${device.cpu !== undefined ? `
                  <div class="unifi-device-info-item">
                    <span class="widget-muted">CPU:</span>
                    <span class="widget-text-bold">${device.cpu}%</span>
                  </div>
                ` : ''}
                ${device.mem !== undefined ? `
                  <div class="unifi-device-info-item">
                    <span class="widget-muted">Memory:</span>
                    <span class="widget-text-bold">${device.mem}%</span>
                  </div>
                ` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  private renderClients(container: HTMLElement, data: UnifiStats): void {
    const clients = data.clients || [];
    
    // Check if we need to do initial render
    let clientsList = container.querySelector('#unifi-clients-list') as HTMLElement;
    
    if (!clientsList) {
      // Get unique virtual network names
      const virtualNetworks = new Set(
        clients
          .map(c => c.network)
          .filter(Boolean)
      );
      const networks = ['All', ...Array.from(virtualNetworks)].sort((a, b) => {
        if (a === 'All') return -1;
        if (b === 'All') return 1;
        return a.localeCompare(b);
      });
      
      // Initial render - create the structure
      container.innerHTML = `
        <div class="unifi-clients-wrapper">
          <div class="unifi-clients-header">
            <div class="unifi-clients-header-row">
              <div class="unifi-clients-title">Active Clients (<span id="client-count">${clients.length}</span>)</div>
              <div class="flex gap-8 align-center">
                <button id="clear-inactive" class="unifi-clear-btn" style="display: none;" title="Clear disconnected clients">
                  <i class="fas fa-trash"></i>
                </button>
                <div class="unifi-clients-stats">
                  ${clients.filter(c => c.is_wired).length} wired | ${clients.filter(c => !c.is_wired).length} wireless
                </div>
              </div>
            </div>
            
            <div class="unifi-search-controls">
              <input 
                type="text" 
                id="client-search" 
                placeholder="Search by name or IP..." 
                class="unifi-search-input"
              />
              <select id="sort-by" class="unifi-sort-select">
                <option value="traffic">Sort: Traffic</option>
                <option value="name">Sort: Name</option>
                <option value="ip">Sort: IP</option>
                <option value="signal">Sort: Signal</option>
                <option value="uptime">Sort: Uptime</option>
              </select>
              <button id="sort-reverse" class="unifi-sort-button" title="Reverse sort order">
                <i class="fas fa-arrow-down-wide-short"></i>
              </button>
              <select id="connection-filter" class="unifi-filter-select">
                <option value="all">All</option>
                <option value="wired">Wired</option>
                <option value="wireless">Wireless</option>
              </select>
              <select id="network-filter" class="unifi-filter-select">
                ${networks.map(net => `<option value="${net}">${net}</option>`).join('')}
              </select>
            </div>
          </div>
          
          <div id="unifi-clients-list" class="unifi-clients-list"></div>
        </div>
      `;
      
      clientsList = container.querySelector('#unifi-clients-list') as HTMLElement;
      
      // Set up event listeners once
      this.setupClientListeners(container, clientsList);
    }
    
    // Update client list
    this.updateClientsList(clientsList, clients, container);
  }

  private setupClientListeners(container: HTMLElement, clientsList: HTMLElement): void {
    const searchInput = container.querySelector('#client-search') as HTMLInputElement;
    const sortBy = container.querySelector('#sort-by') as HTMLSelectElement;
    const sortReverse = container.querySelector('#sort-reverse') as HTMLButtonElement;
    const connectionFilter = container.querySelector('#connection-filter') as HTMLSelectElement;
    const networkFilter = container.querySelector('#network-filter') as HTMLSelectElement;
    const clearInactiveBtn = container.querySelector('#clear-inactive') as HTMLButtonElement;
    const clientCount = container.querySelector('#client-count') as HTMLElement;
    
    let isReversed = false;
    
    const sortClients = () => {
      const sortValue = sortBy.value;
      const cards = Array.from(clientsList.querySelectorAll('.unifi-client-card')) as HTMLElement[];
      
      cards.sort((a, b) => {
        let result = 0;
        switch (sortValue) {
          case 'name':
            result = (a.dataset.name || '').localeCompare(b.dataset.name || '');
            break;
          case 'ip':
            const ipA = (a.dataset.ip || '').split('.').map(n => parseInt(n) || 0);
            const ipB = (b.dataset.ip || '').split('.').map(n => parseInt(n) || 0);
            for (let i = 0; i < 4; i++) {
              if (ipA[i] !== ipB[i]) {
                result = ipA[i] - ipB[i];
                break;
              }
            }
            break;
          case 'signal':
            result = (parseInt(b.dataset.signal || '0') || -999) - (parseInt(a.dataset.signal || '0') || -999);
            break;
          case 'uptime':
            result = parseInt(b.dataset.uptime || '0') - parseInt(a.dataset.uptime || '0');
            break;
          case 'traffic':
          default:
            result = parseInt(b.dataset.traffic || '0') - parseInt(a.dataset.traffic || '0');
            break;
        }
        return isReversed ? -result : result;
      });
      
      cards.forEach(card => clientsList.appendChild(card));
    };
    
    const filterClients = () => {
      const searchTerm = searchInput.value.toLowerCase();
      const selectedConnection = connectionFilter.value;
      const selectedNetwork = networkFilter.value;
      const cards = clientsList.querySelectorAll('.unifi-client-card');
      
      let visibleCount = 0;
      cards.forEach(card => {
        const htmlCard = card as HTMLElement;
        const name = htmlCard.dataset.name || '';
        const ip = htmlCard.dataset.ip || '';
        const network = htmlCard.dataset.network || '';
        const connection = htmlCard.dataset.connection || '';
        const isInactive = htmlCard.classList.contains('inactive');
        
        const matchesSearch = !searchTerm || name.includes(searchTerm) || ip.includes(searchTerm);
        const matchesConnection = selectedConnection === 'all' || connection === selectedConnection;
        const matchesNetwork = selectedNetwork === 'All' || network === selectedNetwork;
        
        if (matchesSearch && matchesConnection && matchesNetwork) {
          htmlCard.style.display = '';
          if (!isInactive) visibleCount++;
        } else {
          htmlCard.style.display = 'none';
        }
      });
      
      clientCount.textContent = visibleCount.toString();
    };
    
    if (searchInput) {
      searchInput.addEventListener('input', filterClients);
      searchInput.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
    
    if (sortBy) {
      sortBy.addEventListener('change', sortClients);
      sortBy.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
    
    if (sortReverse) {
      sortReverse.addEventListener('click', () => {
        isReversed = !isReversed;
        sortReverse.innerHTML = isReversed 
          ? '<i class="fas fa-arrow-up-wide-short"></i>' 
          : '<i class="fas fa-arrow-down-wide-short"></i>';
        sortClients();
      });
      sortReverse.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
    
    if (connectionFilter) {
      connectionFilter.addEventListener('change', filterClients);
      connectionFilter.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
    
    if (networkFilter) {
      networkFilter.addEventListener('change', filterClients);
      networkFilter.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
    
    if (clearInactiveBtn) {
      clearInactiveBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
      clearInactiveBtn.addEventListener('click', () => {
        clientsList.querySelectorAll('.unifi-client-card.inactive').forEach(card => card.remove());
        clearInactiveBtn.style.display = 'none';
        const activeCount = clientsList.querySelectorAll('.unifi-client-card:not(.inactive)').length;
        clientCount.textContent = activeCount.toString();
      });
    }
  }

  private updateClientsList(clientsList: HTMLElement, clients: UnifiClient[], container: HTMLElement): void {
    if (clients.length === 0) {
      clientsList.innerHTML = `<div class="widget-loading text-center">No active clients</div>`;
      return;
    }
    
    // Get existing cards
    const existingCards = Array.from(clientsList.querySelectorAll('.unifi-client-card'));
    const newMacs = new Set(clients.map(c => c.mac));
    
    // Mark clients that no longer exist as inactive
    const clearInactiveBtn = container.querySelector('#clear-inactive') as HTMLButtonElement;
    let hasInactive = false;
    
    existingCards.forEach(card => {
      const cardEl = card as HTMLElement;
      const cardMac = cardEl.dataset.mac;
      if (cardMac && !newMacs.has(cardMac)) {
        cardEl.classList.add('inactive');
        hasInactive = true;
      }
    });
    
    if (clearInactiveBtn) {
      clearInactiveBtn.style.display = hasInactive ? '' : 'none';
    }
    
    // Update or add clients
    clients.forEach(client => {
      const existingCard = clientsList.querySelector(`[data-mac="${client.mac}"]`) as HTMLElement;
      const cardHtml = this.renderClientCard(client);
      
      if (existingCard) {
        // Update existing card
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = cardHtml;
        const newCard = tempDiv.firstElementChild as HTMLElement;
        
        // Only update if content has changed
        if (existingCard.innerHTML !== newCard.innerHTML) {
          existingCard.innerHTML = newCard.innerHTML;
          // Update data attributes
          Object.keys(newCard.dataset).forEach(key => {
            existingCard.dataset[key] = newCard.dataset[key];
          });
        }
        
        // Remove inactive class if it was there
        existingCard.classList.remove('inactive');
      } else {
        // Add new card
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = cardHtml;
        const newCard = tempDiv.firstElementChild as HTMLElement;
        clientsList.appendChild(newCard);
      }
    });
    
    // Update counts
    const clientCount = container.querySelector('#client-count') as HTMLElement;
    const activeCount = clients.length;
    if (clientCount) {
      clientCount.textContent = activeCount.toString();
    }
  }

  private renderClientCard(client: UnifiClient): string {
    const isWired = client.is_wired;
    const connIcon = isWired ? '<i class="fas fa-ethernet"></i>' : '<i class="fas fa-wifi"></i>';
    const totalBytes = client.tx_bytes + client.rx_bytes;
    const signalBars = client.signal ? 
      (client.signal >= -50 ? '▂▃▅▆█' : client.signal >= -60 ? '▂▃▅▆▁' : client.signal >= -70 ? '▂▃▅▁▁' : '▂▃▁▁▁') : '';
    
    return `
      <div class="unifi-client-card" 
        data-mac="${client.mac}"
        data-name="${client.name.toLowerCase()}" 
        data-ip="${client.ip || ''}" 
        data-network="${client.network || 'Unknown'}" 
        data-connection="${isWired ? 'wired' : 'wireless'}"
        data-signal="${client.signal || 0}"
        data-uptime="${client.uptime || 0}"
        data-traffic="${totalBytes}"
      >
        <div class="unifi-device-header mb-8">
          <div class="unifi-device-icon-wrapper">
            <span class="unifi-client-icon">${connIcon}</span>
            <div>
              <div class="unifi-client-name">${client.name}</div>
              <div class="unifi-client-ip">${client.ip || 'No IP'}</div>
            </div>
          </div>
          ${client.is_guest ? '<span class="unifi-badge unifi-badge-guest">Guest</span>' : ''}
        </div>
        
        <div class="unifi-client-info-grid">
          ${!isWired && client.essid ? `
            <div class="unifi-client-info-item full-width">
              <span class="widget-muted">Network:</span>
              <span class="widget-text-bold">${client.essid}</span>
            </div>
          ` : ''}
          ${!isWired && client.signal ? `
            <div class="unifi-client-info-item">
              <span class="widget-muted">Signal:</span>
              <span class="widget-text-bold mono">${signalBars} ${client.signal}dBm</span>
            </div>
          ` : ''}
          ${!isWired && client.channel ? `
            <div class="unifi-client-info-item">
              <span class="widget-muted">Channel:</span>
              <span class="widget-text-bold">${client.channel} ${client.radio || ''}</span>
            </div>
          ` : ''}
          <div class="unifi-client-info-item">
            <span class="widget-muted">↑ TX:</span>
            <span class="widget-text-bold">${formatBytes(client.tx_bytes)}</span>
          </div>
          <div class="unifi-client-info-item">
            <span class="widget-muted">↓ RX:</span>
            <span class="widget-text-bold">${formatBytes(client.rx_bytes)}</span>
          </div>
          <div class="unifi-client-info-item">
            <span class="widget-muted">Total:</span>
            <span class="widget-text-bold">${formatBytes(totalBytes)}</span>
          </div>
          <div class="unifi-client-info-item">
            <span class="widget-muted">Uptime:</span>
            <span class="widget-text-bold">${formatUptime(client.uptime || 0)}</span>
          </div>
        </div>
      </div>
    `;
  }

  private renderFull(container: HTMLElement, data: UnifiStats): void {
    const clients = data.clients || [];
    const devices = data.devices || [];
    const alarms = data.alarms || [];
    
    container.innerHTML = `
      <div class="unifi-full flex flex-column gap-16 h-100 overflow-auto">
        <!-- Summary Stats -->
        <div class="unifi-stats-grid-full">
          <div class="unifi-stat-card-compact">
            <div class="unifi-stat-value-compact accent">${data.num_user || 0}</div>
            <div class="unifi-stat-label-tiny">Clients</div>
          </div>
          <div class="unifi-stat-card-compact">
            <div class="unifi-stat-value-compact">${devices.length}</div>
            <div class="unifi-stat-label-tiny">Devices</div>
          </div>
          <div class="unifi-stat-card-compact">
            <div class="unifi-stat-value-compact">${data.num_guest || 0}</div>
            <div class="unifi-stat-label-tiny">Guests</div>
          </div>
        </div>

        <!-- WAN Info -->
        ${data.wan_ip || data.xput_down ? `
          <div class="unifi-card">
            <div class="unifi-card-title">WAN</div>
            <div class="unifi-card-content">
              ${data.wan_ip ? `
                <div class="unifi-info-item">
                  <span class="widget-muted">IP:</span>
                  <span class="widget-text-bold mono">${data.wan_ip}</span>
                </div>
              ` : ''}
              ${data.xput_down ? `
                <div class="unifi-info-item">
                  <span class="widget-muted">↓ Download:</span>
                  <span class="widget-text-bold">${(data.xput_down / 1000000).toFixed(1)} Mbps</span>
                </div>
              ` : ''}
              ${data.xput_up ? `
                <div class="unifi-info-item">
                  <span class="widget-muted">↑ Upload:</span>
                  <span class="widget-text-bold">${(data.xput_up / 1000000).toFixed(1)} Mbps</span>
                </div>
              ` : ''}
              ${data.latency ? `
                <div class="unifi-info-item">
                  <span class="widget-muted">Latency:</span>
                  <span class="widget-text-bold">${data.latency}ms</span>
                </div>
              ` : ''}
            </div>
          </div>
        ` : ''}

        <!-- Devices Section -->
        ${devices.length > 0 ? `
          <div>
            <div class="unifi-list-title">Devices (${devices.length})</div>
            <div class="flex flex-column gap-8">
              ${devices.slice(0, 5).map(device => {
                const statusColor = device.state === 1 ? '#34c759' : '#ff3b30';
                const typeIcon = device.type === 'uap' ? '<i class="fas fa-wifi"></i>' : device.type === 'usw' ? '<i class="fas fa-network-wired"></i>' : '<i class="fas fa-globe"></i>';
                
                return `
                  <div class="unifi-device-mini" style="border-left-color: ${statusColor};">
                    <div class="unifi-device-mini-content">
                      <div class="flex align-center gap-8">
                        <span class="unifi-device-mini-icon">${typeIcon}</span>
                        <span class="unifi-device-mini-name">${device.name}</span>
                      </div>
                      <span class="unifi-device-mini-clients">${device.num_sta || 0} clients</span>
                    </div>
                  </div>
                `;
              }).join('')}
              ${devices.length > 5 ? `<div class="unifi-more-items">+${devices.length - 5} more devices</div>` : ''}
            </div>
          </div>
        ` : ''}

        <!-- Top Clients -->
        ${clients.length > 0 ? `
          <div>
            <div class="unifi-list-title">Top Clients</div>
            <div class="flex flex-column gap-8">
              ${[...clients].sort((a, b) => (b.tx_bytes + b.rx_bytes) - (a.tx_bytes + a.rx_bytes)).slice(0, 5).map(client => {
                const connIcon = client.is_wired ? '<i class="fas fa-ethernet"></i>' : '<i class="fas fa-wifi"></i>';
                const totalBytes = client.tx_bytes + client.rx_bytes;
                
                return `
                  <div class="unifi-client-mini">
                    <div class="flex align-center gap-8">
                      <span class="unifi-client-mini-icon">${connIcon}</span>
                      <span class="unifi-client-mini-name">${client.name}</span>
                    </div>
                    <span class="unifi-client-mini-traffic">${formatBytes(totalBytes)}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Recent Alarms -->
        ${alarms.length > 0 ? `
          <div>
            <div class="unifi-list-title">Recent Alerts</div>
            <div class="flex flex-column gap-8">
              ${alarms.slice(0, 3).map(alarm => {
                const date = new Date(alarm.datetime * 1000);
                const timeAgo = formatTimeAgo(date);
                
                return `
                  <div class="unifi-alarm-card">
                    <div class="unifi-alarm-message">${alarm.msg}</div>
                    <div class="unifi-alarm-time">${timeAgo}</div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderMostActive(container: HTMLElement, data: UnifiStats): void {
    const clients = data.clients || [];
    const sortedByTotal = [...clients].sort((a, b) => (b.tx_bytes + b.rx_bytes) - (a.tx_bytes + a.rx_bytes));
    const sortedByTx = [...clients].sort((a, b) => b.tx_bytes - a.tx_bytes);
    const sortedByRx = [...clients].sort((a, b) => b.rx_bytes - a.rx_bytes);
    
    const totalTraffic = clients.reduce((sum, c) => sum + c.tx_bytes + c.rx_bytes, 0);
    
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px; height: 100%; overflow-y: auto;">
        <!-- Summary -->
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
          <div style="background: var(--bg); padding: 16px; border-radius: 8px; text-align: center;">
            <div style="font-size: 32px; font-weight: 700; color: var(--accent);">${clients.length}</div>
            <div style="font-size: 11px; color: var(--muted); text-transform: uppercase;">Active Clients</div>
          </div>
          <div style="background: var(--bg); padding: 16px; border-radius: 8px; text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: var(--text);">${formatBytes(totalTraffic)}</div>
            <div style="font-size: 11px; color: var(--muted); text-transform: uppercase;">Total Traffic</div>
          </div>
        </div>

        <!-- Top by Total Traffic -->
        <div>
          <div style="font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
            <span>📊</span>
            <span>Most Active (Total Traffic)</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${sortedByTotal.slice(0, 10).map((client, index) => {
              const totalBytes = client.tx_bytes + client.rx_bytes;
              const percentage = totalTraffic > 0 ? (totalBytes / totalTraffic * 100) : 0;
              const connIcon = client.is_wired ? '<i class="fas fa-ethernet"></i>' : '<i class="fas fa-wifi"></i>';
              const signalColor = !client.is_wired && client.signal ? 
                (client.signal >= -50 ? '#34c759' : client.signal >= -60 ? '#ffcc00' : client.signal >= -70 ? '#ff9500' : '#ff3b30') : 'var(--muted)';
              
              return `
                <div style="background: var(--bg); padding: 12px; border-radius: 8px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span style="font-size: 14px; color: var(--muted); font-weight: 600; min-width: 20px;">#${index + 1}</span>
                      <span style="font-size: 14px;">${connIcon}</span>
                      <div>
                        <div style="font-size: 13px; font-weight: 600; color: var(--text);">${client.name}</div>
                        <div style="font-size: 10px; color: var(--muted); font-family: monospace;">${client.ip || 'No IP'}</div>
                      </div>
                    </div>
                    <div style="text-align: right;">
                      <div style="font-size: 14px; font-weight: 700; color: var(--accent);">${formatBytes(totalBytes)}</div>
                      <div style="font-size: 10px; color: var(--muted);">${percentage.toFixed(1)}%</div>
                    </div>
                  </div>
                  
                  <!-- Progress bar -->
                  <div style="background: var(--surface); height: 6px; border-radius: 3px; overflow: hidden; margin-bottom: 8px;">
                    <div style="background: var(--accent); height: 100%; width: ${percentage}%; transition: width 0.3s;"></div>
                  </div>
                  
                  <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 11px;">
                    <div style="display: flex; justify-content: space-between;">
                      <span style="color: var(--muted);">↑ Upload:</span>
                      <span style="color: var(--text); font-weight: 500;">${formatBytes(client.tx_bytes)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                      <span style="color: var(--muted);">↓ Download:</span>
                      <span style="color: var(--text); font-weight: 500;">${formatBytes(client.rx_bytes)}</span>
                    </div>
                    ${!client.is_wired && client.signal ? `
                      <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--muted);">Signal:</span>
                        <span style="color: ${signalColor}; font-weight: 600;">${client.signal}dBm</span>
                      </div>
                      ${client.essid ? `
                        <div style="display: flex; justify-content: space-between;">
                          <span style="color: var(--muted);">SSID:</span>
                          <span style="color: var(--text); font-weight: 500;">${client.essid}</span>
                        </div>
                      ` : ''}
                    ` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Top Uploaders -->
        <div>
          <div style="font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
            <span>↑</span>
            <span>Top Uploaders</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${sortedByTx.slice(0, 5).map((client, index) => {
              const connIcon = client.is_wired ? '<i class="fas fa-ethernet"></i>' : '<i class="fas fa-wifi"></i>';
              return `
                <div style="background: var(--bg); padding: 10px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 11px; color: var(--muted); font-weight: 600; min-width: 18px;">#${index + 1}</span>
                    <span style="font-size: 12px;">${connIcon}</span>
                    <span style="font-size: 12px; font-weight: 500; color: var(--text);">${client.name}</span>
                  </div>
                  <span style="font-size: 12px; color: var(--accent); font-weight: 600;">${formatBytes(client.tx_bytes)}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Top Downloaders -->
        <div>
          <div style="font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
            <span>↓</span>
            <span>Top Downloaders</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${sortedByRx.slice(0, 5).map((client, index) => {
              const connIcon = client.is_wired ? '<i class="fas fa-ethernet"></i>' : '<i class="fas fa-wifi"></i>';
              return `
                <div style="background: var(--bg); padding: 10px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 11px; color: var(--muted); font-weight: 600; min-width: 18px;">#${index + 1}</span>
                    <span style="font-size: 12px;">${connIcon}</span>
                    <span style="font-size: 12px; font-weight: 500; color: var(--text);">${client.name}</span>
                  </div>
                  <span style="font-size: 12px; color: var(--accent); font-weight: 600;">${formatBytes(client.rx_bytes)}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  private renderThroughput(container: HTMLElement, data: UnifiStats): void {
    const traffic = data.traffic || { tx_bytes: 0, rx_bytes: 0, tx_packets: 0, rx_packets: 0 };
    const clients = data.clients || [];
    const devices = data.devices || [];
    
    // Calculate per-device throughput
    const deviceTraffic = devices.map(device => ({
      name: device.name,
      type: device.type,
      tx: device.tx_bytes || 0,
      rx: device.rx_bytes || 0,
      total: (device.tx_bytes || 0) + (device.rx_bytes || 0),
      clients: device.num_sta || 0
    })).sort((a, b) => b.total - a.total);
    
    const totalDeviceTraffic = deviceTraffic.reduce((sum, d) => sum + d.total, 0);
    const totalClientTraffic = clients.reduce((sum, c) => sum + c.tx_bytes + c.rx_bytes, 0);
    
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px; height: 100%; overflow-y: auto;">
        <!-- Network Totals -->
        <div style="background: linear-gradient(135deg, var(--accent) 0%, #0077ff 100%); padding: 20px; border-radius: 12px; color: white;">
          <div style="font-size: 13px; font-weight: 600; margin-bottom: 12px; opacity: 0.9;">Network Throughput</div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
            <div>
              <div style="font-size: 11px; opacity: 0.8; margin-bottom: 4px;">↑ UPLOAD</div>
              <div style="font-size: 28px; font-weight: 700;">${formatBytes(traffic.tx_bytes)}</div>
            </div>
            <div>
              <div style="font-size: 11px; opacity: 0.8; margin-bottom: 4px;">↓ DOWNLOAD</div>
              <div style="font-size: 28px; font-weight: 700;">${formatBytes(traffic.rx_bytes)}</div>
            </div>
          </div>
          <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.2); display: flex; justify-content: space-between; font-size: 12px;">
            <span>Total: <strong>${formatBytes(traffic.tx_bytes + traffic.rx_bytes)}</strong></span>
            <span>Packets: <strong>${formatNumber(traffic.tx_packets + traffic.rx_packets)}</strong></span>
          </div>
        </div>

        <!-- Traffic Distribution -->
        <div>
          <div style="font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 10px;">Traffic Distribution</div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
            <div style="background: var(--bg); padding: 14px; border-radius: 8px; text-align: center;">
              <div style="font-size: 11px; color: var(--muted); margin-bottom: 4px;">BY DEVICES</div>
              <div style="font-size: 22px; font-weight: 700; color: var(--accent);">${formatBytes(totalDeviceTraffic)}</div>
              <div style="font-size: 10px; color: var(--muted); margin-top: 4px;">${devices.length} devices</div>
            </div>
            <div style="background: var(--bg); padding: 14px; border-radius: 8px; text-align: center;">
              <div style="font-size: 11px; color: var(--muted); margin-bottom: 4px;">BY CLIENTS</div>
              <div style="font-size: 22px; font-weight: 700; color: var(--accent);">${formatBytes(totalClientTraffic)}</div>
              <div style="font-size: 10px; color: var(--muted); margin-top: 4px;">${clients.length} clients</div>
            </div>
          </div>
        </div>

        <!-- Device Throughput -->
        ${deviceTraffic.length > 0 ? `
          <div>
            <div style="font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 10px;">Device Throughput</div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${deviceTraffic.slice(0, 8).map(device => {
                const typeIcon = device.type === 'uap' ? '<i class="fas fa-wifi"></i>' : device.type === 'usw' ? '<i class="fas fa-network-wired"></i>' : '<i class="fas fa-globe"></i>';
                const percentage = totalDeviceTraffic > 0 ? (device.total / totalDeviceTraffic * 100) : 0;
                
                return `
                  <div style="background: var(--bg); padding: 12px; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                      <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 16px;">${typeIcon}</span>
                        <div>
                          <div style="font-size: 12px; font-weight: 600; color: var(--text);">${device.name}</div>
                          <div style="font-size: 10px; color: var(--muted);">${device.clients} clients</div>
                        </div>
                      </div>
                      <div style="text-align: right;">
                        <div style="font-size: 13px; font-weight: 700; color: var(--accent);">${formatBytes(device.total)}</div>
                        <div style="font-size: 9px; color: var(--muted);">${percentage.toFixed(1)}%</div>
                      </div>
                    </div>
                    
                    <div style="background: var(--surface); height: 4px; border-radius: 2px; overflow: hidden; margin-bottom: 6px;">
                      <div style="background: var(--accent); height: 100%; width: ${percentage}%;"></div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; font-size: 10px;">
                      <span style="color: var(--muted);">↑ ${formatBytes(device.tx)}</span>
                      <span style="color: var(--muted);">↓ ${formatBytes(device.rx)}</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Upload/Download Ratio -->
        <div style="background: var(--bg); padding: 14px; border-radius: 8px;">
          <div style="font-size: 12px; font-weight: 600; color: var(--text); margin-bottom: 10px;">Upload/Download Ratio</div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <div style="flex: ${traffic.tx_bytes}; background: #ff9500; height: 24px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; color: white; min-width: 60px;">
              ${traffic.tx_bytes > 0 ? formatBytes(traffic.tx_bytes) : '0'}
            </div>
            <div style="flex: ${traffic.rx_bytes}; background: #34c759; height: 24px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; color: white; min-width: 60px;">
              ${traffic.rx_bytes > 0 ? formatBytes(traffic.rx_bytes) : '0'}
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--muted); margin-top: 8px;">
            <span>Upload: ${traffic.rx_bytes > 0 ? ((traffic.tx_bytes / traffic.rx_bytes) * 100).toFixed(1) : 0}%</span>
            <span>Download: 100%</span>
          </div>
        </div>
      </div>
    `;
  }

  private renderNetworkSpeeds(container: HTMLElement, data: UnifiStats): void {
    const hasSpeedtest = data.xput_up !== undefined || data.xput_down !== undefined;
    const clients = data.clients || [];
    
    // Calculate average rates for active clients
    const clientsWithRates = clients.filter(c => c.tx_rate || c.rx_rate);
    const avgTxRate = clientsWithRates.length > 0 
      ? clientsWithRates.reduce((sum, c) => sum + (c.tx_rate || 0), 0) / clientsWithRates.length 
      : 0;
    const avgRxRate = clientsWithRates.length > 0 
      ? clientsWithRates.reduce((sum, c) => sum + (c.rx_rate || 0), 0) / clientsWithRates.length 
      : 0;
    
    // Sort clients by speed
    const fastestClients = [...clients]
      .filter(c => c.tx_rate || c.rx_rate)
      .sort((a, b) => (b.tx_rate || 0) + (b.rx_rate || 0) - (a.tx_rate || 0) - (a.rx_rate || 0));
    
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px; height: 100%; overflow-y: auto;">
        <!-- WAN Speed (Speedtest Results) -->
        ${hasSpeedtest ? `
          <div style="background: linear-gradient(135deg, #0077ff 0%, #00d4ff 100%); padding: 20px; border-radius: 12px; color: white;">
            <div style="font-size: 13px; font-weight: 600; margin-bottom: 12px; opacity: 0.9; display: flex; align-items: center; gap: 8px;">
              <span>🚀</span>
              <span>WAN Speed (Speedtest)</span>
            </div>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
              <div>
                <div style="font-size: 11px; opacity: 0.8; margin-bottom: 4px;">↑ UPLOAD</div>
                <div style="font-size: 32px; font-weight: 700;">${((data.xput_up || 0) / 1000000).toFixed(1)}</div>
                <div style="font-size: 12px; opacity: 0.9;">Mbps</div>
              </div>
              <div>
                <div style="font-size: 11px; opacity: 0.8; margin-bottom: 4px;">↓ DOWNLOAD</div>
                <div style="font-size: 32px; font-weight: 700;">${((data.xput_down || 0) / 1000000).toFixed(1)}</div>
                <div style="font-size: 12px; opacity: 0.9;">Mbps</div>
              </div>
            </div>
            ${data.speedtest_ping ? `
              <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.2); font-size: 12px;">
                <span style="opacity: 0.8;">Latency:</span> <strong>${data.speedtest_ping}ms</strong>
              </div>
            ` : ''}
          </div>
        ` : `
          <div style="background: var(--bg); padding: 20px; border-radius: 12px; text-align: center; border: 2px dashed var(--border);">
            <div style="font-size: 32px; margin-bottom: 8px;">📊</div>
            <div style="font-size: 13px; color: var(--muted);">No speedtest data available</div>
            <div style="font-size: 11px; color: var(--muted); margin-top: 4px;">Run a speedtest from your UniFi controller</div>
          </div>
        `}

        <!-- Average Client Speeds -->
        ${clientsWithRates.length > 0 ? `
          <div>
            <div style="font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 10px;">Average Client Speeds</div>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
              <div style="background: var(--bg); padding: 14px; border-radius: 8px;">
                <div style="font-size: 11px; color: var(--muted); margin-bottom: 6px;">↑ AVG UPLOAD</div>
                <div style="font-size: 24px; font-weight: 700; color: #ff9500;">${(avgTxRate / 1000).toFixed(1)}</div>
                <div style="font-size: 11px; color: var(--muted);">Mbps</div>
              </div>
              <div style="background: var(--bg); padding: 14px; border-radius: 8px;">
                <div style="font-size: 11px; color: var(--muted); margin-bottom: 6px;">↓ AVG DOWNLOAD</div>
                <div style="font-size: 24px; font-weight: 700; color: #34c759;">${(avgRxRate / 1000).toFixed(1)}</div>
                <div style="font-size: 11px; color: var(--muted);">Mbps</div>
              </div>
            </div>
            <div style="background: var(--bg); padding: 12px; border-radius: 8px; margin-top: 12px; text-align: center;">
              <div style="font-size: 11px; color: var(--muted);">Clients with active rates</div>
              <div style="font-size: 20px; font-weight: 700; color: var(--accent); margin-top: 4px;">${clientsWithRates.length} / ${clients.length}</div>
            </div>
          </div>
        ` : ''}

        <!-- Fastest Clients -->
        ${fastestClients.length > 0 ? `
          <div>
            <div style="font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
              <span>⚡</span>
              <span>Fastest Clients</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${fastestClients.slice(0, 10).map((client, index) => {
                const connIcon = client.is_wired ? '<i class="fas fa-ethernet"></i>' : '<i class="fas fa-wifi"></i>';
                const txSpeed = (client.tx_rate || 0) / 1000;
                const rxSpeed = (client.rx_rate || 0) / 1000;
                const maxSpeed = Math.max(txSpeed, rxSpeed);
                const speedColor = maxSpeed > 100 ? '#34c759' : maxSpeed > 50 ? '#ffcc00' : maxSpeed > 10 ? '#ff9500' : 'var(--muted)';
                
                return `
                  <div style="background: var(--bg); padding: 12px; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                      <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 12px; color: var(--muted); font-weight: 600; min-width: 18px;">#${index + 1}</span>
                        <span style="font-size: 14px;">${connIcon}</span>
                        <div>
                          <div style="font-size: 12px; font-weight: 600; color: var(--text);">${client.name}</div>
                          <div style="font-size: 9px; color: var(--muted); font-family: monospace;">${client.ip || 'No IP'}</div>
                        </div>
                      </div>
                      <div style="text-align: right;">
                        <div style="font-size: 14px; font-weight: 700; color: ${speedColor};">${maxSpeed.toFixed(1)}</div>
                        <div style="font-size: 9px; color: var(--muted);">Mbps</div>
                      </div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 11px;">
                      <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--muted);">↑ TX:</span>
                        <span style="color: #ff9500; font-weight: 600;">${txSpeed.toFixed(1)} Mbps</span>
                      </div>
                      <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--muted);">↓ RX:</span>
                        <span style="color: #34c759; font-weight: 600;">${rxSpeed.toFixed(1)} Mbps</span>
                      </div>
                      ${!client.is_wired && client.essid ? `
                        <div style="display: flex; justify-content: space-between; grid-column: 1 / -1;">
                          <span style="color: var(--muted);">Network:</span>
                          <span style="color: var(--text); font-weight: 500;">${client.essid}</span>
                        </div>
                      ` : ''}
                      ${!client.is_wired && client.channel && client.radio ? `
                        <div style="display: flex; justify-content: space-between;">
                          <span style="color: var(--muted);">Band:</span>
                          <span style="color: var(--text); font-weight: 500;">${client.radio.toUpperCase()} Ch${client.channel}</span>
                        </div>
                      ` : ''}
                      ${!client.is_wired && client.signal ? `
                        <div style="display: flex; justify-content: space-between;">
                          <span style="color: var(--muted);">Signal:</span>
                          <span style="color: ${client.signal >= -50 ? '#34c759' : client.signal >= -60 ? '#ffcc00' : '#ff9500'}; font-weight: 600;">${client.signal}dBm</span>
                        </div>
                      ` : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : `
          <div style="background: var(--bg); padding: 20px; border-radius: 8px; text-align: center;">
            <div style="font-size: 32px; margin-bottom: 8px;"><i class="fas fa-wifi"></i></div>
            <div style="font-size: 13px; color: var(--muted);">No client rate data available</div>
            <div style="font-size: 11px; color: var(--muted); margin-top: 4px;">Client speeds will appear when data transfer is active</div>
          </div>
        `}

        <!-- Connection Type Distribution -->
        ${clients.length > 0 ? `
          <div style="background: var(--bg); padding: 14px; border-radius: 8px;">
            <div style="font-size: 12px; font-weight: 600; color: var(--text); margin-bottom: 10px;">Connection Types</div>
            <div style="display: flex; gap: 8px;">
              ${(() => {
                const wired = clients.filter(c => c.is_wired).length;
                const wireless = clients.filter(c => !c.is_wired).length;
                const wiredPct = clients.length > 0 ? (wired / clients.length * 100) : 0;
                const wirelessPct = clients.length > 0 ? (wireless / clients.length * 100) : 0;
                
                return `
                  <div style="flex: ${wired}; background: #0077ff; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; color: white; min-width: 60px;">
                    <i class="fas fa-ethernet"></i> ${wired} (${wiredPct.toFixed(0)}%)
                  </div>
                  <div style="flex: ${wireless}; background: var(--accent); height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; color: white; min-width: 60px;">
                    <i class="fas fa-wifi"></i> ${wireless} (${wirelessPct.toFixed(0)}%)
                  </div>
                `;
              })()}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  private formatNumber(num: number): string {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  private getTimeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  destroy(): void {
    this.poller.stopAll();
    this.updateIntervals.forEach(id => clearInterval(id));
    this.updateIntervals.clear();
  }
}

export const widget = {
  type: 'unifi',
  name: 'UniFi Network',
  icon: '<i class="fas fa-wifi"></i>',
  description: 'Monitor UniFi network statistics and connected devices',
  renderer: new UnifiRenderer(),
  defaultContent: {
    host: '',
    site: 'default',
    refreshInterval: 30,
    displayMode: 'compact',
    showClients: true,
    showAlerts: true
  },
  hasSettings: true
};
