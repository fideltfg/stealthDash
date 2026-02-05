import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';
import { credentialsService } from '../services/credentials';
import { authService } from '../services/auth';

interface UnifiSensorContent {
  host: string; // UniFi Protect Console host (e.g., 'https://192.168.1.1')
  credentialId?: number; // ID of saved credential to use
  selectedSensors?: string[]; // Array of sensor IDs to display
  showTemperature?: boolean; // Show temperature reading (default: true)
  showHumidity?: boolean; // Show humidity reading (default: true)
  showLight?: boolean; // Show light level (default: true)
  temperatureUnit?: 'celsius' | 'fahrenheit' | 'both'; // Temperature display unit
  refreshInterval?: number; // Refresh interval in seconds (default: 30)
}

// UniFi Protect Sensor API structures
interface ProtectSensor {
  id: string;
  name: string;
  type: string;
  model: string;
  mac: string;
  state: string;
  isConnected: boolean;
  lastSeen: number;
  stats?: {
    temperature?: {
      value: number;
      unit: string;
    };
    humidity?: {
      value: number;
      unit: string;
    };
    light?: {
      value: number;
      unit: string;
    };
  };
}

interface ProtectBootstrap {
  cameras: any[];
  events: any[];
  sensors: ProtectSensor[];
}

class UnifiSensorRenderer implements WidgetRenderer {
  private updateIntervals: Map<string, number> = new Map();

  configure(widget: Widget): void {
    this.showConfigDialog(widget);
  }

  render(container: HTMLElement, widget: Widget): void {
    const content = widget.content as UnifiSensorContent;
    
    // If widget has no host or credential configured, show configuration prompt
    if (!content || !content.host || !content.credentialId) {
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
      <div class="unifi-sensor-widget widget-container">
        <div class="widget-header">
          <h3 class="widget-header-title"><i class="fas fa-thermometer-half"></i> Environmental Sensors</h3>
          <button class="refresh-btn widget-button">Refresh</button>
        </div>
        <div class="sensor-grid widget-grid-auto">
          <div class="loading widget-loading">Loading sensors...</div>
        </div>
      </div>
    `;

    // Add refresh button listener
    const refreshBtn = container.querySelector('.refresh-btn') as HTMLElement;
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.fetchAndRenderSensors(widget, container));
    }

    // Initial load
    this.fetchAndRenderSensors(widget, container);

    // Setup auto-refresh
    const refreshInterval = (content.refreshInterval || 30) * 1000;
    const intervalId = window.setInterval(() => {
      this.fetchAndRenderSensors(widget, container);
    }, refreshInterval);
    
    this.updateIntervals.set(widget.id, intervalId);
  }

  private async fetchAndRenderSensors(widget: Widget, container: HTMLElement): Promise<void> {
    const content = widget.content as UnifiSensorContent;
    const sensorGrid = container.querySelector('.sensor-grid');
    
    if (!sensorGrid) return;

    try {
      // Get auth token
      const token = authService.getToken();
      if (!token) {
        sensorGrid.innerHTML = '<div class="widget-error">Authentication required</div>';
        return;
      }

      // Fetch bootstrap data from ping-server (port 3001)
      const proxyUrl = new URL('/api/unifi-protect/bootstrap', window.location.origin.replace(':3000', ':3001'));
      proxyUrl.searchParams.set('host', content.host);
      proxyUrl.searchParams.set('credentialId', (content.credentialId || '').toString());

      const response = await fetch(proxyUrl.toString(), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch sensor data: ${response.statusText}`);
      }

      const data: ProtectBootstrap = await response.json();
      const sensors = data.sensors || [];

      // Filter by selected sensors if specified
      let filteredSensors = sensors;
      if (content.selectedSensors && content.selectedSensors.length > 0) {
        filteredSensors = sensors.filter(s => content.selectedSensors!.includes(s.id));
      }

      if (filteredSensors.length === 0) {
        sensorGrid.innerHTML = `
          <div class="widget-empty-state">
            No environmental sensors found. Make sure your USL-Environmental device is adopted and connected.
          </div>
        `;
        return;
      }

