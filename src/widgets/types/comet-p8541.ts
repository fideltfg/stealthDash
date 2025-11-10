import type { Widget } from '../../types';
import type { WidgetRenderer, WidgetPlugin } from './base';
import JustGage from 'justgage';






interface CometP8541Content {
  host: string;
  port?: number;
  unitId?: number;
  refreshInterval?: number;
  temperatureUnit?: 'C' | 'F';
  showAlarms?: boolean;
  deviceName?: string;
  displayMode?: 'gauge' | 'text';
  enabledChannels?: {
    temp1?: boolean;
    temp2?: boolean;
    temp3?: boolean;
    temp4?: boolean;
    humidity?: boolean;
  };
  channelNames?: {
    temp1?: string;
    temp2?: string;
    temp3?: string;
    temp4?: string;
    humidity?: string;
  };
}

// Comet P8541 SNMP OIDs (from manual IE-SNC-P85x1-19)
// Base OID: 1.3.6.1.4.1.22626.1.5.2
// Structure: 1.3.6.1.4.1.22626.1.5.2.ch.X.0
// where ch = channel number (1-4), X = parameter (1=name, 3=value, 4=alarm, 5=high, 6=low)
const SNMP_OIDS = {
  // Device name
  DEVICE_NAME: '1.3.6.1.4.1.22626.1.5.1.1.0',

  // Channel names (String)
  TEMP1_NAME: '1.3.6.1.4.1.22626.1.5.2.1.1.0',
  TEMP2_NAME: '1.3.6.1.4.1.22626.1.5.2.2.1.0',
  TEMP3_NAME: '1.3.6.1.4.1.22626.1.5.2.3.1.0',
  TEMP4_NAME: '1.3.6.1.4.1.22626.1.5.2.4.1.0',
  HUMIDITY_NAME: '1.3.6.1.4.1.22626.1.5.2.5.1.0',

  // Channel values (Int*10)
  TEMP1_VALUE: '1.3.6.1.4.1.22626.1.5.2.1.3.0',
  TEMP2_VALUE: '1.3.6.1.4.1.22626.1.5.2.2.3.0',
  TEMP3_VALUE: '1.3.6.1.4.1.22626.1.5.2.3.3.0',
  TEMP4_VALUE: '1.3.6.1.4.1.22626.1.5.2.4.3.0',
  HUMIDITY_VALUE: '1.3.6.1.4.1.22626.1.5.2.5.3.0',

  // Alarm status (Integer: 0/1/2)
  TEMP1_ALARM: '1.3.6.1.4.1.22626.1.5.2.1.4.0',
  TEMP2_ALARM: '1.3.6.1.4.1.22626.1.5.2.2.4.0',
  TEMP3_ALARM: '1.3.6.1.4.1.22626.1.5.2.3.4.0',
  TEMP4_ALARM: '1.3.6.1.4.1.22626.1.5.2.4.4.0',
  HUMIDITY_ALARM: '1.3.6.1.4.1.22626.1.5.2.5.4.0',

  // Upper limits (Int*10)
  TEMP1_UPPER: '1.3.6.1.4.1.22626.1.5.2.1.5.0',
  TEMP2_UPPER: '1.3.6.1.4.1.22626.1.5.2.2.5.0',
  TEMP3_UPPER: '1.3.6.1.4.1.22626.1.5.2.3.5.0',
  TEMP4_UPPER: '1.3.6.1.4.1.22626.1.5.2.4.5.0',
  HUMIDITY_UPPER: '1.3.6.1.4.1.22626.1.5.2.5.5.0',

  // Lower limits (Int*10)
  TEMP1_LOWER: '1.3.6.1.4.1.22626.1.5.2.1.6.0',
  TEMP2_LOWER: '1.3.6.1.4.1.22626.1.5.2.2.6.0',
  TEMP3_LOWER: '1.3.6.1.4.1.22626.1.5.2.3.6.0',
  TEMP4_LOWER: '1.3.6.1.4.1.22626.1.5.2.4.6.0',
  HUMIDITY_LOWER: '1.3.6.1.4.1.22626.1.5.2.5.6.0'
};

export class CometP8541Renderer implements WidgetRenderer {
  private intervals = new Map<string, number>();
  private abortControllers = new Map<string, AbortController>();
  private gauges = new Map<string, any>(); // Store gauge instances by widget ID

  configure(widget: Widget): void {
    const container = document.getElementById(`widget-${widget.id}`)?.querySelector('.widget-content') as HTMLElement;
    if (container) {
      this.showSettings(container, widget);
    }
  }

  // Get the ping-server base URL (works for both localhost and remote deployments)
  private getPingServerUrl(): string {
    // Check if we're in development (localhost) or production
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;

    // Use environment variable if available, otherwise construct from current host
    const envUrl = (import.meta as any).env?.VITE_PING_SERVER_URL;
    if (envUrl) {
      return envUrl;
    }

    // Default to port 3001 on the same host as the dashboard
    return `${protocol}//${hostname}:3001`;
  }

