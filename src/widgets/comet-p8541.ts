import type { Widget } from '../types/types';
import type { WidgetRenderer, WidgetPlugin } from '../types/base-widget';
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

  // Styles are now loaded from ../css/comet-p8541.css


  render(container: HTMLElement, widget: Widget): void {
    container.innerHTML = '';
    const content = widget.content as unknown as CometP8541Content;

    if (!content.host) {
      this.renderConfigPrompt(container, widget);
      return;
    }
    const wrapper = document.createElement('div');
    // const headerRow = this.createHeader(content, container, widget);
    // wrapper.appendChild(headerRow);

    const loadingDiv = document.createElement('div');
    loadingDiv.textContent = 'Reading...';
    loadingDiv.className = 'widget-loading padded centered';
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
              gaugeWrapper.classList.add('card');
              // Create gauge container
              gaugeContainer = document.createElement('div');
              gaugeContainer.id = gaugeId;
              gaugeContainer.classList.add('gauge-container');

              // Create alarm status div
              alarmDiv = document.createElement('div');

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

            // Remove previous alarm classes
            alarmDiv.className = 'badge alarm-div running';
            if (reading.sensorError) {
              alarmText = "SENSOR ERROR";
              alarmDiv.classList.add('alarm-flash-error');
            } else if (reading.alarm === "hi") {
              alarmText = "TOO HOT!";
              alarmDiv.classList.add('alarm-flash-hot');
            } else if (reading.alarm === "lo") {
              alarmText = "TOO COLD!";
              alarmDiv.classList.add('alarm-flash-cold');
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
                  //console.log(`Successfully created gauge: ${gaugeId}`);
                } catch (e) {
                  console.error(`Error creating JustGage ${gaugeId}:`, e);
                  const fallbackElement = document.getElementById(gaugeId);
                  if (fallbackElement) {
                    fallbackElement.innerHTML = `
                      <div class="comet-gauge-fallback">
                        <div class="comet-gauge-fallback-value">${reading.value.toFixed(1)}${reading.unit}</div>
                        <div class="comet-gauge-fallback-name">${reading.name}</div>
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
            channelDiv.className = 'comet-channel';

            // Top row: name and value
            const topRow = document.createElement('div');
            topRow.className = 'comet-channel-top-row';

            const nameLabel = document.createElement('div');
            nameLabel.className = 'comet-channel-name';
            nameLabel.textContent = reading.name;

            const valueLabel = document.createElement('div');
            valueLabel.className = 'comet-channel-value';

            // Color based on alarm status (sensor error takes priority)
            if (reading.sensorError) {
              valueLabel.classList.add('error');
              valueLabel.textContent = 'ERROR';
            } else if (reading.alarm === "hi") {
              valueLabel.classList.add('hot');
              valueLabel.textContent = `${reading.value.toFixed(1)}${reading.unit}`;
            } else if (reading.alarm === "lo") {
              valueLabel.classList.add('cold');
              valueLabel.textContent = `${reading.value.toFixed(1)}${reading.unit}`;
            } else {
              valueLabel.classList.add('normal');
              valueLabel.textContent = `${reading.value.toFixed(1)}${reading.unit}`;
            }

            topRow.appendChild(nameLabel);
            topRow.appendChild(valueLabel);

            // Bottom row: limits and alarm status
            const bottomRow = document.createElement('div');
            bottomRow.className = 'comet-channel-bottom-row';

            const limitsLabel = document.createElement('div');
            limitsLabel.className = 'comet-channel-limits';
            limitsLabel.textContent = `Range: ${reading.lowerLimit.toFixed(1)} - ${reading.upperLimit.toFixed(1)}${reading.unit}`;

            const alarmLabel = document.createElement('div');
            alarmLabel.className = 'comet-channel-alarm';

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
              alarmLabel.classList.add('normal');
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
            errorOverlay.className = 'widget-error overlay';
            wrapper.appendChild(errorOverlay);
          }

          // Update error message
          const errorMessage = error.name === 'AbortError'
            ? 'Connection timeout - device not responding'
            : (error.message || 'Failed to read sensor');

          errorOverlay.innerHTML = `
            <div class="widget-error-icon large animated"><i class="fas fa-exclamation-triangle"></i></div>
            <div class="widget-error-title">Temporary Connection Error</div>
            <div class="widget-error-detail">${errorMessage}</div>
            <div class="widget-error-retry">Retrying in ${content.refreshInterval || 10} seconds...</div>
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
        headerRow.className = 'comet-header-row';

        const headerLeft = document.createElement('div');
        headerLeft.className = 'comet-header-left';

        const header = document.createElement('div');
        header.className = 'comet-header';
        header.innerHTML = '<i class="fas fa-thermometer-half"></i> ' + (content.deviceName || 'Comet P8541');

        const deviceInfo = document.createElement('div');
        deviceInfo.className = 'comet-device-info';
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
    errorDiv.className = 'comet-error';
    errorDiv.innerHTML = `<div class="widget-error-icon"><i class="fas fa-exclamation-triangle"></i></div><div>${message}</div>`;
    container.appendChild(errorDiv);
  }

  private renderConfigPrompt(container: HTMLElement, widget: Widget): void {
    const content = widget.content as unknown as CometP8541Content;

    const form = document.createElement('div');
    form.className = 'comet-config-form';

    const title = document.createElement('div');
    title.className = 'comet-config-title';
    title.innerHTML = '<i class="fas fa-thermometer-half"></i> Configure Comet P8541';
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
      group.className = 'comet-form-group';

      const label = document.createElement('label');
      label.textContent = field.label;
      label.className = 'widget-dialog-label small';

      const input = document.createElement('input');
      input.type = field.type;
      input.placeholder = field.placeholder;
      input.value = field.value?.toString() || (content as any)[field.key] || '';
      input.className = 'comet-form-input';

      inputs[field.key] = input;
      group.appendChild(label);
      group.appendChild(input);
      form.appendChild(group);
    });

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save & Connect';
    saveBtn.className = 'comet-btn-primary';

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
    overlay.className = 'widget-overlay dark';

    const modal = document.createElement('div');
    modal.className = 'widget-dialog dark-theme';

    const title = document.createElement('div');
    title.className = 'comet-modal-title';
    title.innerHTML = '<i class="fas fa-cog"></i> Comet P8541 Settings';
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
      group.className = 'widget-dialog-group';

      const label = document.createElement('label');
      label.textContent = field.label;
      label.className = 'widget-dialog-label small';

      const input = document.createElement('input');
      input.type = field.type;
      input.value = field.value?.toString() || '';
      input.className = 'widget-dialog-input dark-theme';

      // Prevent arrow keys from moving the widget
      input.addEventListener('keydown', (e) => e.stopPropagation());
      input.addEventListener('keyup', (e) => e.stopPropagation());

      inputs[field.key] = input;
      group.appendChild(label);
      group.appendChild(input);
      modal.appendChild(group);
    });

    // Temperature unit selector
    const tempGroup = document.createElement('div');
    tempGroup.className = 'widget-dialog-group';

    const tempLabel = document.createElement('label');
    tempLabel.textContent = 'Temperature Unit';
    tempLabel.className = 'widget-dialog-label small';

    const tempSelect = document.createElement('select');
    tempSelect.className = 'comet-form-select';

    // Prevent arrow keys from moving the widget
    tempSelect.addEventListener('keydown', (e) => e.stopPropagation());
    tempSelect.addEventListener('keyup', (e) => e.stopPropagation());

    ['C', 'F'].forEach(unit => {
      const option = document.createElement('option');
      option.value = unit;
      option.textContent = unit === 'C' ? 'Celsius (°C)' : 'Fahrenheit (°F)';
      option.selected = (content.temperatureUnit || 'C') === unit;
      tempSelect.appendChild(option);
    });

    tempGroup.appendChild(tempLabel);
    tempGroup.appendChild(tempSelect);
    modal.appendChild(tempGroup);

    // Display mode selector
    const displayGroup = document.createElement('div');
    displayGroup.className = 'widget-dialog-group';

    const displayLabel = document.createElement('label');
    displayLabel.textContent = 'Display Mode';
    displayLabel.className = 'widget-dialog-label small';

    const displaySelect = document.createElement('select');
    displaySelect.className = 'comet-form-select';

    // Prevent arrow keys from moving the widget
    displaySelect.addEventListener('keydown', (e) => e.stopPropagation());
    displaySelect.addEventListener('keyup', (e) => e.stopPropagation());

    ['gauge', 'text'].forEach(mode => {
      const option = document.createElement('option');
      option.value = mode;
      option.textContent = mode === 'gauge' ? 'Gauge Display' : 'Text Display';
      option.selected = (content.displayMode || 'gauge') === mode;
      displaySelect.appendChild(option);
    });

    displayGroup.appendChild(displayLabel);
    displayGroup.appendChild(displaySelect);
    modal.appendChild(displayGroup);

    // Channel enable/disable and naming
    const channelsGroup = document.createElement('div');
    channelsGroup.className = 'comet-channels-group';

    const channelsLabel = document.createElement('div');
    channelsLabel.textContent = 'Channels';
    channelsLabel.className = 'widget-dialog-label small';
    channelsGroup.appendChild(channelsLabel);

    const channels = ['temp1', 'temp2', 'temp3', 'temp4', 'humidity'];
    const channelDefaultNames = ['Temperature 1', 'Temperature 2', 'Temperature 3', 'Temperature 4', 'Humidity'];
    const channelInputs: { [key: string]: HTMLInputElement } = {};
    const channelNameInputs: { [key: string]: HTMLInputElement } = {};

    channels.forEach((ch, idx) => {
      const channelRow = document.createElement('div');
      channelRow.className = 'comet-channel-row';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = content.enabledChannels?.[ch as keyof typeof content.enabledChannels] !== false;
      checkbox.className = 'comet-channel-checkbox';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.placeholder = channelDefaultNames[idx];
      nameInput.value = content.channelNames?.[ch as keyof typeof content.channelNames] || '';
      nameInput.className = 'comet-channel-name-input';

      // Prevent arrow keys from moving the widget
      nameInput.addEventListener('keydown', (e) => e.stopPropagation());
      nameInput.addEventListener('keyup', (e) => e.stopPropagation());

      channelInputs[ch] = checkbox;
      channelNameInputs[ch] = nameInput;

      channelRow.appendChild(checkbox);
      channelRow.appendChild(nameInput);
      channelsGroup.appendChild(channelRow);
    });

    modal.appendChild(channelsGroup);

    // Buttons
    const btnGroup = document.createElement('div');
    btnGroup.className = 'widget-dialog-buttons small-gap';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.className = 'widget-dialog-button-save green';

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
    cancelBtn.className = 'widget-dialog-button-cancel dark-theme';
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


  // Helper method to create header with settings button
  private createHeader(content: CometP8541Content, container: HTMLElement, widget: Widget, deviceName?: string): HTMLElement {
    const headerRow = document.createElement('div');
    headerRow.className = 'comet-header-row';

    const headerLeft = document.createElement('div');
    headerLeft.className = 'comet-header-left';

    const header = document.createElement('div');
    header.className = 'comet-header';
    header.innerHTML = '' + (deviceName || content.deviceName || 'Comet P8541');

    const deviceInfo = document.createElement('subtitle');
    deviceInfo.className = 'comet-device-info';
    deviceInfo.textContent = content.host;

    // Add "View Charts" link

    headerLeft.appendChild(header);
    headerLeft.appendChild(deviceInfo);

    

    headerRow.appendChild(headerLeft);
    return headerRow;
  }
}

export const widget: WidgetPlugin = {
  type: 'comet-p8541',
  name: 'Comet P8541',
  icon: '<i class="fas fa-temperature-high"></i>',
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
