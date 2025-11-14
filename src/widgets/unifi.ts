import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';
import { credentialsService } from '../services/credentials';
import { authService } from '../services/auth';

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
  private updateIntervals: Map<string, number> = new Map();

  configure(widget: Widget): void {
    this.showConfigDialog(widget);
  }

  render(container: HTMLElement, widget: Widget): void {
    const content = widget.content as UnifiContent;
    
    console.log('UniFi widget render - Full content:', content);
    console.log('UniFi widget render - Has credentialId?', !!content.credentialId);
    
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

    // Create widget structure
    container.innerHTML = `
      <div class="unifi-widget" style="width: 100%; height: 100%; display: flex; flex-direction: column; padding: 16px; overflow: auto; background: var(--surface);">
        <div class="unifi-header" style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: var(--text); display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 24px;">📡</span>
            <span>UniFi Network</span>
          </h3>
        </div>
        <div class="unifi-content" style="flex: 1; display: flex; flex-direction: column; gap: 12px;">
          <div class="unifi-loading" style="text-align: center; padding: 40px; color: var(--muted);">
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
        const proxyUrl = new URL('/api/unifi/stats', window.location.origin.replace(':3000', ':3001'));
        proxyUrl.searchParams.set('host', content.host);
        proxyUrl.searchParams.set('site', content.site || 'default');
        proxyUrl.searchParams.set('credentialId', content.credentialId.toString());
        
        console.log('Using saved credential ID:', content.credentialId);
        console.log('Fetching UniFi data via proxy:', proxyUrl.toString());
        
        const response = await fetch(proxyUrl.toString(), {
          headers: {
            'Authorization': `Bearer ${authService.getToken() || ''}`
          }
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: response.statusText }));
          throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        const data: UnifiStats = await response.json();
        
        console.log('UniFi data received:', data);

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
          <div style="padding: 20px; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
            <div style="color: #ff3b30; font-weight: 500; margin-bottom: 8px;">Error loading UniFi data</div>
            <div style="color: var(--muted); font-size: 14px; margin-bottom: 12px;">${error.message}</div>
            <div style="color: var(--muted); font-size: 12px;">Check host: ${content.host}</div>
          </div>
        `;
      }
    };

    // Initial fetch
    fetchAndRender();

    // Set up refresh interval
    const interval = window.setInterval(fetchAndRender, (content.refreshInterval || 30) * 1000);
    this.updateIntervals.set(widget.id, interval);
  }

  private renderConfigPrompt(container: HTMLElement, widget: Widget): void {
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 20px; text-align: center;">
        <div style="font-size: 48px; margin-bottom: 16px;">📡</div>
        <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px; color: var(--text);">UniFi Network Widget</div>
        <div style="color: var(--muted); margin-bottom: 8px;">Configure your UniFi Controller connection</div>
        <div style="color: var(--muted); font-size: 12px; margin-bottom: 20px;">💡 Tip: Create credentials first from the user menu (🔐 Credentials)</div>
        <button 
          class="configure-btn"
          style="
            padding: 10px 20px;
            background: var(--accent);
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
          "
        >
          Configure
        </button>
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
    overlay.className = 'modal-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.cssText = `
      background: var(--surface);
      border-radius: 8px;
      padding: 24px;
      max-width: 500px;
      width: 90%;
      box-shadow: 0 8px 32px var(--shadow);
      max-height: 80vh;
      overflow-y: auto;
    `;

    // Load credentials for dropdown
    const credentials = await credentialsService.getAll();
    const unifiCredentials = credentials.filter((c: any) => c.service_type === 'unifi');
    
    const credentialOptions = unifiCredentials.length > 0
      ? unifiCredentials.map((c: any) => 
          `<option value="${c.id}" ${content.credentialId === c.id ? 'selected' : ''} style="background: var(--surface); color: var(--text);">${c.name}</option>`
        ).join('')
      : '<option value="" disabled style="background: var(--surface); color: var(--muted);">No credentials available</option>';

    modal.innerHTML = `
      <div style="margin-bottom: 20px; display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 32px;">📡</span>
        <div>
          <h2 style="margin: 0 0 4px 0; font-size: 20px; font-weight: 600; color: var(--text);">
            UniFi Network Configuration
          </h2>
          <p style="margin: 0; font-size: 14px; color: var(--muted);">
            Connect to your UniFi Controller
          </p>
        </div>
      </div>

      <form id="unifi-config-form" style="display: flex; flex-direction: column; gap: 16px;">
        <div>
          <label style="display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500; color: var(--text);">
            Controller Host *
          </label>
          <input 
            type="text" 
            id="unifi-host" 
            value="${content.host || 'https://192.168.1.1:8443'}"
            placeholder="https://192.168.1.1:8443 or https://unifi.local:8443"
            required
            style="
              width: 100%;
              padding: 10px 12px;
              background: var(--bg);
              border: 1px solid var(--border);
              border-radius: 6px;
              font-size: 14px;
              color: var(--text);
              box-sizing: border-box;
            "
          />
          <small style="display: block; margin-top: 4px; font-size: 12px; color: var(--muted);">
            Include protocol (https://) and port (usually 8443)
          </small>
        </div>

        <div>
          <label style="display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500; color: var(--text);">
            Credentials *
          </label>
          <select 
            id="unifi-credential"
            required
            style="
              width: 100%;
              padding: 10px 12px;
              background: var(--bg);
              border: 1px solid var(--border);
              border-radius: 6px;
              font-size: 14px;
              color: var(--text);
              box-sizing: border-box;
            "
          >
            <option value="" style="background: var(--surface); color: var(--muted);">Select credentials...</option>
            ${credentialOptions}
          </select>
          <small style="display: block; margin-top: 4px; font-size: 12px; color: var(--muted);">
            Create credentials from the user menu (🔐 Credentials)
          </small>
        </div>

        <div>
          <label style="display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500; color: var(--text);">
            Site Name
          </label>
          <input 
            type="text" 
            id="unifi-site" 
            value="${content.site || 'default'}"
            placeholder="default"
            style="
              width: 100%;
              padding: 10px 12px;
              background: var(--bg);
              border: 1px solid var(--border);
              border-radius: 6px;
              font-size: 14px;
              color: var(--text);
              box-sizing: border-box;
            "
          />
          <small style="display: block; margin-top: 4px; font-size: 12px; color: var(--muted);">
            Usually "default" unless you have multiple sites
          </small>
        </div>

        <div>
          <label style="display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500; color: var(--text);">
            Display Mode
          </label>
          <select 
            id="unifi-display-mode"
            style="
              width: 100%;
              padding: 10px 12px;
              background: var(--bg);
              border: 1px solid var(--border);
              border-radius: 6px;
              font-size: 14px;
              color: var(--text);
              box-sizing: border-box;
            "
          >
            <option value="minimal" ${content.displayMode === 'minimal' ? 'selected' : ''} style="background: var(--surface); color: var(--text);">Minimal - Client count only</option>
            <option value="compact" ${content.displayMode === 'compact' ? 'selected' : ''} style="background: var(--surface); color: var(--text);">Compact - Key stats</option>
            <option value="detailed" ${content.displayMode === 'detailed' ? 'selected' : ''} style="background: var(--surface); color: var(--text);">Detailed - Infrastructure view</option>
            <option value="devices" ${content.displayMode === 'devices' ? 'selected' : ''} style="background: var(--surface); color: var(--text);">Devices - Full device list</option>
            <option value="clients" ${content.displayMode === 'clients' ? 'selected' : ''} style="background: var(--surface); color: var(--text);">Clients - Active connections</option>
            <option value="active" ${content.displayMode === 'active' ? 'selected' : ''} style="background: var(--surface); color: var(--text);">Most Active - Top clients by traffic</option>
            <option value="throughput" ${content.displayMode === 'throughput' ? 'selected' : ''} style="background: var(--surface); color: var(--text);">Throughput - Network traffic analysis</option>
            <option value="speeds" ${content.displayMode === 'speeds' ? 'selected' : ''} style="background: var(--surface); color: var(--text);">Network Speeds - WAN & client speeds</option>
            <option value="full" ${content.displayMode === 'full' ? 'selected' : ''} style="background: var(--surface); color: var(--text);">Full - Complete overview</option>
          </select>
        </div>

        <div>
          <label style="display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500; color: var(--text);">
            Refresh Interval (seconds)
          </label>
          <input 
            type="number" 
            id="unifi-refresh" 
            value="${content.refreshInterval || 30}"
            min="10"
            max="300"
            style="
              width: 100%;
              padding: 10px 12px;
              background: var(--bg);
              border: 1px solid var(--border);
              border-radius: 6px;
              font-size: 14px;
              color: var(--text);
              box-sizing: border-box;
            "
          />
        </div>

        <div style="display: flex; gap: 12px; margin-top: 8px;">
          <button 
            type="submit"
            style="
              flex: 1;
              padding: 12px;
              background: var(--accent);
              color: white;
              border: none;
              border-radius: 6px;
              font-size: 14px;
              font-weight: 600;
              cursor: pointer;
              transition: filter 0.2s;
            "
          >
            Save
          </button>
          <button 
            type="button"
            id="cancel-btn"
            style="
              flex: 1;
              padding: 12px;
              background: var(--border);
              color: var(--text);
              border: none;
              border-radius: 6px;
              font-size: 14px;
              font-weight: 600;
              cursor: pointer;
              transition: filter 0.2s;
            "
          >
            Cancel
          </button>
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

      // Prevent arrow keys from moving the widget
      hostInput.addEventListener('keydown', (e) => e.stopPropagation());
      hostInput.addEventListener('keyup', (e) => e.stopPropagation());
      credentialSelect.addEventListener('keydown', (e) => e.stopPropagation());
      credentialSelect.addEventListener('keyup', (e) => e.stopPropagation());
      siteInput.addEventListener('keydown', (e) => e.stopPropagation());
      siteInput.addEventListener('keyup', (e) => e.stopPropagation());
      displayModeSelect.addEventListener('keydown', (e) => e.stopPropagation());
      displayModeSelect.addEventListener('keyup', (e) => e.stopPropagation());
      refreshInput.addEventListener('keydown', (e) => e.stopPropagation());
      refreshInput.addEventListener('keyup', (e) => e.stopPropagation());
      
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

  private renderMinimal(container: HTMLElement, data: UnifiStats): void {
    const clients = (data.num_user || 0);
    
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px; align-items: center; justify-content: center; height: 100%;">
        <div style="font-size: 48px; font-weight: 700; color: var(--accent);">
          ${clients}
        </div>
        <div style="font-size: 14px; color: var(--muted); text-align: center;">
          Connected Clients
        </div>
      </div>
    `;
  }

  private renderCompact(container: HTMLElement, data: UnifiStats): void {
    const clients = (data.num_user || 0);
    const guests = (data.num_guest || 0);
    const devices = (data.gateways || 0) + (data.switches || 0) + (data.access_points || 0);
    
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px;">
          <div style="background: var(--bg); padding: 16px; border-radius: 8px; text-align: center;">
            <div style="font-size: 32px; font-weight: 700; color: var(--accent); margin-bottom: 4px;">
              ${clients}
            </div>
            <div style="font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px;">
              Clients
            </div>
          </div>
          
          <div style="background: var(--bg); padding: 16px; border-radius: 8px; text-align: center;">
            <div style="font-size: 32px; font-weight: 700; color: var(--text); margin-bottom: 4px;">
              ${guests}
            </div>
            <div style="font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px;">
              Guests
            </div>
          </div>
          
          <div style="background: var(--bg); padding: 16px; border-radius: 8px; text-align: center;">
            <div style="font-size: 32px; font-weight: 700; color: var(--text); margin-bottom: 4px;">
              ${devices}
            </div>
            <div style="font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px;">
              Devices
            </div>
          </div>
        </div>
        
        ${data.site_name ? `
          <div style="padding: 12px; background: var(--bg); border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 14px; color: var(--muted);">Site</span>
            <span style="font-size: 14px; font-weight: 500; color: var(--text);">${data.site_name}</span>
          </div>
        ` : ''}
        
        ${data.wan_ip ? `
          <div style="padding: 12px; background: var(--bg); border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 14px; color: var(--muted);">WAN IP</span>
            <span style="font-size: 14px; font-family: monospace; color: var(--text);">${data.wan_ip}</span>
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
    const uptime = data.uptime ? this.formatUptime(data.uptime) : 'Unknown';
    
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px;">
          <div style="background: var(--bg); padding: 16px; border-radius: 8px; text-align: center;">
            <div style="font-size: 28px; font-weight: 700; color: var(--accent); margin-bottom: 4px;">
              ${clients}
            </div>
            <div style="font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px;">
              Clients
            </div>
          </div>
          
          <div style="background: var(--bg); padding: 16px; border-radius: 8px; text-align: center;">
            <div style="font-size: 28px; font-weight: 700; color: var(--text); margin-bottom: 4px;">
              ${guests}
            </div>
            <div style="font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px;">
              Guests
            </div>
          </div>
          
          <div style="background: var(--bg); padding: 16px; border-radius: 8px; text-align: center;">
            <div style="font-size: 28px; font-weight: 700; color: var(--text); margin-bottom: 4px;">
              ${iot}
            </div>
            <div style="font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px;">
              IoT
            </div>
          </div>
        </div>
        
        <div style="border-top: 1px solid var(--border); padding-top: 16px;">
          <div style="font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">
            Infrastructure
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 14px; color: var(--muted);">🌐 Gateways</span>
              <span style="font-size: 14px; font-weight: 500; color: var(--text);">${gateways}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 14px; color: var(--muted);">🔀 Switches</span>
              <span style="font-size: 14px; font-weight: 500; color: var(--text);">${switches}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 14px; color: var(--muted);">📡 Access Points</span>
              <span style="font-size: 14px; font-weight: 500; color: var(--text);">${aps}</span>
            </div>
          </div>
        </div>
        
        <div style="border-top: 1px solid var(--border); padding-top: 16px;">
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${data.site_name ? `
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 14px; color: var(--muted);">Site</span>
                <span style="font-size: 14px; font-weight: 500; color: var(--text);">${data.site_name}</span>
              </div>
            ` : ''}
            ${data.wan_ip ? `
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 14px; color: var(--muted);">WAN IP</span>
                <span style="font-size: 14px; font-family: monospace; color: var(--text);">${data.wan_ip}</span>
              </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 14px; color: var(--muted);">Uptime</span>
              <span style="font-size: 14px; font-weight: 500; color: var(--text);">${uptime}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderDevices(container: HTMLElement, data: UnifiStats): void {
    const devices = data.devices || [];
    
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px; height: 100%; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; background: var(--surface); z-index: 1; padding-bottom: 8px;">
          <div style="font-size: 14px; font-weight: 600; color: var(--text);">Network Devices (${devices.length})</div>
          <div style="font-size: 12px; color: var(--muted);">${(data.gateways || 0)} GW | ${(data.switches || 0)} SW | ${(data.access_points || 0)} AP</div>
        </div>
        
        ${devices.length === 0 ? `
          <div style="text-align: center; padding: 40px; color: var(--muted);">
            No devices found
          </div>
        ` : devices.map(device => {
          const statusColor = device.state === 1 ? '#34c759' : '#ff3b30';
          const typeIcon = device.type === 'uap' ? '📡' : device.type === 'usw' ? '🔀' : device.type === 'ugw' ? '🌐' : '📟';
          
          return `
            <div style="background: var(--bg); padding: 12px; border-radius: 8px; border-left: 3px solid ${statusColor};">
              <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 20px;">${typeIcon}</span>
                  <div>
                    <div style="font-size: 14px; font-weight: 600; color: var(--text);">${device.name}</div>
                    <div style="font-size: 11px; color: var(--muted); font-family: monospace;">${device.ip}</div>
                  </div>
                </div>
                ${device.upgradable ? '<span style="font-size: 11px; background: #ff9500; color: white; padding: 2px 6px; border-radius: 4px;">Update</span>' : ''}
              </div>
              
              <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 11px;">
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: var(--muted);">Model:</span>
                  <span style="color: var(--text); font-weight: 500;">${device.model || 'N/A'}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: var(--muted);">Clients:</span>
                  <span style="color: var(--text); font-weight: 500;">${device.num_sta || 0}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: var(--muted);">Uptime:</span>
                  <span style="color: var(--text); font-weight: 500;">${this.formatUptime(device.uptime || 0)}</span>
                </div>
                ${device.satisfaction !== undefined ? `
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--muted);">Score:</span>
                    <span style="color: var(--text); font-weight: 500;">${device.satisfaction}%</span>
                  </div>
                ` : ''}
                ${device.cpu !== undefined ? `
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--muted);">CPU:</span>
                    <span style="color: var(--text); font-weight: 500;">${device.cpu}%</span>
                  </div>
                ` : ''}
                ${device.mem !== undefined ? `
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--muted);">Memory:</span>
                    <span style="color: var(--text); font-weight: 500;">${device.mem}%</span>
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
    const sortedClients = [...clients].sort((a, b) => (b.tx_bytes + b.rx_bytes) - (a.tx_bytes + a.rx_bytes));
    
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px; height: 100%; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; background: var(--surface); z-index: 1; padding-bottom: 8px;">
          <div style="font-size: 14px; font-weight: 600; color: var(--text);">Active Clients (${clients.length})</div>
          <div style="font-size: 12px; color: var(--muted);">
            ${clients.filter(c => c.is_wired).length} wired | ${clients.filter(c => !c.is_wired).length} wireless
          </div>
        </div>
        
        ${sortedClients.length === 0 ? `
          <div style="text-align: center; padding: 40px; color: var(--muted);">
            No active clients
          </div>
        ` : sortedClients.map(client => {
          const isWired = client.is_wired;
          const connIcon = isWired ? '🔌' : '📶';
          const totalBytes = client.tx_bytes + client.rx_bytes;
          const signalBars = client.signal ? 
            (client.signal >= -50 ? '▂▃▅▆█' : client.signal >= -60 ? '▂▃▅▆▁' : client.signal >= -70 ? '▂▃▅▁▁' : '▂▃▁▁▁') : '';
          
          return `
            <div style="background: var(--bg); padding: 12px; border-radius: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 16px;">${connIcon}</span>
                  <div>
                    <div style="font-size: 13px; font-weight: 600; color: var(--text);">${client.name}</div>
                    <div style="font-size: 10px; color: var(--muted); font-family: monospace;">${client.ip || 'No IP'}</div>
                  </div>
                </div>
                ${client.is_guest ? '<span style="font-size: 10px; background: var(--accent); color: white; padding: 2px 6px; border-radius: 4px;">Guest</span>' : ''}
              </div>
              
              <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; font-size: 10px;">
                ${!isWired && client.essid ? `
                  <div style="display: flex; justify-content: space-between; grid-column: 1 / -1;">
                    <span style="color: var(--muted);">Network:</span>
                    <span style="color: var(--text); font-weight: 500;">${client.essid}</span>
                  </div>
                ` : ''}
                ${!isWired && client.signal ? `
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--muted);">Signal:</span>
                    <span style="color: var(--text); font-weight: 500; font-family: monospace;">${signalBars} ${client.signal}dBm</span>
                  </div>
                ` : ''}
                ${!isWired && client.channel ? `
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--muted);">Channel:</span>
                    <span style="color: var(--text); font-weight: 500;">${client.channel} ${client.radio || ''}</span>
                  </div>
                ` : ''}
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: var(--muted);">↑ TX:</span>
                  <span style="color: var(--text); font-weight: 500;">${this.formatBytes(client.tx_bytes)}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: var(--muted);">↓ RX:</span>
                  <span style="color: var(--text); font-weight: 500;">${this.formatBytes(client.rx_bytes)}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: var(--muted);">Total:</span>
                  <span style="color: var(--text); font-weight: 500;">${this.formatBytes(totalBytes)}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: var(--muted);">Uptime:</span>
                  <span style="color: var(--text); font-weight: 500;">${this.formatUptime(client.uptime || 0)}</span>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  private renderFull(container: HTMLElement, data: UnifiStats): void {
    const clients = data.clients || [];
    const devices = data.devices || [];
    const alarms = data.alarms || [];
    
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px; height: 100%; overflow-y: auto;">
        <!-- Summary Stats -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 8px;">
          <div style="background: var(--bg); padding: 12px; border-radius: 8px; text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: var(--accent);">${data.num_user || 0}</div>
            <div style="font-size: 10px; color: var(--muted); text-transform: uppercase;">Clients</div>
          </div>
          <div style="background: var(--bg); padding: 12px; border-radius: 8px; text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: var(--text);">${devices.length}</div>
            <div style="font-size: 10px; color: var(--muted); text-transform: uppercase;">Devices</div>
          </div>
          <div style="background: var(--bg); padding: 12px; border-radius: 8px; text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: var(--text);">${data.num_guest || 0}</div>
            <div style="font-size: 10px; color: var(--muted); text-transform: uppercase;">Guests</div>
          </div>
        </div>

        <!-- WAN Info -->
        ${data.wan_ip || data.xput_down ? `
          <div style="background: var(--bg); padding: 12px; border-radius: 8px;">
            <div style="font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; margin-bottom: 8px;">WAN</div>
            <div style="display: flex; flex-direction: column; gap: 6px; font-size: 11px;">
              ${data.wan_ip ? `
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: var(--muted);">IP:</span>
                  <span style="color: var(--text); font-family: monospace;">${data.wan_ip}</span>
                </div>
              ` : ''}
              ${data.xput_down ? `
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: var(--muted);">↓ Download:</span>
                  <span style="color: var(--text); font-weight: 500;">${(data.xput_down / 1000000).toFixed(1)} Mbps</span>
                </div>
              ` : ''}
              ${data.xput_up ? `
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: var(--muted);">↑ Upload:</span>
                  <span style="color: var(--text); font-weight: 500;">${(data.xput_up / 1000000).toFixed(1)} Mbps</span>
                </div>
              ` : ''}
              ${data.latency ? `
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: var(--muted);">Latency:</span>
                  <span style="color: var(--text); font-weight: 500;">${data.latency}ms</span>
                </div>
              ` : ''}
            </div>
          </div>
        ` : ''}

        <!-- Devices Section -->
        ${devices.length > 0 ? `
          <div>
            <div style="font-size: 12px; font-weight: 600; color: var(--text); margin-bottom: 8px;">Devices (${devices.length})</div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${devices.slice(0, 5).map(device => {
                const statusColor = device.state === 1 ? '#34c759' : '#ff3b30';
                const typeIcon = device.type === 'uap' ? '📡' : device.type === 'usw' ? '🔀' : '🌐';
                
                return `
                  <div style="background: var(--bg); padding: 8px; border-radius: 6px; border-left: 2px solid ${statusColor};">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                      <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 14px;">${typeIcon}</span>
                        <span style="font-size: 11px; font-weight: 500; color: var(--text);">${device.name}</span>
                      </div>
                      <span style="font-size: 10px; color: var(--muted);">${device.num_sta || 0} clients</span>
                    </div>
                  </div>
                `;
              }).join('')}
              ${devices.length > 5 ? `<div style="text-align: center; font-size: 11px; color: var(--muted);">+${devices.length - 5} more devices</div>` : ''}
            </div>
          </div>
        ` : ''}

        <!-- Top Clients -->
        ${clients.length > 0 ? `
          <div>
            <div style="font-size: 12px; font-weight: 600; color: var(--text); margin-bottom: 8px;">Top Clients</div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              ${[...clients].sort((a, b) => (b.tx_bytes + b.rx_bytes) - (a.tx_bytes + a.rx_bytes)).slice(0, 5).map(client => {
                const connIcon = client.is_wired ? '🔌' : '📶';
                const totalBytes = client.tx_bytes + client.rx_bytes;
                
                return `
                  <div style="background: var(--bg); padding: 8px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <span style="font-size: 12px;">${connIcon}</span>
                      <span style="font-size: 11px; font-weight: 500; color: var(--text);">${client.name}</span>
                    </div>
                    <span style="font-size: 10px; color: var(--muted); font-weight: 500;">${this.formatBytes(totalBytes)}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Recent Alarms -->
        ${alarms.length > 0 ? `
          <div>
            <div style="font-size: 12px; font-weight: 600; color: var(--text); margin-bottom: 8px;">Recent Alerts</div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              ${alarms.slice(0, 3).map(alarm => {
                const date = new Date(alarm.datetime * 1000);
                const timeAgo = this.getTimeAgo(date);
                
                return `
                  <div style="background: var(--bg); padding: 8px; border-radius: 6px;">
                    <div style="font-size: 11px; color: var(--text); margin-bottom: 2px;">${alarm.msg}</div>
                    <div style="font-size: 9px; color: var(--muted);">${timeAgo}</div>
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
            <div style="font-size: 24px; font-weight: 700; color: var(--text);">${this.formatBytes(totalTraffic)}</div>
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
              const connIcon = client.is_wired ? '🔌' : '📶';
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
                      <div style="font-size: 14px; font-weight: 700; color: var(--accent);">${this.formatBytes(totalBytes)}</div>
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
                      <span style="color: var(--text); font-weight: 500;">${this.formatBytes(client.tx_bytes)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                      <span style="color: var(--muted);">↓ Download:</span>
                      <span style="color: var(--text); font-weight: 500;">${this.formatBytes(client.rx_bytes)}</span>
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
              const connIcon = client.is_wired ? '🔌' : '📶';
              return `
                <div style="background: var(--bg); padding: 10px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 11px; color: var(--muted); font-weight: 600; min-width: 18px;">#${index + 1}</span>
                    <span style="font-size: 12px;">${connIcon}</span>
                    <span style="font-size: 12px; font-weight: 500; color: var(--text);">${client.name}</span>
                  </div>
                  <span style="font-size: 12px; color: var(--accent); font-weight: 600;">${this.formatBytes(client.tx_bytes)}</span>
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
              const connIcon = client.is_wired ? '🔌' : '📶';
              return `
                <div style="background: var(--bg); padding: 10px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 11px; color: var(--muted); font-weight: 600; min-width: 18px;">#${index + 1}</span>
                    <span style="font-size: 12px;">${connIcon}</span>
                    <span style="font-size: 12px; font-weight: 500; color: var(--text);">${client.name}</span>
                  </div>
                  <span style="font-size: 12px; color: var(--accent); font-weight: 600;">${this.formatBytes(client.rx_bytes)}</span>
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
              <div style="font-size: 28px; font-weight: 700;">${this.formatBytes(traffic.tx_bytes)}</div>
            </div>
            <div>
              <div style="font-size: 11px; opacity: 0.8; margin-bottom: 4px;">↓ DOWNLOAD</div>
              <div style="font-size: 28px; font-weight: 700;">${this.formatBytes(traffic.rx_bytes)}</div>
            </div>
          </div>
          <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.2); display: flex; justify-content: space-between; font-size: 12px;">
            <span>Total: <strong>${this.formatBytes(traffic.tx_bytes + traffic.rx_bytes)}</strong></span>
            <span>Packets: <strong>${this.formatNumber(traffic.tx_packets + traffic.rx_packets)}</strong></span>
          </div>
        </div>

        <!-- Traffic Distribution -->
        <div>
          <div style="font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 10px;">Traffic Distribution</div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
            <div style="background: var(--bg); padding: 14px; border-radius: 8px; text-align: center;">
              <div style="font-size: 11px; color: var(--muted); margin-bottom: 4px;">BY DEVICES</div>
              <div style="font-size: 22px; font-weight: 700; color: var(--accent);">${this.formatBytes(totalDeviceTraffic)}</div>
              <div style="font-size: 10px; color: var(--muted); margin-top: 4px;">${devices.length} devices</div>
            </div>
            <div style="background: var(--bg); padding: 14px; border-radius: 8px; text-align: center;">
              <div style="font-size: 11px; color: var(--muted); margin-bottom: 4px;">BY CLIENTS</div>
              <div style="font-size: 22px; font-weight: 700; color: var(--accent);">${this.formatBytes(totalClientTraffic)}</div>
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
                const typeIcon = device.type === 'uap' ? '📡' : device.type === 'usw' ? '🔀' : '🌐';
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
                        <div style="font-size: 13px; font-weight: 700; color: var(--accent);">${this.formatBytes(device.total)}</div>
                        <div style="font-size: 9px; color: var(--muted);">${percentage.toFixed(1)}%</div>
                      </div>
                    </div>
                    
                    <div style="background: var(--surface); height: 4px; border-radius: 2px; overflow: hidden; margin-bottom: 6px;">
                      <div style="background: var(--accent); height: 100%; width: ${percentage}%;"></div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; font-size: 10px;">
                      <span style="color: var(--muted);">↑ ${this.formatBytes(device.tx)}</span>
                      <span style="color: var(--muted);">↓ ${this.formatBytes(device.rx)}</span>
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
              ${traffic.tx_bytes > 0 ? this.formatBytes(traffic.tx_bytes) : '0'}
            </div>
            <div style="flex: ${traffic.rx_bytes}; background: #34c759; height: 24px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; color: white; min-width: 60px;">
              ${traffic.rx_bytes > 0 ? this.formatBytes(traffic.rx_bytes) : '0'}
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
                const connIcon = client.is_wired ? '🔌' : '📶';
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
            <div style="font-size: 32px; margin-bottom: 8px;">📡</div>
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
                    🔌 ${wired} (${wiredPct.toFixed(0)}%)
                  </div>
                  <div style="flex: ${wireless}; background: var(--accent); height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; color: white; min-width: 60px;">
                    📶 ${wireless} (${wirelessPct.toFixed(0)}%)
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

  destroy(widget: Widget): void {
    const interval = this.updateIntervals.get(widget.id);
    if (interval) {
      clearInterval(interval);
      this.updateIntervals.delete(widget.id);
    }
  }
}

export const widget = {
  type: 'unifi',
  name: 'UniFi Network',
  icon: '📡',
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
