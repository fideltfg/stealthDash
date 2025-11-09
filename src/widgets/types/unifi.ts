import type { Widget } from '../../types';
import type { WidgetRenderer } from './base';

interface UnifiContent {
  host: string; // UniFi Controller host (e.g., 'https://192.168.1.1:8443')
  username?: string; // UniFi controller username
  password?: string; // UniFi controller password
  site?: string; // Site name (default: 'default')
  refreshInterval?: number; // Refresh interval in seconds (default: 30)
  displayMode?: 'compact' | 'detailed' | 'minimal'; // Display style
  showClients?: boolean; // Show connected clients count
  showAlerts?: boolean; // Show recent alerts/logs
}

// UniFi API response structures
interface UnifiStats {
  site_name?: string;
  num_user?: number; // Number of connected clients
  num_guest?: number; // Number of guest clients
  num_iot?: number; // Number of IoT clients
  wan_ip?: string;
  uptime?: number;
  gateways?: number;
  switches?: number;
  access_points?: number;
}

interface UnifiAlert {
  _id: string;
  datetime: number;
  key: string;
  msg: string;
  subsystem?: string;
}

class UnifiRenderer implements WidgetRenderer {
  private updateIntervals: Map<string, number> = new Map();

  configure(widget: Widget): void {
    this.showConfigDialog(widget);
  }

  render(container: HTMLElement, widget: Widget): void {
    const content = widget.content as UnifiContent;
    
    console.log('UniFi widget render - Full content:', content);
    console.log('UniFi widget render - Has credentials?', !!content.username && !!content.password);
    
    // If widget has no host configured, show configuration prompt
    if (!content.host) {
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
        // Use the ping-server proxy to avoid CORS issues
        const proxyUrl = new URL('/api/unifi/stats', window.location.origin.replace(':3000', ':3001'));
        proxyUrl.searchParams.set('host', content.host);
        proxyUrl.searchParams.set('site', content.site || 'default');
        if (content.username) {
          proxyUrl.searchParams.set('username', content.username);
        }
        if (content.password) {
          proxyUrl.searchParams.set('password', content.password);
        }
        
        console.log('Fetching UniFi data via proxy:', proxyUrl.toString().replace(/password=[^&]+/, 'password=***'));
        
        const response = await fetch(proxyUrl.toString());

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: response.statusText }));
          throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        const data: UnifiStats = await response.json();
        
        console.log('UniFi data received:', data);

        // Render based on display mode
        const mode = content.displayMode || 'compact';
        
        if (mode === 'minimal') {
          this.renderMinimal(contentEl, data, content);
        } else if (mode === 'detailed') {
          this.renderDetailed(contentEl, data, content);
        } else {
          this.renderCompact(contentEl, data, content);
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
        <div style="color: var(--muted); margin-bottom: 20px;">Configure your UniFi Controller connection</div>
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

  private showConfigDialog(widget: Widget): void {
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
            Username *
          </label>
          <input 
            type="text" 
            id="unifi-username" 
            value="${content.username || ''}"
            placeholder="admin"
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
        </div>

        <div>
          <label style="display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500; color: var(--text);">
            Password *
          </label>
          <input 
            type="password" 
            id="unifi-password" 
            value="${content.password || ''}"
            placeholder="Your UniFi controller password"
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
            Local admin account credentials
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
            <option value="minimal" ${content.displayMode === 'minimal' ? 'selected' : ''}>Minimal</option>
            <option value="compact" ${content.displayMode === 'compact' ? 'selected' : ''}>Compact</option>
            <option value="detailed" ${content.displayMode === 'detailed' ? 'selected' : ''}>Detailed</option>
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
      
      const host = (document.getElementById('unifi-host') as HTMLInputElement).value.trim();
      const username = (document.getElementById('unifi-username') as HTMLInputElement).value.trim();
      const password = (document.getElementById('unifi-password') as HTMLInputElement).value.trim();
      const site = (document.getElementById('unifi-site') as HTMLInputElement).value.trim();
      const displayMode = (document.getElementById('unifi-display-mode') as HTMLSelectElement).value;
      const refreshInterval = parseInt((document.getElementById('unifi-refresh') as HTMLInputElement).value);

      console.log('Saving UniFi config:', { host, username: username ? '***' : '(empty)', site, displayMode, refreshInterval });

      const newContent: UnifiContent = {
        host,
        site,
        displayMode: displayMode as 'minimal' | 'compact' | 'detailed',
        refreshInterval,
        showClients: content.showClients ?? true,
        showAlerts: content.showAlerts ?? true
      };

      // Only include credentials if provided
      if (username) newContent.username = username;
      if (password) newContent.password = password;

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

  private renderMinimal(container: HTMLElement, data: UnifiStats, content: UnifiContent): void {
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

  private renderCompact(container: HTMLElement, data: UnifiStats, content: UnifiContent): void {
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

  private renderDetailed(container: HTMLElement, data: UnifiStats, content: UnifiContent): void {
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
