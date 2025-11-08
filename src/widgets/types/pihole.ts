import type { Widget } from '../../types';
import type { WidgetRenderer } from './base';

interface PiholeContent {
  host: string; // Pi-hole host (e.g., 'http://pi.hole' or 'http://192.168.1.100')
  password?: string; // Pi-hole admin password for authentication
  apiKey?: string; // Deprecated: use password instead
  refreshInterval?: number; // Refresh interval in seconds (default: 30)
  displayMode?: 'compact' | 'detailed' | 'minimal'; // Display style
  showCharts?: boolean; // Show mini charts for blocked queries
}

// Pi-hole v6 API response structure
interface PiholeSummary {
  queries: {
    total: number;
    blocked: number;
    percent_blocked: number;
    unique_domains: number;
    forwarded: number;
    cached: number;
    frequency: number;
  };
  clients: {
    active: number;
    total: number;
  };
  gravity: {
    domains_being_blocked: number;
    last_update: number;
  };
}

class PiholeRenderer implements WidgetRenderer {
  private updateIntervals: Map<string, number> = new Map();

  configure(widget: Widget): void {
    this.showConfigDialog(widget);
  }

  render(container: HTMLElement, widget: Widget): void {
    const content = widget.content as PiholeContent;
    
    // If widget has no host configured, show configuration prompt
    if (!content.host || content.host === 'http://pi.hole') {
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
      <div class="pihole-widget" style="width: 100%; height: 100%; display: flex; flex-direction: column; padding: 16px; overflow: auto; background: var(--surface);">
        <div class="pihole-header" style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: var(--text); display: flex; align-items: center; gap: 8px;">
            <img src="https://docs.pi-hole.net/images/logo.svg" alt="Pi-hole" style="width: 24px; height: 20px;" />
            <span>Pi-hole</span>
          </h3>
        </div>
        <div class="pihole-content" style="flex: 1; display: flex; flex-direction: column; gap: 12px;">
          <div class="pihole-loading" style="text-align: center; padding: 40px; color: var(--muted);">
            Loading...
          </div>
        </div>
      </div>
    `;

    const contentEl = container.querySelector('.pihole-content') as HTMLElement;
    
    const fetchAndRender = async () => {
      try {
        // Use the ping-server proxy to avoid CORS issues
        const proxyUrl = new URL('/api/pihole', window.location.origin.replace(':3000', ':3001'));
        proxyUrl.searchParams.set('host', content.host);
        if (content.password || content.apiKey) {
          proxyUrl.searchParams.set('password', content.password || content.apiKey || '');
        }
        
        console.log('Fetching Pi-hole data via proxy:', proxyUrl.toString().replace(/password=[^&]+/, 'password=***'));
        
        const response = await fetch(proxyUrl.toString());

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: response.statusText }));
          throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        const data: PiholeSummary = await response.json();
        
        console.log('Pi-hole data received:', data);

        // Render based on display mode
        const mode = content.displayMode || 'compact';
        
        if (mode === 'minimal') {
          this.renderMinimal(contentEl, data, content);
        } else if (mode === 'detailed') {
          this.renderDetailed(contentEl, data, content);
        } else {
          this.renderCompact(contentEl, data, content);
        }

      } catch (error) {
        console.error('Error fetching Pi-hole data:', error);
        contentEl.innerHTML = `
          <div style="text-align: center; padding: 40px; color: #f44336;">
            <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
            <div style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">Error loading Pi-hole data</div>
            <div style="font-size: 12px; color: var(--muted);">${error instanceof Error ? error.message : 'Unknown error'}</div>
            <div style="font-size: 11px; color: var(--muted); margin-top: 8px;">Check host: ${content.host}</div>
          </div>
        `;
      }
    };

    // Initial fetch
    fetchAndRender();

    // Set up auto-refresh
    const refreshInterval = (content.refreshInterval || 30) * 1000;
    const intervalId = window.setInterval(fetchAndRender, refreshInterval);
    this.updateIntervals.set(widget.id, intervalId);
  }

  private renderConfigPrompt(container: HTMLElement, widget: Widget): void {
    // Show simple prompt that opens the config dialog
    container.innerHTML = `
      <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; padding: 24px; background: var(--surface);">
        <div style="text-align: center; max-width: 400px;">
          <div style="margin-bottom: 16px;">
            <img src="https://docs.pi-hole.net/images/logo.svg" alt="Pi-hole" style="width: 64px; height: 64px;" />
          </div>
          <h3 style="margin: 0 0 12px 0; font-size: 18px; color: var(--text);">Configure Pi-hole</h3>
          <p style="margin: 0 0 24px 0; font-size: 14px; color: var(--muted);">
            Enter your Pi-hole server details to get started
          </p>
          <button id="configure-pihole-btn" style="
            padding: 12px 24px;
            background: var(--accent);
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: filter 0.2s;
          ">
            Configure
          </button>
        </div>
      </div>
    `;

    const configBtn = container.querySelector('#configure-pihole-btn');
    configBtn?.addEventListener('click', () => {
      this.showConfigDialog(widget);
    });
  }

  private showConfigDialog(widget: Widget): void {
    const content = widget.content as PiholeContent;
    
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
    `;

    modal.innerHTML = `
      <div style="margin-bottom: 20px; display: flex; align-items: center; gap: 12px;">
        <img src="https://docs.pi-hole.net/images/logo.svg" alt="Pi-hole" style="width: 32px; height: 32px;" />
        <div>
          <h2 style="margin: 0 0 4px 0; font-size: 20px; font-weight: 600; color: var(--text);">
            Pi-hole Configuration
          </h2>
          <p style="margin: 0; font-size: 14px; color: var(--muted);">
            Configure your Pi-hole connection settings
          </p>
        </div>
      </div>

      <form id="pihole-config-form" style="display: flex; flex-direction: column; gap: 16px;";
        <div>
          <label style="display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500; color: var(--text);">
            Pi-hole Host *
          </label>
          <input 
            type="text" 
            id="pihole-host" 
            value="${content.host || 'http://192.168.1.100'}"
            placeholder="http://192.168.1.100 or http://pi.hole"
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
            Example: http://192.168.1.100 or http://pi.hole
          </small>
        </div>

        <div>
          <label style="display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500; color: var(--text);">
            Admin Password *
          </label>
          <input 
            type="password" 
            id="pihole-apikey" 
            value="${content.password || content.apiKey || ''}"
            placeholder="Your Pi-hole admin password"
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
            Required for Pi-hole v6+. Your Pi-hole admin password.
          </small>
        </div>

        <div>
          <label style="display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500; color: var(--text);">
            Display Mode
          </label>
          <select 
            id="pihole-display-mode"
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
            id="pihole-refresh" 
            value="${content.refreshInterval || 30}"
            min="5"
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
    const form = modal.querySelector('#pihole-config-form') as HTMLFormElement;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const host = (document.getElementById('pihole-host') as HTMLInputElement).value.trim();
      const password = (document.getElementById('pihole-apikey') as HTMLInputElement).value.trim();
      const displayMode = (document.getElementById('pihole-display-mode') as HTMLSelectElement).value;
      const refreshInterval = parseInt((document.getElementById('pihole-refresh') as HTMLInputElement).value);

      // Update widget content
      const newContent: PiholeContent = {
        host,
        password: password || undefined,
        displayMode: displayMode as 'minimal' | 'compact' | 'detailed',
        refreshInterval,
        showCharts: content.showCharts
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

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });

    // Close on ESC
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
  }

  private renderMinimal(container: HTMLElement, data: PiholeSummary, content: PiholeContent): void {
    const blockedPercentage = data.queries.percent_blocked.toFixed(1);
    const statusColor = '#4caf50'; // Always show as active

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px; align-items: center; justify-content: center; height: 100%;">
        <div style="text-align: center;">
          <div style="font-size: 48px; font-weight: 700; color: ${statusColor};">
            ${blockedPercentage}%
          </div>
          <div style="font-size: 12px; color: var(--muted); margin-top: 4px;">
            Queries Blocked
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; width: 100%;">
          <div style="text-align: center;">
            <div style="font-size: 20px; font-weight: 600; color: var(--text);">
              ${this.formatNumber(data.queries.blocked)}
            </div>
            <div style="font-size: 10px; color: var(--muted);">Blocked</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 20px; font-weight: 600; color: var(--text);">
              ${this.formatNumber(data.queries.total)}
            </div>
            <div style="font-size: 10px; color: var(--muted);">Total</div>
          </div>
        </div>
        <div style="width: 100%; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden;">
          <div style="width: ${blockedPercentage}%; height: 100%; background: ${statusColor}; transition: width 0.3s;"></div>
        </div>
      </div>
    `;
  }
  
  private renderCompact(container: HTMLElement, data: PiholeSummary, content: PiholeContent): void {
    const blockedPercentage = data.queries.percent_blocked.toFixed(1);
    const statusColor = '#4caf50';
    const statusText = 'Active';

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <!-- Status Bar -->
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--hover); border-radius: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 12px; height: 12px; border-radius: 50%; background: ${statusColor};"></div>
            <span style="font-size: 14px; font-weight: 600; color: var(--text);">${statusText}</span>
          </div>
          <div style="font-size: 12px; color: var(--muted);">
            ${data.clients.active} client${data.clients.active !== 1 ? 's' : ''}
          </div>
        </div>

        <!-- Main Stats -->
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
          ${this.createStatCard('Queries Today', this.formatNumber(data.queries.total), '📊', '#2196f3')}
          ${this.createStatCard('Blocked', this.formatNumber(data.queries.blocked), '🛡️', '#f44336')}
          ${this.createStatCard('Block %', blockedPercentage + '%', '📈', statusColor)}
          ${this.createStatCard('Blocklist', this.formatNumber(data.gravity.domains_being_blocked), '📋', '#ff9800')}
        </div>

        <!-- Query Types -->
        <div style="padding: 12px; background: var(--hover); border-radius: 8px;">
          <div style="font-size: 12px; font-weight: 600; color: var(--text); margin-bottom: 8px;">Query Distribution</div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 11px;">
            <div style="display: flex; justify-content: space-between;">
              <span style="color: var(--muted);">Forwarded:</span>
              <span style="color: var(--text); font-weight: 500;">${this.formatNumber(data.queries.forwarded)}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: var(--muted);">Cached:</span>
              <span style="color: var(--text); font-weight: 500;">${this.formatNumber(data.queries.cached)}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderDetailed(container: HTMLElement, data: PiholeSummary, content: PiholeContent): void {
    const blockedPercentage = data.queries.percent_blocked.toFixed(1);
    const statusColor = '#4caf50';
    const statusText = 'Active';

    const gravityDate = new Date(data.gravity.last_update * 1000).toLocaleString();

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <!-- Status Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--hover); border-radius: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 12px; height: 12px; border-radius: 50%; background: ${statusColor};"></div>
            <span style="font-size: 14px; font-weight: 600; color: var(--text);">${statusText}</span>
          </div>
          <div style="font-size: 11px; color: var(--muted);">
            ${data.clients.active} / ${data.clients.total} clients
          </div>
        </div>

        <!-- Primary Stats -->
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
          ${this.createStatCard('Total Queries', this.formatNumber(data.queries.total), '📊', '#2196f3', true)}
          ${this.createStatCard('Blocked', this.formatNumber(data.queries.blocked), '🛡️', '#f44336', true)}
          ${this.createStatCard('Block Rate', blockedPercentage + '%', '📈', statusColor, true)}
        </div>

        <!-- Secondary Stats -->
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
          ${this.createStatCard('Blocklist', this.formatNumber(data.gravity.domains_being_blocked), '📋', '#ff9800', true)}
          ${this.createStatCard('Unique Domains', this.formatNumber(data.queries.unique_domains), '🌐', '#9c27b0', true)}
          ${this.createStatCard('Forwarded', this.formatNumber(data.queries.forwarded), '↗️', '#00bcd4', true)}
          ${this.createStatCard('Cached', this.formatNumber(data.queries.cached), '💾', '#607d8b', true)}
        </div>

        <!-- Gravity Update -->
        <div style="padding: 8px 12px; background: var(--hover); border-radius: 8px; font-size: 11px; color: var(--muted); text-align: center;">
          Gravity updated ${gravityDate}
        </div>
      </div>
    `;
  }

  private createStatCard(label: string, value: string, icon: string, color: string, compact: boolean = false): string {
    if (compact) {
      return `
        <div style="padding: 8px; background: var(--hover); border-radius: 8px; text-align: center;">
          <div style="font-size: 10px; color: var(--muted); margin-bottom: 4px;">${icon} ${label}</div>
          <div style="font-size: 16px; font-weight: 600; color: ${color};">${value}</div>
        </div>
      `;
    }
    
    return `
      <div style="padding: 12px; background: var(--hover); border-radius: 8px; text-align: center;">
        <div style="font-size: 24px; margin-bottom: 4px;">${icon}</div>
        <div style="font-size: 20px; font-weight: 600; color: ${color}; margin-bottom: 4px;">${value}</div>
        <div style="font-size: 11px; color: var(--muted);">${label}</div>
      </div>
    `;
  }

  private formatNumber(num: number): string {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }
}

export const widget = {
  type: 'pihole',
  name: 'Pi-hole',
  icon: '🕳️',
  description: 'Display Pi-hole DNS statistics and blocking information',
  renderer: new PiholeRenderer(),
  defaultSize: { w: 400, h: 500 },
  defaultContent: {
    host: 'http://pi.hole',
    refreshInterval: 30,
    displayMode: 'compact',
    showCharts: false
  }
};
