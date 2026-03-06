import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';
import { stopAllDragPropagation, dispatchWidgetUpdate } from '../utils/dom';
import { getPingServerUrl, getAuthHeaders } from '../utils/api';
import { WidgetPoller } from '../utils/polling';
import { populateCredentialSelect } from '../utils/credentials';

// ==================== INTERFACES ====================

interface SensiDevice {
  icd_id: string;
  registration?: {
    name?: string;
    city?: string;
    state?: string;
    country?: string;
    product_type?: string;
  };
  capabilities?: {
    system_modes?: string[];
    fan_modes?: string[];
    circulating_fan?: { capable?: string };
    humidity_control?: any;
    min_heat_setpoint?: number;
    max_heat_setpoint?: number;
    min_cool_setpoint?: number;
    max_cool_setpoint?: number;
  };
  state?: {
    status?: string;
    display_temp?: number;
    humidity?: number;
    operating_mode?: string;
    fan_mode?: string;
    current_heat_temp?: number;
    current_cool_temp?: number;
    heat_max_temp?: number;
    cool_min_temp?: number;
    battery_voltage?: number;
    power_status?: string;
    wifi_connection_quality?: number;
    display_scale?: string;
    demand_status?: {
      heat?: number;
      cool?: number;
      fan?: number;
      aux?: number;
      last?: string;
    };
    circulating_fan?: {
      enabled?: string;
      duty_cycle?: number;
    };
  };
}

interface SensiContent {
  credentialId?: number;
  refreshInterval?: number; // seconds, default 30
  temperatureUnit?: 'F' | 'C';
  collapsedDevices?: string[]; // icd_ids of collapsed devices
}

// ==================== RENDERER ====================

export class SensiRenderer implements WidgetRenderer {
  private poller = new WidgetPoller();
  private deviceData: Map<string, SensiDevice[]> = new Map(); // widgetId -> devices

