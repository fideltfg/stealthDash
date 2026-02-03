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
      <div class="unifi-sensor-widget" style="width: 100%; height: 100%; display: flex; flex-direction: column; padding: 16px; overflow: auto; background: var(--surface);">
        <div class="sensor-header" style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; color: var(--text); font-size: 18px; font-weight: 600;"><i class="fas fa-thermometer-half"></i> Environmental Sensors</h3>
          <button class="refresh-btn" style="padding: 6px 12px; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
            Refresh
          </button>
        </div>
        <div class="sensor-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; flex: 1; overflow: auto;">
          <div class="loading" style="text-align: center; padding: 20px; color: var(--text-secondary);">
            Loading sensors...
          </div>
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
        sensorGrid.innerHTML = '<div style="padding: 20px; color: var(--danger);">Authentication required</div>';
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
          <div style="padding: 20px; text-align: center; color: var(--text-secondary);">
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
        <div style="padding: 20px; color: var(--danger);">
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
      const statusColor = isConnected ? 'var(--success)' : 'var(--danger)';
      const statusText = isConnected ? 'Connected' : 'Disconnected';

      return `
        <div class="sensor-card" style="background: var(--widget-surface); border-radius: 12px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: transform 0.2s; border: 1px solid var(--border);">
          <div style="display: flex; align-items: center; margin-bottom: 12px;">
            <div style="font-size: 32px; margin-right: 12px;"><i class="fas fa-thermometer-half"></i></div>
            <div style="flex: 1;">
              <div style="font-weight: 600; color: var(--text); font-size: 16px;">${sensor.name || 'Environmental Sensor'}</div>
              <div style="font-size: 12px; color: var(--text-secondary);">${sensor.model || 'Unknown Model'}</div>
            </div>
          </div>
          
          <div style="display: flex; flex-direction: column; gap: 12px;">
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
          
          <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">
            <span style="display: inline-block; padding: 4px 8px; background: ${statusColor}15; color: ${statusColor}; border-radius: 4px; font-size: 11px; font-weight: 600;">
              ● ${statusText}
            </span>
            ${sensor.lastSeen ? `
              <span style="float: right; font-size: 11px; color: var(--text-secondary);">
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
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: var(--surface); border-radius: 8px;">
        <span style="font-size: 13px; color: var(--text-secondary);">${label}</span>
        <span style="font-size: 20px; font-weight: 700; color: var(--primary);">${value}</span>
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
      <div style="padding: 20px; text-align: center; color: var(--text-secondary);">
        <div style="font-size: 48px; margin-bottom: 16px;"><i class="fas fa-thermometer-half"></i></div>
        <h3 style="margin-bottom: 8px; color: var(--text);">Environmental Sensors Not Configured</h3>
        <p style="margin-bottom: 16px;">Click the button below to configure your UniFi Protect connection</p>
        <button class="config-btn" style="padding: 10px 20px; background: var(--primary); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600;">
          Configure Widget
        </button>
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
    dialog.className = 'widget-config-dialog';
    dialog.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';
    
    dialog.innerHTML = `
      <div style="background: var(--surface); border-radius: 12px; padding: 24px; max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto;">
        <h3 style="margin: 0 0 20px 0; color: var(--text);">Configure Environmental Sensors</h3>
        
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 6px; color: var(--text); font-weight: 600;">UniFi Protect Console URL</label>
          <input type="text" id="sensorHost" value="${content.host || 'https://192.168.1.1'}" 
            style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--input-bg); color: var(--text);"
            placeholder="https://192.168.1.1">
        </div>
        
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 6px; color: var(--text); font-weight: 600;">Credentials</label>
          <select id="sensorCredential" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--input-bg); color: var(--text);">
            <option value="">Select saved credential...</option>
            ${unifiCreds.map((c: any) => `
              <option value="${c.id}" ${c.id === content.credentialId ? 'selected' : ''}>
                ${c.name}
              </option>
            `).join('')}
          </select>
          <small style="color: var(--text-secondary); font-size: 12px;">
            ${unifiCreds.length === 0 ? 'No credentials found. Create one in Credentials Manager first.' : 'Select an existing UniFi Protect credential'}
          </small>
        </div>
        
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 6px; color: var(--text); font-weight: 600;">Temperature Display</label>
          <select id="sensorTempUnit" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--input-bg); color: var(--text);">
            <option value="both" ${content.temperatureUnit === 'both' || !content.temperatureUnit ? 'selected' : ''}>Both (°C / °F)</option>
            <option value="celsius" ${content.temperatureUnit === 'celsius' ? 'selected' : ''}>Celsius only</option>
            <option value="fahrenheit" ${content.temperatureUnit === 'fahrenheit' ? 'selected' : ''}>Fahrenheit only</option>
          </select>
        </div>
        
        <div style="margin-bottom: 16px;">
          <label style="display: flex; align-items: center; color: var(--text); cursor: pointer;">
            <input type="checkbox" id="sensorShowTemp" ${content.showTemperature !== false ? 'checked' : ''} style="margin-right: 8px;">
            Show Temperature
          </label>
          <label style="display: flex; align-items: center; color: var(--text); cursor: pointer; margin-top: 8px;">
            <input type="checkbox" id="sensorShowHumidity" ${content.showHumidity !== false ? 'checked' : ''} style="margin-right: 8px;">
            Show Humidity
          </label>
          <label style="display: flex; align-items: center; color: var(--text); cursor: pointer; margin-top: 8px;">
            <input type="checkbox" id="sensorShowLight" ${content.showLight !== false ? 'checked' : ''} style="margin-right: 8px;">
            Show Light Level
          </label>
        </div>
        
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 6px; color: var(--text); font-weight: 600;">Refresh Interval (seconds)</label>
          <input type="number" id="sensorRefresh" value="${content.refreshInterval || 30}" min="5" max="300"
            style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--input-bg); color: var(--text);">
        </div>
        
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button class="cancel-btn" style="padding: 10px 20px; background: var(--secondary); color: var(--text); border: none; border-radius: 6px; cursor: pointer;">
            Cancel
          </button>
          <button class="save-btn" style="padding: 10px 20px; background: var(--primary); color: white; border: none; border-radius: 6px; cursor: pointer;">
            Save
          </button>
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
