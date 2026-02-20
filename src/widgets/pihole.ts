import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';
import { stopAllDragPropagation, dispatchWidgetUpdate } from '../utils/dom';
import { getPingServerUrl, getAuthHeaders } from '../utils/api';
import { WidgetPoller } from '../utils/polling';
import { renderConfigPrompt, renderError } from '../utils/widgetRendering';
import { formatNumber } from '../utils/formatting';
import { populateCredentialSelect } from '../utils/credentials';

interface PiholeContent {
  host: string; // Pi-hole host (e.g., 'http://pi.hole' or 'http://192.168.1.100')
  apiKey?: string; // Pi-hole Application Password (recommended) or API key
  password?: string; // Deprecated: Legacy field for backward compatibility
  credentialId?: number; // ID of saved credential to use
  refreshInterval?: number; // Refresh interval in seconds (default: 30)
  displayMode?: 'detailed' | 'minimal'; // Display style
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
  private poller = new WidgetPoller();

  destroy(): void {
    this.poller.stopAll();
  }

  configure(widget: Widget): void {
    this.showConfigDialog(widget);
  }

  render(container: HTMLElement, widget: Widget): void {
    const content = widget.content as PiholeContent;
    
    //console.log('Pi-hole widget render - Full content:', content);
    //console.log('Pi-hole widget render - Has credentialId?', !!content.credentialId);
    
    // If widget has no host or credential configured, show configuration prompt
    // Stop any existing polling
    this.poller.stop(widget.id);

    if (!content.host || content.host === 'http://pi.hole' || !content.credentialId) {
      const btn = renderConfigPrompt(container, '🛡️', 'Configure Pi-hole', 'Configure your Pi-hole server connection. Tip: Create credentials first from the user menu (🔐 Credentials)');
      btn.addEventListener('click', () => this.showConfigDialog(widget));
      return;
    }

    // Create widget structure
    container.innerHTML = `
        <div class="pihole-content flex-1 flex flex-column gap-12">
          <div class="pihole-loading widget-loading centered">
            Loading...
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
        const proxyUrl = new URL('/api/pihole', getPingServerUrl());
        proxyUrl.searchParams.set('host', content.host);
        proxyUrl.searchParams.set('credentialId', content.credentialId.toString());
        
        const response = await fetch(proxyUrl.toString(), {
          headers: getAuthHeaders(false)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: response.statusText }));
          throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        const data: PiholeSummary = await response.json();
        
        //console.log('Pi-hole data received:', data);

        // Render based on display mode
        const mode = content.displayMode || 'detailed';
        
        if (mode === 'minimal') {
          this.renderMinimal(contentEl, data, content);
        } else {
          // Default to detailed (compact mode removed)
          this.renderDetailed(contentEl, data, content);
        }

      } catch (error) {
        console.error('Error fetching Pi-hole data:', error);
        renderError(contentEl, 'Error loading Pi-hole data', error, `Check host: ${content.host}`);
      }
    };

    // Start polling (fires immediately, then every refreshInterval)
    const refreshInterval = (content.refreshInterval || 30) * 1000;
    this.poller.start(widget.id, fetchAndRender, refreshInterval);
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
            <option value="detailed" ${(content.displayMode === 'detailed' || !content.displayMode) ? 'selected' : ''}>Detailed</option>
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
    populateCredentialSelect(credentialSelect, 'pihole', content.credentialId);

    // Prevent widget drag on all interactive elements
    stopAllDragPropagation(modal);

    // Handle form submission
    const form = modal.querySelector('#pihole-config-form') as HTMLFormElement;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const hostInput = document.getElementById('pihole-host') as HTMLInputElement;
      const credentialSelect = document.getElementById('pihole-credential-id') as HTMLSelectElement;
      const displayModeSelect = document.getElementById('pihole-display-mode') as HTMLSelectElement;
      const refreshInput = document.getElementById('pihole-refresh') as HTMLInputElement;
      
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
        displayMode: displayMode as 'minimal' | 'detailed',
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

      dispatchWidgetUpdate(widget.id, newContent);

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
              ${formatNumber(data.queries.blocked)}
            </div>
            <div class="pihole-stat-label">Blocked</div>
          </div>
          <div class="text-center">
            <div class="pihole-stat-value">
              ${formatNumber(data.queries.total)}
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
  

  private renderDetailed(container: HTMLElement, data: PiholeSummary, content: PiholeContent): void {
    const blockedPercentage = data.queries.percent_blocked.toFixed(1);
    const statusColor = '#4caf50';

    const gravityDate = new Date(data.gravity.last_update * 1000).toLocaleString();

    container.innerHTML = `
      <div class="flex flex-column gap-12">

        <!-- Primary Stats -->
        <div class="grid grid-3 gap-8">
          ${this.createStatCard('Total Queries', formatNumber(data.queries.total), '<i class="fas fa-chart-bar"></i>', '#2196f3')}
          ${this.createStatCard('Blocked', formatNumber(data.queries.blocked), '🛡️', '#f44336')}
          ${this.createStatCard('Block Rate', blockedPercentage + '%', '<i class="fas fa-chart-line"></i>', statusColor)}
        </div>

        <!-- Secondary Stats -->
        <div class="grid grid-4 gap-4">
          ${this.createStatCard('Blocklist', formatNumber(data.gravity.domains_being_blocked), '<i class="fas fa-list"></i>', '#ff9800')}
          ${this.createStatCard('Unique Domains', formatNumber(data.queries.unique_domains), '<i class="fas fa-globe"></i>', '#9c27b0')}
          ${this.createStatCard('Forwarded', formatNumber(data.queries.forwarded), '↗️', '#00bcd4')}
          ${this.createStatCard('Cached', formatNumber(data.queries.cached), '<i class="fas fa-database"></i>', '#607d8b')}
        </div>

        <!-- Gravity Update -->
        <subtitle class="mt-12">
          Gravity updated ${gravityDate}
        </subtitle>
      </div>
    `;
  }

  private createStatCard(label: string, value: string, icon: string, color: string): string {
    return `
      <div class="card">
        <div class="">${icon}</div>
        <h4 style="color: ${color};">${value}</h4>
        <subtitle>${label}</subtitle>
      </div>
    `;
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
    displayMode: 'detailed',
    showCharts: false
  }
};
