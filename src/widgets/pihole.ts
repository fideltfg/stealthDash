import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';
import { credentialsService } from '../services/credentials';
import { authService } from '../services/auth';

interface PiholeContent {
  host: string; // Pi-hole host (e.g., 'http://pi.hole' or 'http://192.168.1.100')
  apiKey?: string; // Pi-hole Application Password (recommended) or API key
  password?: string; // Deprecated: Legacy field for backward compatibility
  credentialId?: number; // ID of saved credential to use
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
    
    //console.log('Pi-hole widget render - Full content:', content);
    //console.log('Pi-hole widget render - Has credentialId?', !!content.credentialId);
    
    // If widget has no host or credential configured, show configuration prompt
    if (!content.host || content.host === 'http://pi.hole' || !content.credentialId) {
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
      <div class="pihole-widget widget-container flex flex-column">
        <div class="pihole-header widget-header-row">
          <h3 class="widget-title flex align-center gap-8">
            <img src="https://docs.pi-hole.net/images/logo.svg" alt="Pi-hole" class="widget-icon" />
            <span>Pi-hole</span>
          </h3>
        </div>
        <div class="pihole-content flex-1 flex flex-column gap-12">
          <div class="pihole-loading widget-loading centered">
            Loading...
          </div>
        </div>
      </div>
    `;

    const contentEl = container.querySelector('.pihole-content') as HTMLElement;
    
    const fetchAndRender = async () => {
      try {
        // Check if credentialId exists
        if (!content.credentialId) {
          throw new Error('No credential configured. Please edit widget and select a saved credential.');
        }

        // Use the ping-server proxy to avoid CORS issues
        const proxyUrl = new URL('/api/pihole', window.location.origin.replace(':3000', ':3001'));
        proxyUrl.searchParams.set('host', content.host);
        proxyUrl.searchParams.set('credentialId', content.credentialId.toString());
        
        //console.log('Using saved credential ID:', content.credentialId);
        //console.log('Fetching Pi-hole data via proxy:', proxyUrl.toString());
        
        const response = await fetch(proxyUrl.toString(), {
          headers: {
            'Authorization': `Bearer ${authService.getToken() || ''}`
          }
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: response.statusText }));
          throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        const data: PiholeSummary = await response.json();
        
        //console.log('Pi-hole data received:', data);

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
          <div class="widget-error">
            <div class="widget-error-icon large">⚠️</div>
            <div class="widget-error-title">Error loading Pi-hole data</div>
            <div class="widget-error-message">${error instanceof Error ? error.message : 'Unknown error'}</div>
            <div class="widget-error-hint">Check host: ${content.host}</div>
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
    container.innerHTML = `
      <div class="widget-container flex align-center justify-center">
        <div class="text-center" style="max-width: 400px;">
          <div class="mb-16">
            <img src="https://docs.pi-hole.net/images/logo.svg" alt="Pi-hole" class="widget-logo" />
          </div>
          <h3 class="widget-title mb-12">Configure Pi-hole</h3>
          <p class="widget-text mb-8">
            Configure your Pi-hole server connection
          </p>
          <p class="widget-hint mb-24">
            💡 Tip: Create credentials first from the user menu (🔐 Credentials)
          </p>
          <button id="configure-pihole-btn" class="widget-button primary">
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
    overlay.className = 'modal-overlay widget-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal widget-dialog';

    modal.innerHTML = `
      <div class="pihole-config-header flex align-center gap-12 mb-20">
        <img src="https://docs.pi-hole.net/images/logo.svg" alt="Pi-hole" class="widget-icon-large" />
        <div>
          <h2 class="widget-dialog-title">
            Pi-hole Configuration
          </h2>
          <p class="widget-text">
            Configure your Pi-hole connection settings
          </p>
        </div>
      </div>

      <form id="pihole-config-form" class="flex flex-column gap-16";
        <div>
          <label class="widget-dialog-label">
            Saved Credentials *
          </label>
          <select 
            id="pihole-credential-id"
            required
            class="widget-dialog-input"
          >
            <option value="">Select a saved credential...</option>
          </select>
          <small class="widget-dialog-hint">
            Manage credentials from the user menu (🔐 Credentials)
          </small>
        </div>

        <div>
          <label class="widget-dialog-label">
            Pi-hole Host *
          </label>
          <input 
            type="text" 
            id="pihole-host" 
            value="${content.host || 'http://192.168.1.100'}"
            placeholder="http://192.168.1.100 or http://pi.hole"
            required
            class="widget-dialog-input"
          />
          <small class="widget-dialog-hint">
            Example: http://192.168.1.100 or http://pi.hole
          </small>
        </div>

        <div>
          <label class="widget-dialog-label">
            Display Mode
          </label>
          <select 
            id="pihole-display-mode"
            class="widget-dialog-input"
          >
            <option value="minimal" ${content.displayMode === 'minimal' ? 'selected' : ''}>Minimal</option>
            <option value="compact" ${content.displayMode === 'compact' ? 'selected' : ''}>Compact</option>
            <option value="detailed" ${content.displayMode === 'detailed' ? 'selected' : ''}>Detailed</option>
          </select>
        </div>

        <div>
          <label class="widget-dialog-label">
            Refresh Interval (seconds)
          </label>
          <input 
            type="number" 
            id="pihole-refresh" 
            value="${content.refreshInterval || 30}"
            min="5"
            max="300"
            class="widget-dialog-input"
          />
        </div>

        <div class="widget-dialog-buttons">
          <button 
            type="submit"
            class="widget-dialog-button-save full-width"
          >
            Save
          </button>
          <button 
            type="button"
            id="cancel-btn"
            class="widget-dialog-button-cancel full-width"
          >
            Cancel
          </button>
        </div>
      </form>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Load and populate credentials
    const credentialSelect = document.getElementById('pihole-credential-id') as HTMLSelectElement;

    (async () => {
      try {
        const credentials = await credentialsService.getAll();
        const piholeCredentials = credentials.filter(c => c.service_type === 'pihole');
        
        piholeCredentials.forEach(cred => {
          const option = document.createElement('option');
          option.value = cred.id.toString();
          option.textContent = `🛡️ ${cred.name}${cred.description ? ` - ${cred.description}` : ''}`;
          credentialSelect.appendChild(option);
        });

        // Set current credential if exists
        if (content.credentialId) {
          credentialSelect.value = content.credentialId.toString();
        }
      } catch (error) {
        console.error('Failed to load credentials:', error);
      }
    })();

    // Handle form submission
    const form = modal.querySelector('#pihole-config-form') as HTMLFormElement;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const hostInput = document.getElementById('pihole-host') as HTMLInputElement;
      const credentialSelect = document.getElementById('pihole-credential-id') as HTMLSelectElement;
      const displayModeSelect = document.getElementById('pihole-display-mode') as HTMLSelectElement;
      const refreshInput = document.getElementById('pihole-refresh') as HTMLInputElement;

      // Prevent arrow keys from moving the widget
      hostInput.addEventListener('keydown', (e) => e.stopPropagation());
      hostInput.addEventListener('keyup', (e) => e.stopPropagation());
      credentialSelect.addEventListener('keydown', (e) => e.stopPropagation());
      credentialSelect.addEventListener('keyup', (e) => e.stopPropagation());
      displayModeSelect.addEventListener('keydown', (e) => e.stopPropagation());
      displayModeSelect.addEventListener('keyup', (e) => e.stopPropagation());
      refreshInput.addEventListener('keydown', (e) => e.stopPropagation());
      refreshInput.addEventListener('keyup', (e) => e.stopPropagation());
      
      const host = hostInput.value.trim();
      const credentialId = credentialSelect.value;
      const displayMode = displayModeSelect.value;
      const refreshInterval = parseInt(refreshInput.value);

      if (!credentialId) {
        alert('Please select a saved credential. You can create one from the user menu (🔐 Credentials).');
        return;
      }

      console.log('Form values - credentialId:', credentialId);

      // Update widget content - credentials are now required
      const newContent: PiholeContent = {
        host,
        credentialId: parseInt(credentialId),
        displayMode: displayMode as 'minimal' | 'compact' | 'detailed',
        refreshInterval,
        showCharts: content.showCharts,
        // Clear any legacy password fields
        apiKey: undefined,
        password: undefined
      };

      console.log('Final content being saved:', { 
        ...newContent, 
        credentialId: newContent.credentialId
      });

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
      <div class="pihole-minimal flex flex-column gap-16 align-center justify-center h-100">
        <div class="text-center">
          <div class="pihole-percentage" style="font-size: 48px; font-weight: 700; color: ${statusColor};">
            ${blockedPercentage}%
          </div>
          <div class="widget-hint mt-4">
            Queries Blocked
          </div>
        </div>
        <div class="grid grid-2 gap-12 w-100">
          <div class="text-center">
            <div class="pihole-stat-value">
              ${this.formatNumber(data.queries.blocked)}
            </div>
            <div class="pihole-stat-label">Blocked</div>
          </div>
          <div class="text-center">
            <div class="pihole-stat-value">
              ${this.formatNumber(data.queries.total)}
            </div>
            <div class="pihole-stat-label">Total</div>
          </div>
        </div>
        <div class="pihole-progress-bar">
          <div class="pihole-progress-fill" style="width: ${blockedPercentage}%; background: ${statusColor};"></div>
        </div>
      </div>
    `;
  }
  