      // Render sensors
      this.renderSensorCards(sensorGrid as HTMLElement, filteredSensors, content);

    } catch (error) {
      console.error('Error fetching sensors:', error);
      sensorGrid.innerHTML = `
        <div class="widget-error">
          Error loading sensors: ${error instanceof Error ? error.message : 'Unknown error'}
        </div>
      `;
    }
  }

  private renderSensorCards(container: HTMLElement, sensors: ProtectSensor[], content: UnifiSensorContent): void {
    const showTemp = content.showTemperature !== false;
    const showHumidity = content.showHumidity !== false;
    const showLight = content.showLight !== false;
    const tempUnit = content.temperatureUnit || 'both';

    container.innerHTML = sensors.map(sensor => {
      const isConnected = sensor.isConnected;
      const statusClass = isConnected ? 'success' : 'error';
      const statusText = isConnected ? 'Connected' : 'Disconnected';

      return `
        <div class="widget-card sensor-card">
          <div class="sensor-card-header">
            <div class="sensor-icon"><i class="fas fa-thermometer-half"></i></div>
            <div class="flex-1">
              <div class="sensor-name">${sensor.name || 'Environmental Sensor'}</div>
              <div class="sensor-model">${sensor.model || 'Unknown Model'}</div>
            </div>
          </div>
          
          <div class="sensor-readings">
            ${showTemp && sensor.stats?.temperature ? this.renderReading(
              'Temperature', 
              this.formatTemperature(sensor.stats.temperature.value, tempUnit)
            ) : ''}
            
            ${showHumidity && sensor.stats?.humidity ? this.renderReading(
              'Humidity',
              `${sensor.stats.humidity.value.toFixed(1)}%`
            ) : ''}
            
            ${showLight && sensor.stats?.light ? this.renderReading(
              'Light Level',
              `${sensor.stats.light.value.toFixed(0)} lux`
            ) : ''}
          </div>
          
          <div class="sensor-card-footer">
            <span class="widget-status-badge ${statusClass}">
              ● ${statusText}
            </span>
            ${sensor.lastSeen ? `
              <span class="sensor-last-seen">
                ${this.formatTimestamp(sensor.lastSeen)}
              </span>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  private renderReading(label: string, value: string): string {
    return `
      <div class="sensor-reading">
        <span class="sensor-reading-label">${label}</span>
        <span class="sensor-reading-value">${value}</span>
      </div>
    `;
  }

  private formatTemperature(celsius: number, unit: 'celsius' | 'fahrenheit' | 'both'): string {
    const fahrenheit = (celsius * 9/5) + 32;
    
    switch (unit) {
      case 'celsius':
        return `${celsius.toFixed(1)}°C`;
      case 'fahrenheit':
        return `${fahrenheit.toFixed(1)}°F`;
      case 'both':
      default:
        return `${celsius.toFixed(1)}°C / ${fahrenheit.toFixed(1)}°F`;
    }
  }

  private formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    
    return date.toLocaleDateString();
  }

  private renderConfigPrompt(container: HTMLElement, widget: Widget): void {
    container.innerHTML = `
      <div class="widget-empty-state centered">
        <div class="widget-config-icon"><i class="fas fa-thermometer-half"></i></div>
        <h3 class="widget-empty-state-title">Environmental Sensors Not Configured</h3>
        <p class="widget-empty-state-text">Click the button below to configure your UniFi Protect connection</p>
        <button class="config-btn widget-button-primary">Configure Widget</button>
      </div>
    `;

    const configBtn = container.querySelector('.config-btn');
    if (configBtn) {
      configBtn.addEventListener('click', () => this.configure(widget));
    }
  }

  private async showConfigDialog(widget: Widget): Promise<void> {
    const content = widget.content as UnifiSensorContent;
    
    // Get all UniFi Protect credentials
    const allCredentials = await credentialsService.getAll();
    const unifiCreds = allCredentials.filter((c: any) => 
      c.service_type === 'unifi' || 
      c.service_type === 'unifi-protect' || 
      c.service_type === 'basic' || 
      c.service_type === 'custom'
    );

    const dialog = document.createElement('div');
    dialog.className = 'widget-overlay';
    
    dialog.innerHTML = `
      <div class="widget-dialog extended scrollable">
        <h3 class="widget-dialog-title large">Configure Environmental Sensors</h3>
        
        <div class="widget-dialog-field">
          <label class="widget-dialog-label medium">UniFi Protect Console URL</label>
          <input type="text" id="sensorHost" value="${content.host || 'https://192.168.1.1'}" 
            class="widget-dialog-input extended"
            placeholder="https://192.168.1.1">
        </div>
        
        <div class="widget-dialog-field">
          <label class="widget-dialog-label medium">Credentials</label>
          <select id="sensorCredential" class="widget-dialog-input extended">
            <option value="">Select saved credential...</option>
            ${unifiCreds.map((c: any) => `
              <option value="${c.id}" ${c.id === content.credentialId ? 'selected' : ''}>
                ${c.name}
              </option>
            `).join('')}
          </select>
          <small class="widget-field-hint">
            ${unifiCreds.length === 0 ? 'No credentials found. Create one in Credentials Manager first.' : 'Select an existing UniFi Protect credential'}
          </small>
        </div>
        
        <div class="widget-dialog-field">
          <label class="widget-dialog-label medium">Temperature Display</label>
          <select id="sensorTempUnit" class="widget-dialog-input extended">
            <option value="both" ${content.temperatureUnit === 'both' || !content.temperatureUnit ? 'selected' : ''}>Both (°C / °F)</option>
            <option value="celsius" ${content.temperatureUnit === 'celsius' ? 'selected' : ''}>Celsius only</option>
            <option value="fahrenheit" ${content.temperatureUnit === 'fahrenheit' ? 'selected' : ''}>Fahrenheit only</option>
          </select>
        </div>
        
        <div class="widget-dialog-field">
          <label class="widget-checkbox-label">
            <input type="checkbox" id="sensorShowTemp" ${content.showTemperature !== false ? 'checked' : ''} class="widget-checkbox">
            Show Temperature
          </label>
          <label class="widget-checkbox-label">
            <input type="checkbox" id="sensorShowHumidity" ${content.showHumidity !== false ? 'checked' : ''} class="widget-checkbox">
            Show Humidity
          </label>
          <label class="widget-checkbox-label">
            <input type="checkbox" id="sensorShowLight" ${content.showLight !== false ? 'checked' : ''} class="widget-checkbox">
            Show Light Level
          </label>
        </div>
        
        <div class="widget-dialog-field large-margin">
          <label class="widget-dialog-label medium">Refresh Interval (seconds)</label>
          <input type="number" id="sensorRefresh" value="${content.refreshInterval || 30}" min="5" max="300"
            class="widget-dialog-input extended">
        </div>
        
        <div class="widget-dialog-buttons">
          <button class="cancel-btn widget-dialog-button-cancel extended">Cancel</button>
          <button class="save-btn widget-dialog-button-save extended">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Handle cancel
    dialog.querySelector('.cancel-btn')?.addEventListener('click', () => {
      document.body.removeChild(dialog);
    });

    // Handle save
    dialog.querySelector('.save-btn')?.addEventListener('click', async () => {
      const host = (document.getElementById('sensorHost') as HTMLInputElement).value;
      const credentialId = parseInt((document.getElementById('sensorCredential') as HTMLSelectElement).value);
      const tempUnit = (document.getElementById('sensorTempUnit') as HTMLSelectElement).value as 'celsius' | 'fahrenheit' | 'both';
      const showTemp = (document.getElementById('sensorShowTemp') as HTMLInputElement).checked;
      const showHumidity = (document.getElementById('sensorShowHumidity') as HTMLInputElement).checked;
      const showLight = (document.getElementById('sensorShowLight') as HTMLInputElement).checked;
      const refreshInterval = parseInt((document.getElementById('sensorRefresh') as HTMLInputElement).value);

      if (!host) {
        alert('Please enter a UniFi Protect Console URL');
        return;
      }

      if (!credentialId) {
        alert('Please select a credential');
        return;
      }

      widget.content = {
        ...content,
        host,
        credentialId,
        temperatureUnit: tempUnit as any,
        showTemperature: showTemp,
        showHumidity: showHumidity,
        showLight: showLight,
        refreshInterval
      } as any;

      // Trigger save through widget manager
      const event = new CustomEvent('widget-updated', { detail: widget });
      window.dispatchEvent(event);

      document.body.removeChild(dialog);
    });
  }

  cleanup(widget: Widget): void {
    const intervalId = this.updateIntervals.get(widget.id);
    if (intervalId) {
      clearInterval(intervalId);
      this.updateIntervals.delete(widget.id);
    }
  }
}

// Export the widget with metadata
export const widget = {
  type: 'unifi-sensor',
  name: 'UniFi Environmental Sensors',
  icon: '<i class="fas fa-thermometer-half"></i>',
  description: 'Monitor temperature, humidity, and light from USL-Environmental devices',
  renderer: new UnifiSensorRenderer(),
  defaultSize: { w: 400, h: 400 },
  defaultContent: {
    host: '',
    credentialId: undefined,
    selectedSensors: [],
    showTemperature: true,
    showHumidity: true,
    showLight: true,
    temperatureUnit: 'both',
    refreshInterval: 30
  },
  hasSettings: true
};