  private styles(): void {
    // Add flash animation styles if not already present
    if (!document.getElementById('comet-flash-styles')) {
      const style = document.createElement('style');
      style.id = 'comet-flash-styles';
      style.textContent = `
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.1); }
        }
      `;
      document.head.appendChild(style);
    }
  }


  render(container: HTMLElement, widget: Widget): void {
    container.innerHTML = '';
    const content = widget.content as unknown as CometP8541Content;

    this.styles();

    if (!content.host) {
      this.renderConfigPrompt(container, widget);
      return;
    }

    const wrapper = this.createWrapper();
    // const headerRow = this.createHeader(content, container, widget);
    // wrapper.appendChild(headerRow);

    const loadingDiv = document.createElement('div');
    loadingDiv.textContent = 'Reading...';
    loadingDiv.classList.add('loadingDiv');
    wrapper.appendChild(loadingDiv);

    container.appendChild(wrapper);

    // this.cleanup(widget.id);

    const fetchData = async () => {
      const controller = new AbortController();
      this.abortControllers.set(widget.id, controller);

      // Set timeout for the fetch operation (30 seconds - enough time for SNMP retries and slow networks)
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        const enabled = content.enabledChannels || {};
        const customNames = content.channelNames || {};

        // First, fetch device name and channel names from SNMP
        let deviceName = content.deviceName || content.host;
        const snmpChannelNames: { [key: string]: string } = {};

        try {
          const nameOids = [
            SNMP_OIDS.DEVICE_NAME,
            SNMP_OIDS.TEMP1_NAME,
            SNMP_OIDS.TEMP2_NAME,
            SNMP_OIDS.TEMP3_NAME,
            SNMP_OIDS.TEMP4_NAME,
            SNMP_OIDS.HUMIDITY_NAME
          ].join(',');

          const params = new URLSearchParams({
            host: content.host,
            community: 'public',
            oids: nameOids
          });

          const nameResponse = await fetch(`${this.getPingServerUrl()}/snmp/get?${params}`, {
            signal: controller.signal
          });

          if (nameResponse.ok) {
            const nameResult = await nameResponse.json();
            if (nameResult.success && nameResult.data) {
              // Extract device name (if not empty)
              const deviceNameValue = String(nameResult.data[0]?.value || '').trim();
              if (deviceNameValue && deviceNameValue !== '[object Object]') {
                deviceName = deviceNameValue;
              }

              // Extract channel names (if not empty)
              const channelNameValues = nameResult.data.slice(1);
              const channelIds = ['temp1', 'temp2', 'temp3', 'temp4', 'humidity'];
              channelNameValues.forEach((vb: any, idx: number) => {
                const name = String(vb?.value || '').trim();
                if (name && name !== '[object Object]') {
                  snmpChannelNames[channelIds[idx]] = name;
                }
              });
            }
          }
        } catch (nameError) {
          console.warn('Could not fetch names from SNMP, using defaults:', nameError);
        }

        const channels = [];

        // Define channel configurations with SNMP OIDs
        // Use priority: custom names > SNMP names > default names
        if (enabled.temp1 !== false) channels.push({
          id: 'temp1',
          name: customNames.temp1 || snmpChannelNames.temp1 || 'Temp 1',
          valueOid: SNMP_OIDS.TEMP1_VALUE,
          alarmOid: SNMP_OIDS.TEMP1_ALARM,
          upperOid: SNMP_OIDS.TEMP1_UPPER,
          lowerOid: SNMP_OIDS.TEMP1_LOWER,
          unit: '°' + (content.temperatureUnit || 'C')
        });
        if (enabled.temp2 !== false) channels.push({
          id: 'temp2',
          name: customNames.temp2 || snmpChannelNames.temp2 || 'Temp 2',
          valueOid: SNMP_OIDS.TEMP2_VALUE,
          alarmOid: SNMP_OIDS.TEMP2_ALARM,
          upperOid: SNMP_OIDS.TEMP2_UPPER,
          lowerOid: SNMP_OIDS.TEMP2_LOWER,
          unit: '°' + (content.temperatureUnit || 'C')
        });
        if (enabled.temp3 !== false) channels.push({
          id: 'temp3',
          name: customNames.temp3 || snmpChannelNames.temp3 || 'Temp 3',
          valueOid: SNMP_OIDS.TEMP3_VALUE,
          alarmOid: SNMP_OIDS.TEMP3_ALARM,
          upperOid: SNMP_OIDS.TEMP3_UPPER,
          lowerOid: SNMP_OIDS.TEMP3_LOWER,
          unit: '°' + (content.temperatureUnit || 'C')
        });
        if (enabled.temp4 !== false) channels.push({
          id: 'temp4',
          name: customNames.temp4 || snmpChannelNames.temp4 || 'Temp 4',
          valueOid: SNMP_OIDS.TEMP4_VALUE,
          alarmOid: SNMP_OIDS.TEMP4_ALARM,
          upperOid: SNMP_OIDS.TEMP4_UPPER,
          lowerOid: SNMP_OIDS.TEMP4_LOWER,
          unit: '°' + (content.temperatureUnit || 'C')
        });
        if (enabled.humidity !== false) channels.push({
          id: 'humidity',
          name: customNames.humidity || snmpChannelNames.humidity || 'Humidity',
          valueOid: SNMP_OIDS.HUMIDITY_VALUE,
          alarmOid: SNMP_OIDS.HUMIDITY_ALARM,
          upperOid: SNMP_OIDS.HUMIDITY_UPPER,
          lowerOid: SNMP_OIDS.HUMIDITY_LOWER,
          unit: '%'
        });

        const readings = await Promise.all(
          channels.map(async (ch) => {
            // Build list of OIDs to fetch for this channel
            const oids = [ch.valueOid, ch.alarmOid, ch.upperOid, ch.lowerOid].join(',');

            const params = new URLSearchParams({
              host: content.host,
              community: 'public',
              oids: oids
            });

            const response = await fetch(`${this.getPingServerUrl()}/snmp/get?${params}`, {
              signal: controller.signal
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'SNMP read failed');

            // Parse SNMP response
            const [valueVb, alarmVb, upperVb, lowerVb] = result.data;

            // Helper to convert signed 16-bit integers
            const toSigned = (val: number) => val > 32767 ? val - 65536 : val;

            // Convert values (Int*10 for temperature/humidity)
            let value = toSigned(valueVb.value) / 10;

            // Alarm status is integer: 0 = normal, 1 = high alarm, 2 = low alarm
            const alarmCode = parseInt(alarmVb.value);
            let alarmStatus = 'no';
            if (alarmCode === 1) alarmStatus = 'hi';
            else if (alarmCode === 2) alarmStatus = 'lo';

            const upperLimit = toSigned(upperVb.value) / 10;
            const lowerLimit = toSigned(lowerVb.value) / 10;

            if (ch.unit.includes('°') && content.temperatureUnit === 'F') {
              value = (value * 9 / 5) + 32;
            }

            // Check for sensor errors (values out of valid range)
            const isSensorError = value < -1000 || value > 1000;

            return {
              name: ch.name,
              value: value,
              unit: ch.unit,
              alarm: alarmStatus,
              upperLimit,
              lowerLimit,
              hysteresis: 0, // Not available via SNMP
              delay: 0, // Not available via SNMP
              sensorError: isSensorError
            };
          })
        );

        // Check if this is the first render or an update
        const existingDisplayContainer = wrapper.querySelector('.display-container');

        if (!existingDisplayContainer) {
          // First render - create everything
          wrapper.innerHTML = '';
          const headerRow = this.createHeader(content, container, widget, deviceName);
          wrapper.appendChild(headerRow);
        }

        // Create or get display container
        let displayContainer = wrapper.querySelector('.display-container') as HTMLElement;
        if (!displayContainer) {
          displayContainer = document.createElement('div');
          displayContainer.className = 'display-container';
          wrapper.appendChild(displayContainer);
        }

        const displayMode = content.displayMode || 'gauge';

        if (displayMode === 'gauge') {
          // Gauge display mode
          displayContainer.classList.remove('text-mode');
          displayContainer.classList.add('gauge-mode');
          readings.forEach((reading, index) => {
            const gaugeId = `gauge-${widget.id}-${index}`;

            // Check if gauge wrapper already exists
            let gaugeWrapper = displayContainer.querySelector(`[data-gauge-index="${index}"]`) as HTMLElement;
            let gaugeContainer: HTMLElement;
            let alarmDiv: HTMLElement;

            if (!gaugeWrapper) {
              // Create gauge wrapper with dark dashboard theme (first time only)
              gaugeWrapper = document.createElement('div');
              gaugeWrapper.setAttribute('data-gauge-index', String(index));
              gaugeWrapper.classList.add('gauge-wrapper');

              // Create gauge container
              gaugeContainer = document.createElement('div');
              gaugeContainer.id = gaugeId;
              gaugeContainer.classList.add('gauge-container');

              // Create alarm status div
              alarmDiv = document.createElement('div');
              alarmDiv.classList.add('alarm-div');

              gaugeWrapper.appendChild(gaugeContainer);
              gaugeWrapper.appendChild(alarmDiv);
              displayContainer.appendChild(gaugeWrapper);
            } else {
              // Get existing elements
              gaugeContainer = gaugeWrapper.querySelector(`#${gaugeId}`) as HTMLElement;
              alarmDiv = gaugeWrapper.querySelector('.alarm-div') as HTMLElement;
            }

            // Update alarm status
            let alarmText = "Norminal";



            if (reading.sensorError) {
              alarmText = "SENSOR ERROR";
              alarmDiv.classList.add('alarm-flash-error');
            } else if (reading.alarm === "hi") {
              alarmText = "TOO HOT!";
              alarmDiv.classList.add('alarm-flash-hot');
            } else if (reading.alarm === "lo") {
              alarmText = "TOO COLD!";
              alarmDiv.classList.add('alarm-flash-cold');
            } else {
              alarmDiv.style.backgroundColor = 'rgba(76, 175, 80, 0.2)';
              alarmDiv.style.color = '#4CAF50';
            }

            alarmDiv.textContent = alarmText;

            // Create or update gauge
            const existingGauge = this.gauges.get(gaugeId);

            if (existingGauge && gaugeContainer) {
              // Update existing gauge value (pointer moves, no redraw)
              try {
                existingGauge.refresh(reading.sensorError ? 0 : reading.value);
                // Successfully updated - no need to create new gauge
                return;
              } catch (e) {
                console.error(`Error refreshing gauge ${gaugeId}:`, e);
                // Only recreate if the gauge is actually broken
                // Most refresh errors are temporary, so just log and skip recreation
                return;
              }
            }
            
            // Create new gauge ONLY if it doesn't exist
            if (!this.gauges.has(gaugeId) && gaugeContainer) {
              // Use requestAnimationFrame to ensure DOM is fully updated
              requestAnimationFrame(() => {
                // Double-check the element still exists and isn't being recreated
                const element = document.getElementById(gaugeId);
                if (!element) {
                  console.warn(`Gauge element ${gaugeId} not found in DOM after requestAnimationFrame`);
                  return;
                }
                
                // Ensure we don't already have a gauge (race condition check)
                if (this.gauges.has(gaugeId)) {
                  return;
                }
                
                try {
                  // Get actual container dimensions for consistent gauge sizing
                  // This ensures gauges render at the correct size every time
                  const containerWidth = element.offsetWidth || 300;
                  const containerHeight = element.offsetHeight || 150;
                  
                  // Don't create gauge if container has no size
                  if (containerWidth === 0 || containerHeight === 0) {
                    console.warn(`Gauge container ${gaugeId} has zero dimensions, skipping creation`);
                    return;
                  }
                  
                  const config = {
                    id: gaugeId,
                    value: reading.sensorError ? 0 : reading.value,
                    min: reading.lowerLimit - 30,
                    max: reading.upperLimit + 35,
                    title: reading.name,
                    label: reading.unit,
                    width: containerWidth,         // Explicit width from container
                    height: containerHeight,       // Explicit height from container
                    relativeGaugeSize: true,       // Scale gauge elements proportionally
                    pointer: true,
                    pointerOptions: {
                      color: "#ffffff",
                      toplength: 0,
                      bottomlength: 20
                    },
                    levelColors: [
                      "#2196F3",
                      "#4CAF50",
                      "#f44336"
                    ],
                    targetLine: 0,
                    targetLineColor: "#000000",
                    targetLineWidth: 5,
                    noGradient: false,
                    showSectorColors: true,
                    customSectors: {
                      percents: false,
                      ranges: [
                        {
                          lo: reading.lowerLimit - 30,
                          hi: reading.lowerLimit,
                          color: "#2196F3"  // Blue for too cold
                        }, {
                          lo: reading.lowerLimit,
                          hi: reading.upperLimit,
                          color: "#4CAF50"  // Green for normal range
                        }, {
                          lo: reading.upperLimit,
                          hi: reading.upperLimit + 35,
                          color: "#f44336"  // Red for too hot
                        }
                      ]
                    },
                    gaugeColor: '#333333',
                    titleFontColor: '#ffffff',
                    valueFontColor: '#ffffff',
                    labelFontColor: '#cccccc',
                    shadowOpacity: 0
                  } as any;
                  
                  const gauge = new JustGage(config);
                  this.gauges.set(gaugeId, gauge);
                  console.log(`Successfully created gauge: ${gaugeId}`);
                } catch (e) {
                  console.error(`Error creating JustGage ${gaugeId}:`, e);
                  const fallbackElement = document.getElementById(gaugeId);
                  if (fallbackElement) {
                    fallbackElement.innerHTML = `
                      <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; color: white;">
                        <div style="font-size: 24px; font-weight: bold;">${reading.value.toFixed(1)}${reading.unit}</div>
                        <div style="font-size: 12px; opacity: 0.7;">${reading.name}</div>
                      </div>
                    `;
                  }
                }
              });
            }
          });
        } else {
          // Text display mode
          displayContainer.classList.remove('gauge-mode');
          displayContainer.classList.add('text-mode');

          readings.forEach((reading) => {
            const channelDiv = document.createElement('div');
            channelDiv.style.cssText = `
              display: flex;
              flex-direction: column;
              background: rgba(0, 0, 0, 0.3);
              border-radius: 8px;
              padding: 12px 15px;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            `;

            // Top row: name and value
            const topRow = document.createElement('div');
            topRow.style.cssText = `
              display: flex;
              justify-content: space-between;
              align-items: baseline;
              margin-bottom: 8px;
            `;

            const nameLabel = document.createElement('div');
            nameLabel.style.cssText = 'font-size: 14px; font-weight: 500; opacity: 0.9;';
            nameLabel.textContent = reading.name;

            const valueLabel = document.createElement('div');
            valueLabel.style.cssText = 'font-size: 24px; font-weight: bold;';

            // Color based on alarm status (sensor error takes priority)
            if (reading.sensorError) {
              valueLabel.style.color = '#f44336';
              valueLabel.style.animation = 'flash-error 0.5s infinite alternate';
              valueLabel.textContent = 'ERROR';
            } else if (reading.alarm === "hi") {
              valueLabel.style.color = '#f44336';
              valueLabel.style.animation = 'flash-hot 0.5s infinite alternate';
              valueLabel.textContent = `${reading.value.toFixed(1)}${reading.unit}`;
            } else if (reading.alarm === "lo") {
              valueLabel.style.color = '#2196F3';
              valueLabel.style.animation = 'flash-cold 0.5s infinite alternate';
              valueLabel.textContent = `${reading.value.toFixed(1)}${reading.unit}`;
            } else {
              valueLabel.style.color = '#4CAF50';
              valueLabel.textContent = `${reading.value.toFixed(1)}${reading.unit}`;
            }

            topRow.appendChild(nameLabel);
            topRow.appendChild(valueLabel);

            // Bottom row: limits and alarm status
            const bottomRow = document.createElement('div');
            bottomRow.style.cssText = `
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 11px;
              opacity: 0.7;
            `;

            const limitsLabel = document.createElement('div');
            limitsLabel.textContent = `Range: ${reading.lowerLimit.toFixed(1)} - ${reading.upperLimit.toFixed(1)}${reading.unit}`;

            const alarmLabel = document.createElement('div');
            alarmLabel.style.cssText = 'font-weight: 600; padding: 3px 8px; border-radius: 4px;';

            if (reading.sensorError) {
              alarmLabel.textContent = "SENSOR ERROR";
              alarmLabel.classList.add('alarm-flash-error');
            } else if (reading.alarm === "hi") {
              alarmLabel.textContent = "TOO HOT";
              alarmLabel.classList.add('alarm-flash-hot');
            } else if (reading.alarm === "lo") {
              alarmLabel.textContent = "TOO COLD";
              alarmLabel.classList.add('alarm-flash-cold');
            } else {
              alarmLabel.textContent = "Normal";
              alarmLabel.style.backgroundColor = 'rgba(76, 175, 80, 0.2)';
              alarmLabel.style.color = '#4CAF50';
            }

            bottomRow.appendChild(limitsLabel);
            bottomRow.appendChild(alarmLabel);

            channelDiv.appendChild(topRow);
            channelDiv.appendChild(bottomRow);
            displayContainer.appendChild(channelDiv);
          });
        }

        wrapper.appendChild(displayContainer);



        // Clear the timeout since fetch completed successfully
        clearTimeout(timeoutId);

      } catch (error: any) {
        // Clear the timeout on error as well
        clearTimeout(timeoutId);

        console.error('Comet P8541 error:', error);

        // Check if we already have a display - if so, just show error overlay instead of destroying everything
        const existingDisplayContainer = wrapper.querySelector('.display-container');
        
        if (existingDisplayContainer) {
          // We have existing gauges - just show a temporary error overlay
          let errorOverlay = wrapper.querySelector('.error-overlay') as HTMLElement;
          
          if (!errorOverlay) {
            errorOverlay = document.createElement('div');
            errorOverlay.className = 'error-overlay';
            errorOverlay.style.cssText = `
              position: absolute;
              top: 40px;
              left: 0;
              right: 0;
              bottom: 0;
              background: rgba(0, 0, 0, 0.85);
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              color: #f44336;
              font-size: 14px;
              padding: 20px;
              z-index: 10;
              border-radius: 8px;
            `;
            wrapper.appendChild(errorOverlay);
          }
          
          // Update error message
          const errorMessage = error.name === 'AbortError' 
            ? 'Connection timeout - device not responding' 
            : (error.message || 'Failed to read sensor');
          
          errorOverlay.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 16px; animation: pulse 2s infinite;">⚠️</div>
            <div style="font-weight: 600; margin-bottom: 8px;">Temporary Connection Error</div>
            <div style="opacity: 0.8; text-align: center;">${errorMessage}</div>
            <div style="font-size: 12px; opacity: 0.6; margin-top: 12px;">Retrying in ${content.refreshInterval || 10} seconds...</div>
          `;
          
          // Remove error overlay after a delay to show the next attempt
          setTimeout(() => {
            if (errorOverlay && errorOverlay.parentNode) {
              errorOverlay.remove();
            }
          }, Math.min((content.refreshInterval || 10) * 1000 - 1000, 9000));
          
          return; // Keep existing gauges and header
        }

        // No existing display - this is first load error, so show full error screen
        wrapper.innerHTML = '';

        // Recreate header
        const headerRow = document.createElement('div');
        headerRow.className = 'header-row';

        const headerLeft = document.createElement('div');
        headerLeft.className = 'header-left';

        const header = document.createElement('div');
        header.className = 'header';
        header.textContent = '🌡️ ' + (content.deviceName || 'Comet P8541');

        const deviceInfo = document.createElement('div');
        deviceInfo.className = 'device-info';
        deviceInfo.textContent = content.host;

        headerLeft.appendChild(header);
        headerLeft.appendChild(deviceInfo);
        headerRow.appendChild(headerLeft);
        wrapper.appendChild(headerRow);

        // Show appropriate error message
        if (error.name === 'AbortError') {
          this.renderError(wrapper, 'Connection timeout - device not responding');
        } else {
          this.renderError(wrapper, error.message || 'Failed to read sensor');
        }
      }
    };

    fetchData();
    const intervalId = window.setInterval(fetchData, (content.refreshInterval || 10) * 1000);
    this.intervals.set(widget.id, intervalId);
    this.setupCleanupObserver(container, widget.id);
  }

  private renderError(container: HTMLElement, message: string): void {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'errorDiv';
    errorDiv.innerHTML = `<div style="font-size: 32px; margin-bottom: 10px;">⚠️</div><div>${message}</div>`;
    container.appendChild(errorDiv);
  }

  private renderConfigPrompt(container: HTMLElement, widget: Widget): void {
    const content = widget.content as unknown as CometP8541Content;

    const form = document.createElement('div');
    form.style.cssText = 'padding: 20px; display: flex; flex-direction: column; gap: 15px;';

    const title = document.createElement('div');
    title.style.cssText = 'font-size: 18px; font-weight: 600; margin-bottom: 10px; text-align: center;';
    title.textContent = '🌡️ Configure Comet P8541';
    form.appendChild(title);

    const fields = [
      { label: 'Device Name (optional)', key: 'deviceName', type: 'text', placeholder: 's/n: 21941503', value: content.deviceName || '' },
      { label: 'IP Address', key: 'host', type: 'text', placeholder: '192.168.1.100', required: true },
      { label: 'Port', key: 'port', type: 'number', placeholder: '502', value: content.port || 502 },
      { label: 'Unit ID', key: 'unitId', type: 'number', placeholder: '1', value: content.unitId || 1 },
      { label: 'Refresh Interval (sec)', key: 'refreshInterval', type: 'number', placeholder: '10', value: content.refreshInterval || 10 }
    ];

    const inputs: { [key: string]: HTMLInputElement } = {};

    fields.forEach(field => {
      const group = document.createElement('div');

      const label = document.createElement('label');
      label.textContent = field.label;
      label.style.cssText = 'font-size: 12px; opacity: 0.7; margin-bottom: 5px; display: block;';

      const input = document.createElement('input');
      input.type = field.type;
      input.placeholder = field.placeholder;
      input.value = field.value?.toString() || (content as any)[field.key] || '';
      input.style.cssText = `
        width: 100%;
        padding: 8px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.05);
        color: inherit;
        box-sizing: border-box;
      `;

      inputs[field.key] = input;
      group.appendChild(label);
      group.appendChild(input);
      form.appendChild(group);
    });

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save & Connect';
    saveBtn.style.cssText = `
      padding: 10px;
      background: #4CAF50;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
      margin-top: 10px;
    `;

    saveBtn.onclick = () => {
      const newContent = {
        ...content,
        deviceName: inputs.deviceName.value || '',
        host: inputs.host.value,
        port: parseInt(inputs.port.value) || 502,
        unitId: parseInt(inputs.unitId.value) || 1,
        refreshInterval: parseInt(inputs.refreshInterval.value) || 10,
        temperatureUnit: content.temperatureUnit || 'C',
        showAlarms: content.showAlarms !== false,
        enabledChannels: content.enabledChannels || {
          temp1: true,
          temp2: true,
          temp3: true,
          temp4: true,
          humidity: true
        }
      };

      widget.content = newContent as any;

      // Trigger save
      const event = new CustomEvent('widget-updated', { detail: { widget } });
      window.dispatchEvent(event);

      this.render(container, widget);
    };

    form.appendChild(saveBtn);
    container.appendChild(form);
  }

  private showSettings(container: HTMLElement, widget: Widget): void {
    const content = widget.content as unknown as CometP8541Content;

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      background: #1a1a1a;
      border-radius: 8px;
      padding: 20px;
      max-width: 500px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      color: white;
    `;

    const title = document.createElement('div');
    title.style.cssText = 'font-size: 18px; font-weight: 600; margin-bottom: 20px;';
    title.textContent = '⚙️ Comet P8541 Settings';
    modal.appendChild(title);

    const fields = [
      { label: 'Device Name (optional)', key: 'deviceName', type: 'text', value: content.deviceName || '' },
      { label: 'IP Address', key: 'host', type: 'text', value: content.host },
      { label: 'Port', key: 'port', type: 'number', value: content.port || 502 },
      { label: 'Unit ID', key: 'unitId', type: 'number', value: content.unitId || 1 },
      { label: 'Refresh Interval (sec)', key: 'refreshInterval', type: 'number', value: content.refreshInterval || 10 }
    ];

    const inputs: { [key: string]: HTMLInputElement } = {};

    fields.forEach(field => {
      const group = document.createElement('div');
      group.style.marginBottom = '15px';

      const label = document.createElement('label');
      label.textContent = field.label;
      label.style.cssText = 'font-size: 12px; opacity: 0.7; margin-bottom: 5px; display: block;';

      const input = document.createElement('input');
      input.type = field.type;
      input.value = field.value?.toString() || '';
      input.style.cssText = `
        width: 100%;
        padding: 8px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.1);
        color: white;
        box-sizing: border-box;
      `;

      inputs[field.key] = input;
      group.appendChild(label);
      group.appendChild(input);
      modal.appendChild(group);
    });

    // Temperature unit selector
    const tempGroup = document.createElement('div');
    tempGroup.style.marginBottom = '15px';

    const tempLabel = document.createElement('label');
    tempLabel.textContent = 'Temperature Unit';
    tempLabel.style.cssText = 'font-size: 12px; opacity: 0.7; margin-bottom: 5px; display: block;';

    const tempSelect = document.createElement('select');
    tempSelect.style.cssText = `
      width: 100%;
      padding: 8px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      background: #2a2a2a;
      color: white;
      box-sizing: border-box;
      cursor: pointer;
    `;
    ['C', 'F'].forEach(unit => {
      const option = document.createElement('option');
      option.value = unit;
      option.textContent = unit === 'C' ? 'Celsius (°C)' : 'Fahrenheit (°F)';
      option.selected = (content.temperatureUnit || 'C') === unit;
      option.style.cssText = 'background: #2a2a2a; color: white;';
      tempSelect.appendChild(option);
    });

    tempGroup.appendChild(tempLabel);
    tempGroup.appendChild(tempSelect);
    modal.appendChild(tempGroup);

    // Display mode selector
    const displayGroup = document.createElement('div');
    displayGroup.style.marginBottom = '15px';

    const displayLabel = document.createElement('label');
    displayLabel.textContent = 'Display Mode';
    displayLabel.style.cssText = 'font-size: 12px; opacity: 0.7; margin-bottom: 5px; display: block;';

    const displaySelect = document.createElement('select');
    displaySelect.style.cssText = `
      width: 100%;
      padding: 8px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      background: #2a2a2a;
      color: white;
      box-sizing: border-box;
      cursor: pointer;
    `;
    ['gauge', 'text'].forEach(mode => {
      const option = document.createElement('option');
      option.value = mode;
      option.textContent = mode === 'gauge' ? 'Gauge Display' : 'Text Display';
      option.selected = (content.displayMode || 'gauge') === mode;
      option.style.cssText = 'background: #2a2a2a; color: white;';
      displaySelect.appendChild(option);
    });

    displayGroup.appendChild(displayLabel);
    displayGroup.appendChild(displaySelect);
    modal.appendChild(displayGroup);

    // Channel enable/disable and naming
    const channelsGroup = document.createElement('div');
    channelsGroup.style.marginBottom = '15px';

    const channelsLabel = document.createElement('div');
    channelsLabel.textContent = 'Channels';
    channelsLabel.style.cssText = 'font-size: 12px; opacity: 0.7; margin-bottom: 10px;';
    channelsGroup.appendChild(channelsLabel);

    const channels = ['temp1', 'temp2', 'temp3', 'temp4', 'humidity'];
    const channelDefaultNames = ['Temperature 1', 'Temperature 2', 'Temperature 3', 'Temperature 4', 'Humidity'];
    const channelInputs: { [key: string]: HTMLInputElement } = {};
    const channelNameInputs: { [key: string]: HTMLInputElement } = {};

    channels.forEach((ch, idx) => {
      const channelRow = document.createElement('div');
      channelRow.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 8px;';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = content.enabledChannels?.[ch as keyof typeof content.enabledChannels] !== false;
      checkbox.style.cssText = 'cursor: pointer; flex-shrink: 0;';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.placeholder = channelDefaultNames[idx];
      nameInput.value = content.channelNames?.[ch as keyof typeof content.channelNames] || '';
      nameInput.style.cssText = `
        flex: 1;
        padding: 6px 10px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.05);
        color: white;
        font-size: 12px;
        box-sizing: border-box;
      `;

      channelInputs[ch] = checkbox;
      channelNameInputs[ch] = nameInput;

      channelRow.appendChild(checkbox);
      channelRow.appendChild(nameInput);
      channelsGroup.appendChild(channelRow);
    });

    modal.appendChild(channelsGroup);

    // Buttons
    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display: flex; gap: 10px; margin-top: 20px;';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.style.cssText = `
      flex: 1;
      padding: 10px;
      background: #4CAF50;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
    `;

    saveBtn.onclick = () => {
      const newContent: CometP8541Content = {
        deviceName: inputs.deviceName.value || '',
        host: inputs.host.value,
        port: parseInt(inputs.port.value) || 502,
        unitId: parseInt(inputs.unitId.value) || 1,
        refreshInterval: parseInt(inputs.refreshInterval.value) || 10,
        temperatureUnit: tempSelect.value as 'C' | 'F',
        displayMode: displaySelect.value as 'gauge' | 'text',
        showAlarms: content.showAlarms !== false,
        enabledChannels: {
          temp1: channelInputs.temp1.checked,
          temp2: channelInputs.temp2.checked,
          temp3: channelInputs.temp3.checked,
          temp4: channelInputs.temp4.checked,
          humidity: channelInputs.humidity.checked
        },
        channelNames: {
          temp1: channelNameInputs.temp1.value || '',
          temp2: channelNameInputs.temp2.value || '',
          temp3: channelNameInputs.temp3.value || '',
          temp4: channelNameInputs.temp4.value || '',
          humidity: channelNameInputs.humidity.value || ''
        }
      };

      widget.content = newContent as any;

      const event = new CustomEvent('widget-updated', { detail: { widget } });
      window.dispatchEvent(event);

      overlay.remove();
      this.render(container, widget);
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      flex: 1;
      padding: 10px;
      background: rgba(255, 255, 255, 0.1);
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    `;
    cancelBtn.onclick = () => overlay.remove();

    btnGroup.appendChild(saveBtn);
    btnGroup.appendChild(cancelBtn);
    modal.appendChild(btnGroup);

    overlay.appendChild(modal);
    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.remove();
    };

    document.body.appendChild(overlay);
  }

  private cleanup(widgetId: string): void {
    const interval = this.intervals.get(widgetId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(widgetId);
    }
    const controller = this.abortControllers.get(widgetId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(widgetId);
    }

    // Clean up gauge instances for this widget
    const gaugeKeys = Array.from(this.gauges.keys()).filter(key => key.startsWith(`gauge-${widgetId}-`));
    gaugeKeys.forEach(key => {
      const gauge = this.gauges.get(key);
      if (gauge && typeof gauge.destroy === 'function') {
        gauge.destroy();
      }
      this.gauges.delete(key);
    });
  }

  private setupCleanupObserver(container: HTMLElement, widgetId: string): void {
    const observer = new MutationObserver(() => {
      if (!document.body.contains(container)) {
        this.cleanup(widgetId);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Helper method to create wrapper element
  private createWrapper(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      padding: 5px;
      box-sizing: border-box;
      overflow-y: auto;
      position: relative;
    `;
    return wrapper;
  }

  // Helper method to create header with settings button
  private createHeader(content: CometP8541Content, container: HTMLElement, widget: Widget, deviceName?: string): HTMLElement {
    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;';

    const headerLeft = document.createElement('div');
    headerLeft.style.cssText = 'display: flex; flex-direction: column;';

    const header = document.createElement('div');
    header.style.cssText = 'font-size: 18px; font-weight: 600;';
    header.textContent = '🌡️ ' + (deviceName || content.deviceName || 'Comet P8541');

    const deviceInfo = document.createElement('div');
    deviceInfo.style.cssText = 'font-size: 11px; opacity: 0.5; margin-top: 2px;';
    deviceInfo.textContent = content.host;

    // Add "View Charts" link
    const chartsLink = document.createElement('a');
    chartsLink.href = 'http://sensors.norquay.local:8889/';
    chartsLink.target = '_blank';
    chartsLink.textContent = 'View Charts';
    chartsLink.style.cssText = `
      font-size: 11px;
      color: #4CAF50;
      text-decoration: none;
      margin-top: 4px;
      display: inline-block;
      opacity: 0.8;
      transition: opacity 0.2s;
    `;
    chartsLink.onmouseover = () => chartsLink.style.opacity = '1';
    chartsLink.onmouseout = () => chartsLink.style.opacity = '0.8';

    headerLeft.appendChild(header);
    headerLeft.appendChild(deviceInfo);
    headerLeft.appendChild(chartsLink);

    const settingsBtn = document.createElement('button');
    settingsBtn.innerHTML = '⚙️';
    settingsBtn.className = 'widget-settings-btn';
    settingsBtn.style.cssText = `
      background: rgba(255, 255, 255, 0.1);
      border: none;
      border-radius: 4px;
      padding: 4px 8px;
      cursor: pointer;
      font-size: 16px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s;
    `;
    settingsBtn.onclick = () => this.showSettings(container, widget);

    // Show settings button when widget is selected
    const updateSettingsVisibility = () => {
      const widgetElement = container.closest('.widget');
      if (widgetElement?.classList.contains('selected')) {
        settingsBtn.style.opacity = '1';
        settingsBtn.style.pointerEvents = 'auto';
      } else {
        settingsBtn.style.opacity = '0';
        settingsBtn.style.pointerEvents = 'none';
      }
    };

    // Initial check
    updateSettingsVisibility();

    // Watch for class changes
    const observer = new MutationObserver(updateSettingsVisibility);
    const widgetElement = container.closest('.widget');
    if (widgetElement) {
      observer.observe(widgetElement, { attributes: true, attributeFilter: ['class'] });
    }

    headerRow.appendChild(headerLeft);
    headerRow.appendChild(settingsBtn);
    return headerRow;
  }
}

export const widget: WidgetPlugin = {
  type: 'comet-p8541',
  name: 'Comet P8541',
  icon: '🌡️',
  description: 'Multi-channel temperature and humidity sensor (Modbus TCP)',
  renderer: new CometP8541Renderer(),
  defaultSize: { w: 400, h: 500 },
  defaultContent: {
    host: '',
    port: 502,
    unitId: 1,
    refreshInterval: 10,
    temperatureUnit: 'C',
    displayMode: 'gauge',
    showAlarms: true,
    enabledChannels: {
      temp1: true,
      temp2: true,
      temp3: true,
      temp4: true,
      humidity: true
    },
    channelNames: {
      temp1: '',
      temp2: '',
      temp3: '',
      temp4: '',
      humidity: ''
    }
  }
};