  private renderCompact(container: HTMLElement, data: PiholeSummary, content: PiholeContent): void {
    const blockedPercentage = data.queries.percent_blocked.toFixed(1);
    const statusColor = '#4caf50';
    const statusText = 'Active';

    container.innerHTML = `
      <div class="flex flex-column gap-16">
        <!-- Status Bar -->
        <div class="pihole-status-bar">
          <div class="flex align-center gap-8">
            <div class="status-dot" style="background: ${statusColor};"></div>
            <span class="pihole-status-text">${statusText}</span>
          </div>
          <div class="widget-hint">
            ${data.clients.active} client${data.clients.active !== 1 ? 's' : ''}
          </div>
        </div>

        <!-- Main Stats -->
        <div class="grid grid-2 gap-12">
          ${this.createStatCard('Queries Today', this.formatNumber(data.queries.total), '<i class="fas fa-chart-bar"></i>', '#2196f3')}
          ${this.createStatCard('Blocked', this.formatNumber(data.queries.blocked), '🛡️', '#f44336')}
          ${this.createStatCard('Block %', blockedPercentage + '%', '<i class="fas fa-chart-line"></i>', statusColor)}
          ${this.createStatCard('Blocklist', this.formatNumber(data.gravity.domains_being_blocked), '<i class="fas fa-list"></i>', '#ff9800')}
        </div>

        <!-- Query Types -->
        <div class="pihole-query-dist">
          <div class="pihole-query-dist-title">Query Distribution</div>
          <div class="pihole-query-dist-grid">
            <div class="flex space-between">
              <span class="widget-muted">Forwarded:</span>
              <span class="widget-text-bold">${this.formatNumber(data.queries.forwarded)}</span>
            </div>
            <div class="flex space-between">
              <span class="widget-muted">Cached:</span>
              <span class="widget-text-bold">${this.formatNumber(data.queries.cached)}</span>
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
      <div class="flex flex-column gap-12">
        <!-- Status Header -->
        <div class="pihole-status-bar">
          <div class="flex align-center gap-8">
            <div class="status-dot" style="background: ${statusColor};"></div>
            <span class="pihole-status-text">${statusText}</span>
          </div>
          <div class="pihole-client-count">
            ${data.clients.active} / ${data.clients.total} clients
          </div>
        </div>

        <!-- Primary Stats -->
        <div class="grid grid-3 gap-8">
          ${this.createStatCard('Total Queries', this.formatNumber(data.queries.total), '<i class="fas fa-chart-bar"></i>', '#2196f3', true)}
          ${this.createStatCard('Blocked', this.formatNumber(data.queries.blocked), '🛡️', '#f44336', true)}
          ${this.createStatCard('Block Rate', blockedPercentage + '%', '<i class="fas fa-chart-line"></i>', statusColor, true)}
        </div>

        <!-- Secondary Stats -->
        <div class="grid grid-2 gap-8">
          ${this.createStatCard('Blocklist', this.formatNumber(data.gravity.domains_being_blocked), '<i class="fas fa-list"></i>', '#ff9800', true)}
          ${this.createStatCard('Unique Domains', this.formatNumber(data.queries.unique_domains), '<i class="fas fa-globe"></i>', '#9c27b0', true)}
          ${this.createStatCard('Forwarded', this.formatNumber(data.queries.forwarded), '↗️', '#00bcd4', true)}
          ${this.createStatCard('Cached', this.formatNumber(data.queries.cached), '<i class="fas fa-database"></i>', '#607d8b', true)}
        </div>

        <!-- Gravity Update -->
        <div class="pihole-gravity-update">
          Gravity updated ${gravityDate}
        </div>
      </div>
    `;
  }

  private createStatCard(label: string, value: string, icon: string, color: string, compact: boolean = false): string {
    if (compact) {
      return `
        <div class="pihole-stat-card-compact">
          <div class="pihole-stat-card-label">${icon} ${label}</div>
          <div class="pihole-stat-card-value" style="color: ${color};">${value}</div>
        </div>
      `;
    }
    
    return `
      <div class="pihole-stat-card">
        <div class="pihole-stat-card-icon">${icon}</div>
        <div class="pihole-stat-card-value" style="color: ${color};">${value}</div>
        <div class="pihole-stat-card-label">${label}</div>
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
  icon: '<i class="fas fa-shield-alt"></i>',
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