  /** POST to the ping-server Sensi proxy */
  private async sensiFetch(content: SensiContent, path: string, extra: Record<string, any> = {}): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (content.credentialId) Object.assign(headers, getAuthHeaders());
    const body: Record<string, any> = { ...extra };
    if (content.credentialId) body.credentialId = content.credentialId;
    return fetch(`${getPingServerUrl()}/sensi/${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }

  configure(widget: Widget): void {
    this.showSettingsDialog(widget);
  }

  async render(container: HTMLElement, widget: Widget): Promise<void> {
    const content = widget.content as SensiContent;
    container.innerHTML = '';

    if (!content.credentialId) {
      this.renderConfigPrompt(container, widget);
      return;
    }

    // Show loading state
    const loading = document.createElement('div');
    loading.className = 'sensi-loading';
    loading.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connecting to Sensi...';
    container.appendChild(loading);

    try {
      await this.fetchState(widget);
      container.innerHTML = '';
      this.renderDevices(container, widget);
      this.startAutoRefresh(widget, container);
    } catch (err: any) {
      container.innerHTML = '';
      const error = document.createElement('div');
      error.className = 'sensi-error';
      error.innerHTML = `
        <div class="widget-config-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
        <p>Failed to connect to Sensi</p>
        <small>${err.message || err}</small>
        <button class="btn btn-small btn-primary sensi-retry-btn">Retry</button>
      `;
      container.appendChild(error);
      const retryBtn = error.querySelector('.sensi-retry-btn');
      retryBtn?.addEventListener('click', () => this.render(container, widget));
      stopAllDragPropagation(error);
    }
  }

  // ==================== CONFIG PROMPT ====================

  private renderConfigPrompt(container: HTMLElement, widget: Widget): void {
    const content = widget.content as SensiContent;
    const prompt = document.createElement('div');
    prompt.className = 'config-prompt';
    prompt.innerHTML = `
      <div class="sensi-config-container">
        <div class="widget-config-icon"><i class="fa-solid fa-temperature-arrow-up"></i></div>
        <h3>Configure Sensi Thermostat</h3>
        <div class="sensi-config-form">
          <div class="card">
            <label class="widget-dialog-label left-align">Credentials:</label>
            <select id="sensi-credential" class="widget-dialog-input rounded">
              <option value="">Select saved credential...</option>
            </select>
            <small class="sensi-config-hint">
              <i class="fas fa-lightbulb"></i> Create a Sensi credential from the user menu
              (<i class="fas fa-key"></i> Credentials) with service type <strong>sensi</strong>.
              Store your <strong>refresh_token</strong> obtained from
              <a href="https://manager.sensicomfort.com/" target="_blank" rel="noopener">manager.sensicomfort.com</a>.
            </small>
            <details class="sensi-token-help">
              <summary>How to get a refresh token</summary>
              <ol>
                <li>Open Chrome/Edge and go to <a href="https://manager.sensicomfort.com/" target="_blank" rel="noopener">manager.sensicomfort.com</a></li>
                <li>Press F12 to open DevTools → select the <strong>Network</strong> tab</li>
                <li>Log in with your Sensi credentials</li>
                <li>In DevTools, find the <code>token?device=</code> request and <strong>click on it</strong></li>
                <li>Select the <strong>Response</strong> tab (not the URL!)</li>
                <li>Copy the <code>refresh_token</code> value from the <strong>JSON response body</strong> — it will be a long random string</li>
                <li>Save it as a credential with service type <strong>sensi</strong>, field name <strong>refresh_token</strong></li>
              </ol>
              <p><strong>⚠ Important:</strong> Do NOT copy the URL or the <code>device=</code> parameter. The refresh token is in the <em>response body</em> and looks like a long random string (not a device ID).</p>
            </details>
          </div>
          <button id="save-sensi-config" class="btn btn-small btn-primary">
            Save Configuration
          </button>
        </div>
      </div>
    `;
    container.appendChild(prompt);

    const credentialSelect = prompt.querySelector('#sensi-credential') as HTMLSelectElement;
    populateCredentialSelect(credentialSelect, 'sensi', content.credentialId);

    const saveBtn = prompt.querySelector('#save-sensi-config') as HTMLButtonElement;
    saveBtn.addEventListener('click', () => {
      const credId = credentialSelect.value;
      if (!credId) {
        alert('Please select a credential');
        return;
      }
      dispatchWidgetUpdate(widget.id, { ...content, credentialId: parseInt(credId) });
    });

    stopAllDragPropagation(prompt);
  }

  // ==================== DEVICE RENDERING ====================

  private renderDevices(container: HTMLElement, widget: Widget): void {
    const content = widget.content as SensiContent;
    const devices = this.deviceData.get(widget.id) || [];

    if (devices.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'sensi-empty';
      empty.innerHTML = `
        <div class="widget-config-icon"><i class="fa-solid fa-temperature-arrow-up"></i></div>
        <p>No thermostats found on this account</p>
      `;
      container.appendChild(empty);
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'sensi-wrapper card-list';
    container.appendChild(wrapper);

    const collapsed = content.collapsedDevices || [];

    for (const device of devices) {
      const card = this.createDeviceCard(device, widget, collapsed.includes(device.icd_id));
      wrapper.appendChild(card);
    }

    stopAllDragPropagation(wrapper);
  }

  private createDeviceCard(device: SensiDevice, widget: Widget, isCollapsed: boolean): HTMLElement {
    const content = widget.content as SensiContent;
    const s = device.state || {};
    const reg = device.registration || {};

    const name = reg.name || device.icd_id;
    // trim name to 24 chars for better display, but keep tooltip with full name
    const displayName = name.length > 20 ? name.slice(0, 17) + '...' : name;
    

    const isOnline = (s.status || '').toLowerCase() === 'online';
    const scale = content.temperatureUnit || (s.display_scale === 'c' ? 'C' : 'F');
    const temp = s.display_temp != null ? Math.round(s.display_temp) : '--';
    const humidity = s.humidity != null ? Math.round(s.humidity) : '--';
    const mode = (s.operating_mode || 'off').toLowerCase();
    const fanMode = (s.fan_mode || 'auto').toLowerCase();
    const heatSetpoint = s.current_heat_temp != null ? Math.round(s.current_heat_temp) : '--';
    const coolSetpoint = s.current_cool_temp != null ? Math.round(s.current_cool_temp) : '--';

    // Determine what's actively running
    const demand = s.demand_status || {};
    let activeStatus = '';
    let activeIcon = '';
    if (demand.heat && demand.heat > 0) { activeStatus = 'Heat'; activeIcon = '<i class="fa-solid fa-fire" style="color:var(--error)"></i>'; }
    else if (demand.cool && demand.cool > 0) { activeStatus = 'Cool'; activeIcon = '<i class="fa-solid fa-snowflake" style="color:#3498db"></i>'; }
    else if (demand.aux && demand.aux > 0) { activeStatus = 'Aux'; activeIcon = '<i class="fa-solid fa-fire-flame-curved" style="color:#e67e22"></i>'; }
    else if (demand.fan && demand.fan > 0) { activeStatus = 'Fan'; activeIcon = '<i class="fa-solid fa-fan" style="color:var(--success)"></i>'; }
    else { activeStatus = 'Idle'; activeIcon = '<i class="fa-solid fa-pause" style="color:var(--text-secondary)"></i>'; }

    const card = document.createElement('div');
    card.className = `card sensi-device-card ${isCollapsed ? 'collapsed' : ''}`;
    card.dataset.icdId = device.icd_id;

    // Mode icon
    const modeIcons: Record<string, string> = {
      heat: '<i class="fa-solid fa-fire" style="color:var(--error)"></i>',
      cool: '<i class="fa-solid fa-snowflake" style="color:var(--primary)"></i>',
      auto: '<i class="fa-solid fa-arrows-rotate" style="color:var(--warning)"></i>',
      aux: '<i class="fa-solid fa-fire-flame-curved" style="color:var(--aux)"></i>',
      off: '<i class="fa-solid fa-power-off" style="color:var(--text-secondary)"></i>',
    };

    card.innerHTML = `
      <div class="sensi-device-header">
        <div class="sensi-device-info">
          <span class="sensi-device-name" title="${name}">${displayName}</span>
          <span class="sensi-device-status ${isOnline ? 'online' : 'offline'}">
            <i class="fa-solid fa-circle"></i> ${isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>
      <div class="sensi-device-body ${isCollapsed ? 'hidden' : ''}">
        <div class="sensi-reading-row">
          <div class="sensi-temp-display">
            <span class="sensi-temp-value">${temp}</span>
            <span class="sensi-temp-unit">°${scale}</span>
          </div>
          <div class="sensi-humidity-display">
            <i class="fa-solid fa-droplet" style="color:#3498db"></i>
            <span class="sensi-humidity-value">${humidity}%</span>
          </div>
          <div class="sensi-active-status">
            ${activeIcon} <span>${activeStatus}</span>
          </div>
        </div>

        <div class="sensi-controls-row">
          <div class="sensi-control-group">
            <label>Mode</label>
            <select class="sensi-mode-select widget-dialog-input" data-icd="${device.icd_id}">
              <option value="off" ${mode === 'off' ? 'selected' : ''}>Off</option>
              <option value="heat" ${mode === 'heat' ? 'selected' : ''}>Heat</option>
              <option value="cool" ${mode === 'cool' ? 'selected' : ''}>Cool</option>
              <option value="auto" ${mode === 'auto' ? 'selected' : ''}>Auto</option>
              <option value="aux" ${mode === 'aux' ? 'selected' : ''}>Aux</option>
            </select>
          </div>
          <div class="sensi-control-group">
            <label>Fan</label>
            <select class="sensi-fan-select widget-dialog-input" data-icd="${device.icd_id}">
              <option value="auto" ${fanMode === 'auto' ? 'selected' : ''}>Auto</option>
              <option value="on" ${fanMode === 'on' ? 'selected' : ''}>On</option>
            </select>
          </div>
        </div>

        ${mode !== 'off' ? `
        <div class="sensi-setpoints-row">
          ${mode === 'heat' || mode === 'auto' || mode === 'aux' ? `
          <div class="sensi-setpoint-group">
            <div class="sensi-setpoint-controls">
              <button class="sensi-temp-btn sensi-temp-down" data-icd="${device.icd_id}" data-mode="heat" data-dir="-1">
                <i class="fa-solid fa-minus"></i>
              </button>
              <span class="sensi-setpoint-value" data-icd="${device.icd_id}" data-mode="heat">${heatSetpoint}°${scale}</span>
              <button class="sensi-temp-btn sensi-temp-up" data-icd="${device.icd_id}" data-mode="heat" data-dir="1">
                <i class="fa-solid fa-plus"></i>
              </button>
            </div>
          </div>
          ` : ''}
          ${mode === 'cool' || mode === 'auto' ? `
          <div class="sensi-setpoint-group">
            <label>${modeIcons.cool} Cool</label>
            <div class="sensi-setpoint-controls">
              <button class="sensi-temp-btn sensi-temp-down" data-icd="${device.icd_id}" data-mode="cool" data-dir="-1">
                <i class="fa-solid fa-minus"></i>
              </button>
              <span class="sensi-setpoint-value" data-icd="${device.icd_id}" data-mode="cool">${coolSetpoint}°${scale}</span>
              <button class="sensi-temp-btn sensi-temp-up" data-icd="${device.icd_id}" data-mode="cool" data-dir="1">
                <i class="fa-solid fa-plus"></i>
              </button>
            </div>
          </div>
          ` : ''}
        </div>
        ` : ''}

        <div class="sensi-info-row">
          ${s.battery_voltage != null ? `<span class="sensi-info-item"><i class="fa-solid fa-battery-half"></i> ${s.battery_voltage.toFixed(2)}V</span>` : ''}
          ${s.wifi_connection_quality != null ? `<span class="sensi-info-item"><i class="fa-solid fa-wifi"></i> ${s.wifi_connection_quality}%</span>` : ''}
          ${s.power_status ? `<span class="sensi-info-item">${s.power_status === 'c_wire' ? '<i class="fa-solid fa-code-commit"></i> C-Wire' : s.power_status === 'battery_only' ? '<i class="fa-solid fa-battery-half"></i> Battery' : s.power_status === 'powerstealing' ? '<i class="fa-solid fa-plug"></i> Stealing' : `<i class="fa-solid fa-plug"></i> ${s.power_status}`}</span>` : ''}
        </div>
      </div>
    `;

    // ---- Event handlers ----

    // Collapse toggle
    // const collapseBtn = card.querySelector('.sensi-collapse-btn') as HTMLButtonElement;
    // collapseBtn.addEventListener('click', (e) => {
    //   e.stopPropagation();
    //   const collapsed = content.collapsedDevices || [];
    //   const idx = collapsed.indexOf(device.icd_id);
    //   if (idx >= 0) {
    //     collapsed.splice(idx, 1);
    //   } else {
    //     collapsed.push(device.icd_id);
    //   }
    //   dispatchWidgetUpdate(widget.id, { ...content, collapsedDevices: collapsed });
    // });

    // Mode select
    const modeSelect = card.querySelector('.sensi-mode-select') as HTMLSelectElement;
    modeSelect.addEventListener('change', async () => {
      const newMode = modeSelect.value;
      modeSelect.disabled = true;
      try {
        await this.setMode(widget, device.icd_id, newMode);
        // Refresh after a short delay to let the thermostat respond
        setTimeout(() => this.refreshAndUpdate(widget), 2000);
      } catch (err: any) {
        alert(`Failed to set mode: ${err.message || err}`);
        modeSelect.value = mode; // revert
      } finally {
        modeSelect.disabled = false;
      }
    });

    // Fan select
    const fanSelect = card.querySelector('.sensi-fan-select') as HTMLSelectElement;
    fanSelect.addEventListener('change', async () => {
      const newFan = fanSelect.value;
      fanSelect.disabled = true;
      try {
        await this.setFan(widget, device.icd_id, newFan);
        setTimeout(() => this.refreshAndUpdate(widget), 2000);
      } catch (err: any) {
        alert(`Failed to set fan: ${err.message || err}`);
        fanSelect.value = fanMode; // revert
      } finally {
        fanSelect.disabled = false;
      }
    });

    // Temperature +/- buttons
    card.querySelectorAll('.sensi-temp-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const el = btn as HTMLElement;
        const icd = el.dataset.icd!;
        const tempMode = el.dataset.mode!; // "heat" or "cool"
        const dir = parseInt(el.dataset.dir!, 10);

        // Get current setpoint
        const dev = (this.deviceData.get(widget.id) || []).find(d => d.icd_id === icd);
        if (!dev || !dev.state) return;

        const currentSetpoint = tempMode === 'heat'
          ? (dev.state.current_heat_temp || 70)
          : (dev.state.current_cool_temp || 75);
        const newSetpoint = currentSetpoint + dir;
        const displayScale = content.temperatureUnit?.toLowerCase() || dev.state.display_scale || 'f';

        // Update display immediately for responsiveness
        const valueEl = card.querySelector(`.sensi-setpoint-value[data-icd="${icd}"][data-mode="${tempMode}"]`);
        if (valueEl) {
          valueEl.textContent = `${newSetpoint}°${displayScale.toUpperCase()}`;
        }

        (el as HTMLButtonElement).disabled = true;
        try {
          await this.setTemperature(widget, icd, displayScale, tempMode, newSetpoint);
          setTimeout(() => this.refreshAndUpdate(widget), 2000);
        } catch (err: any) {
          alert(`Failed to set temperature: ${err.message || err}`);
          if (valueEl) {
            valueEl.textContent = `${currentSetpoint}°${displayScale.toUpperCase()}`;
          }
        } finally {
          (el as HTMLButtonElement).disabled = false;
        }
      });
    });

    return card;
  }

  // ==================== API CALLS ====================

  private async fetchState(widget: Widget): Promise<void> {
    const content = widget.content as SensiContent;
    const response = await this.sensiFetch(content, 'state');
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${response.status}`);
    }
    const result = await response.json();
    this.deviceData.set(widget.id, result.devices || []);
  }

  private async setMode(widget: Widget, icdId: string, value: string): Promise<void> {
    const content = widget.content as SensiContent;
    const response = await this.sensiFetch(content, 'set-mode', { icd_id: icdId, value });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${response.status}`);
    }
  }

  private async setFan(widget: Widget, icdId: string, value: string): Promise<void> {
    const content = widget.content as SensiContent;
    const response = await this.sensiFetch(content, 'set-fan', { icd_id: icdId, value });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${response.status}`);
    }
  }

  private async setTemperature(widget: Widget, icdId: string, scale: string, mode: string, targetTemp: number): Promise<void> {
    const content = widget.content as SensiContent;
    const response = await this.sensiFetch(content, 'set-temperature', {
      icd_id: icdId,
      scale,
      mode,
      target_temp: targetTemp,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${response.status}`);
    }
  }

  // ==================== REFRESH / POLLING ====================

  private async refreshAndUpdate(widget: Widget): Promise<void> {
    try {
      await this.fetchState(widget);
      // Find the widget's container and re-render device cards
      const widgetEl = document.getElementById(`widget-${widget.id}`);
      const container = widgetEl?.querySelector('.widget-content') as HTMLElement;
      if (container) {
        container.innerHTML = '';
        this.renderDevices(container, widget);
      }
    } catch (err) {
      console.error('Sensi refresh failed:', err);
    }
  }

  private startAutoRefresh(widget: Widget, container: HTMLElement): void {
    const content = widget.content as SensiContent;
    const interval = (content.refreshInterval || 30) * 1000;
    this.poller.start(widget.id, async () => {
      try {
        await this.fetchState(widget);
        // Only update if the container is still in the DOM
        if (container.isConnected) {
          container.innerHTML = '';
          this.renderDevices(container, widget);
        }
      } catch (err) {
        console.error('Sensi auto-refresh failed:', err);
      }
    }, interval);
  }

  // ==================== SETTINGS DIALOG ====================

  private showSettingsDialog(widget: Widget): void {
    const content = widget.content as SensiContent;

    const overlay = document.createElement('div');
    overlay.className = 'widget-overlay dark';

    const dialog = document.createElement('div');
    dialog.className = 'widget-dialog extended large';

    dialog.innerHTML = `
      <h3><i class="fa-solid fa-temperature-arrow-up"></i> Sensi Thermostat Settings</h3>

      <div class="card">
        <label class="widget-dialog-label medium">Saved Credential</label>
        <select id="sensi-credential-select" class="widget-dialog-input extended">
          <option value="">Select saved credential...</option>
        </select>
        <small class="sensi-config-hint">
          Create a credential with service type <strong>sensi</strong> containing your <code>refresh_token</code>.
        </small>
      </div>

      <div class="card">
        <label class="widget-dialog-label medium">Refresh Interval (seconds)</label>
        <input type="number" id="sensi-refresh" class="widget-dialog-input extended"
               min="10" max="300" value="${content.refreshInterval || 30}" />
        <small class="sensi-config-hint">
          How often to poll thermostat state (minimum 10s recommended)
        </small>
      </div>

      <div class="card">
        <label class="widget-dialog-label medium">Temperature Unit</label>
        <select id="sensi-temp-unit" class="widget-dialog-input extended">
          <option value="" ${!content.temperatureUnit ? 'selected' : ''}>Use thermostat setting</option>
          <option value="F" ${content.temperatureUnit === 'F' ? 'selected' : ''}>Fahrenheit (°F)</option>
          <option value="C" ${content.temperatureUnit === 'C' ? 'selected' : ''}>Celsius (°C)</option>
        </select>
      </div>

      <div class="widget-dialog-buttons">
        <div class="btn btn-small btn-secondary" id="sensi-cancel-btn">Cancel</div>
        <div class="btn btn-small btn-primary" id="sensi-save-btn">Save Settings</div>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const credentialSelect = dialog.querySelector('#sensi-credential-select') as HTMLSelectElement;
    populateCredentialSelect(credentialSelect, 'sensi', content.credentialId);

    const refreshInput = dialog.querySelector('#sensi-refresh') as HTMLInputElement;
    const tempUnitSelect = dialog.querySelector('#sensi-temp-unit') as HTMLSelectElement;
    const saveBtn = dialog.querySelector('#sensi-save-btn') as HTMLElement;
    const cancelBtn = dialog.querySelector('#sensi-cancel-btn') as HTMLElement;

    stopAllDragPropagation(dialog);

    saveBtn.addEventListener('click', () => {
      const credId = credentialSelect.value ? parseInt(credentialSelect.value) : undefined;
      const refreshInterval = Math.max(10, Math.min(300, parseInt(refreshInput.value) || 30));
      const temperatureUnit = tempUnitSelect.value as SensiContent['temperatureUnit'] || undefined;

      if (!credId) {
        alert('Please select a credential');
        return;
      }

      dispatchWidgetUpdate(widget.id, {
        ...content,
        credentialId: credId,
        refreshInterval,
        temperatureUnit: temperatureUnit || undefined,
      });

      overlay.remove();
    });

    cancelBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  // ==================== LIFECYCLE ====================

  destroy(): void {
    this.poller.stopAll();
    this.deviceData.clear();
  }
}

// ==================== CSS ====================

const style = document.createElement('style');
style.textContent = `
/* Sensi Thermostat Widget Styles */

.sensi-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 20px;
  color: var(--text-secondary);
  font-size: 14px;
}

.sensi-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 30px 20px;
  text-align: center;
  color: var(--text-secondary);
}

.sensi-error .widget-config-icon {
  color: #e74c3c;
}

.sensi-error small {
  color: var(--text-tertiary);
  max-width: 280px;
  word-break: break-word;
}

.sensi-retry-btn {
  margin-top: 8px;
}

.sensi-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 20px;
  color: var(--text-secondary);
}

.sensi-config-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 20px;
}

.sensi-config-container h3 {
  margin: 0;
  color: var(--text-primary);
}

.sensi-config-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sensi-config-hint {
  display: block;
  margin-top: 6px;
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1.5;
}

.sensi-config-hint a {
  color: var(--accent-color, #4CAF50);
}

.sensi-token-help {
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-tertiary);
  line-height: 1.6;
}

.sensi-token-help summary {
  cursor: pointer;
  color: var(--accent-color, #4CAF50);
  font-weight: 500;
}

.sensi-token-help ol {
  margin: 8px 0 0;
  padding-left: 20px;
}

.sensi-token-help code {
  background: var(--bg-tertiary, rgba(255,255,255,0.1));
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 10px;
}

 

.sensi-device-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 0;
}

.sensi-device-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sensi-device-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.sensi-device-status {
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.sensi-device-status.online {
  color: #2ecc71;
}

.sensi-device-status.online i {
  font-size: 6px;
}

.sensi-device-status.offline {
  color: #e74c3c;
}

.sensi-device-status.offline i {
  font-size: 6px;
}

// .sensi-collapse-btn {
//   background: none;
//   border: none;
//   color: var(--text-secondary);
//   cursor: pointer;
//   padding: 4px 8px;
//   font-size: 12px;
//   border-radius: 4px;
//   transition: background 0.15s;
// }

// .sensi-collapse-btn:hover {
//   background: var(--bg-tertiary, rgba(255,255,255,0.1));
// }

/* Body */
.sensi-device-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 8px;
}

/* Temperature + humidity reading row */
.sensi-reading-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.sensi-temp-display {
  display: flex;
  align-items: baseline;
}

.sensi-temp-value {
  font-size: 36px;
  font-weight: 700;
  line-height: 1;
  color: var(--text-primary);
}

.sensi-temp-unit {
  font-size: 16px;
  color: var(--text-secondary);
  margin-left: 2px;
}

.sensi-humidity-display {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  color: var(--text-secondary);
}

.sensi-active-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  margin-left: auto;
}

/* Controls row */
.sensi-controls-row {
  display: flex;
  gap: 12px;
}

.sensi-control-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 80px;
}

.sensi-control-group label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-tertiary);
}

.sensi-control-group select {
  padding: 6px 8px;
  font-size: 13px;
  border-radius: 6px;
}

/* Setpoints row */
.sensi-setpoints-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.sensi-setpoint-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 120px;
}

.sensi-setpoint-group label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  gap: 4px;
}

.sensi-setpoint-controls {
  margin-left: auto;
  margin-right: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.sensi-temp-btn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--border-color, rgba(255,255,255,0.15));
  background: var(--bg-tertiary, rgba(255,255,255,0.05));
  color: var(--text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  transition: background 0.15s, border-color 0.15s;
}

.sensi-temp-btn:hover:not(:disabled) {
  background: var(--accent-color, #4CAF50);
  border-color: var(--accent-color, #4CAF50);
  color: #fff;
}

.sensi-temp-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.sensi-setpoint-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  min-width: 55px;
  text-align: center;
}

/* Info row */
.sensi-info-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 4px;
}

.sensi-info-item {
  font-size: 11px;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  gap: 4px;
}
`;
document.head.appendChild(style);

// ==================== PLUGIN EXPORT ====================

export const widget = {
  type: 'sensi',
  name: 'Sensi Thermostat',
  icon: '<i class="fa-solid fa-temperature-arrow-up"></i>',
  description: 'Display and control Sensi thermostats',
  renderer: new SensiRenderer(),
  defaultSize: { w: 420, h: 550 },
  defaultContent: {
    refreshInterval: 30,
  } as SensiContent,
  hasSettings: true,
  allowedFields: ['credentialId', 'refreshInterval', 'temperatureUnit', 'collapsedDevices'],
};
