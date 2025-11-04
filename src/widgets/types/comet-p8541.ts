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
  enabledChannels?: {
    temp1?: boolean;
    temp2?: boolean;
    temp3?: boolean;
    temp4?: boolean;
    humidity?: boolean;
  };
}

// Comet P8541 Modbus Register Map (from manual IE-SNC-P85x1-19)
// Addresses are in Modbus format (40000 series = holding registers)
const REGISTERS = {
  TEMP1: 40000,      // 0x9C40 - Channel 1 temperature (Int*10)
  TEMP2: 40006,      // 0x9C46 - Channel 2 temperature (Int*10)
  TEMP3: 40012,      // 0x9C4C - Channel 3 temperature (Int*10)
  TEMP4: 40018,      // 0x9C52 - Channel 4 temperature (Int*10)
  HUMIDITY: 0,       // Need to verify humidity register address
  ALARMS: 256
};

export class CometP8541Renderer implements WidgetRenderer {
  private intervals = new Map<string, number>();
  private abortControllers = new Map<string, AbortController>();

  render(container: HTMLElement, widget: Widget): void {
    container.innerHTML = '';
    const content = widget.content as unknown as CometP8541Content;

    if (!content.host) {
      this.renderConfigPrompt(container, widget);
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      padding: 15px;
      box-sizing: border-box;
      overflow-y: auto;
    `;

    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;';

    const headerLeft = document.createElement('div');
    headerLeft.style.cssText = 'display: flex; flex-direction: column;';
    
    const header = document.createElement('div');
    header.style.cssText = 'font-size: 18px; font-weight: 600;';
    header.textContent = '🌡️ Comet P8541';
    
    const deviceInfo = document.createElement('div');
    deviceInfo.style.cssText = 'font-size: 11px; opacity: 0.5; margin-top: 2px;';
    deviceInfo.textContent = content.deviceName || `${content.host}`;
    
    headerLeft.appendChild(header);
    headerLeft.appendChild(deviceInfo);

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
    wrapper.appendChild(headerRow);

    const loadingDiv = document.createElement('div');
    loadingDiv.textContent = 'Reading...';
    loadingDiv.style.cssText = 'opacity: 0.5; font-size: 14px; text-align: center;';
    wrapper.appendChild(loadingDiv);

    container.appendChild(wrapper);

    this.cleanup(widget.id);

    const fetchData = async () => {
      try {
        const controller = new AbortController();
        this.abortControllers.set(widget.id, controller);

        const enabled = content.enabledChannels || {};
        const channels = [];
        
        if (enabled.temp1 !== false) channels.push({ name: 'Temp 1', reg: REGISTERS.TEMP1, unit: '°' + (content.temperatureUnit || 'C') });
        if (enabled.temp2 !== false) channels.push({ name: 'Temp 2', reg: REGISTERS.TEMP2, unit: '°' + (content.temperatureUnit || 'C') });
        if (enabled.temp3 !== false) channels.push({ name: 'Temp 3', reg: REGISTERS.TEMP3, unit: '°' + (content.temperatureUnit || 'C') });
        if (enabled.temp4 !== false) channels.push({ name: 'Temp 4', reg: REGISTERS.TEMP4, unit: '°' + (content.temperatureUnit || 'C') });
        if (enabled.humidity !== false) channels.push({ name: 'Humidity', reg: REGISTERS.HUMIDITY, unit: '%' });

        const readings = await Promise.all(
          channels.map(async (ch) => {
            // Modbus holding registers: 40000 series
            // The actual address to use is the offset: 40000 = 0, 40001 = 1, 40006 = 6, etc.
            const modbusAddress = ch.reg >= 40000 ? ch.reg - 40000 : ch.reg;
            
            const params = new URLSearchParams({
              host: content.host,
              port: (content.port || 502).toString(),
              unitId: (content.unitId || 1).toString(),
              address: modbusAddress.toString(),
              count: '6', // Read 6 registers: value, alarm, upper, lower, hysteresis, delay
              type: 'holding'
            });

            const response = await fetch(`http://localhost:3001/modbus/read?${params}`, {
              signal: controller.signal
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Read failed');

            // Parse the 6 registers: [value, alarm, upper, lower, hysteresis, delay]
            const [rawValue, rawAlarm, rawUpper, rawLower, rawHysteresis, rawDelay] = result.data;
            
            // Helper to convert signed 16-bit integers
            const toSigned = (val: number) => val > 32767 ? val - 65536 : val;
            
            // Convert values (all Int*10 except alarm and delay)
            let value = toSigned(rawValue) / 10;
            const alarmStatus = String.fromCharCode(rawAlarm >> 8, rawAlarm & 0xFF).trim(); // Convert to ASCII
            const upperLimit = toSigned(rawUpper) / 10;
            const lowerLimit = toSigned(rawLower) / 10;
            const hysteresis = toSigned(rawHysteresis) / 10;
            const delay = rawDelay;

            if (ch.unit.includes('°') && content.temperatureUnit === 'F') {
              value = (value * 9/5) + 32;
            }

            return { 
              name: ch.name, 
              value: value, 
              unit: ch.unit,
              alarm: alarmStatus,
              upperLimit,
              lowerLimit,
              hysteresis,
              delay
            };
          })
        );

        wrapper.innerHTML = '';
        
        // Recreate header with settings button
        const headerRow = document.createElement('div');
        headerRow.style.cssText = 'display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;';

        const headerLeft = document.createElement('div');
        headerLeft.style.cssText = 'display: flex; flex-direction: column;';
        
        const header = document.createElement('div');
        header.style.cssText = 'font-size: 18px; font-weight: 600;';
        header.textContent = '🌡️ Comet P8541';
        
        const deviceInfo = document.createElement('div');
        deviceInfo.style.cssText = 'font-size: 11px; opacity: 0.5; margin-top: 2px;';
        deviceInfo.textContent = content.deviceName || `${content.host}`;
        
        headerLeft.appendChild(header);
        headerLeft.appendChild(deviceInfo);

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
        wrapper.appendChild(headerRow);

        // Create gauges container
        const gaugesContainer = document.createElement('div');
        gaugesContainer.style.cssText = `
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 20px;
          padding: 10px;
        `;
        
        readings.forEach((reading, index) => {
          // Create gauge wrapper with dark dashboard theme
          const gaugeWrapper = document.createElement('div');
          gaugeWrapper.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            background: rgba(0, 0, 0, 0.3);
            border-radius: 8px;
            padding: 15px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          `;

          // Create gauge container
          const gaugeContainer = document.createElement('div');
          const gaugeId = `gauge-${widget.id}-${index}`;
          gaugeContainer.id = gaugeId;
          gaugeContainer.style.cssText = 'width: 150px; height: 120px;';

          // Create alarm status div
          const alarmDiv = document.createElement('div');
          alarmDiv.className = 'alarm-div';
          alarmDiv.style.cssText = `
            margin-top: 10px;
            font-weight: bold;
            padding: 5px 10px;
            border-radius: 5px;
            background: rgba(76, 175, 80, 0.2);
            color: #4CAF50;
          `;

          // Determine alarm state from reading
          // alarm register: "no" = normal (0), "lo" = too cold (2), "hi" = too hot (1)
          let alarmText = "Norminal";
          
          if (reading.alarm === "hi") {
            alarmText = "TOO HOT!";
            alarmDiv.style.background = '';
            alarmDiv.style.color = '';
            alarmDiv.style.animation = 'flash-hot 0.5s infinite alternate';
          } else if (reading.alarm === "lo") {
            alarmText = "TOO COLD!";
            alarmDiv.style.background = '';
            alarmDiv.style.color = '';
            alarmDiv.style.animation = 'flash-cold 0.5s infinite alternate';
          }
          
          alarmDiv.textContent = alarmText;

          gaugeWrapper.appendChild(gaugeContainer);
          gaugeWrapper.appendChild(alarmDiv);
          gaugesContainer.appendChild(gaugeWrapper);

          // Create gauge after DOM is ready
          setTimeout(() => {
            try {
              new JustGage({
                id: gaugeId,
                value: reading.value,
                min: reading.lowerLimit - 30,
                max: reading.upperLimit + 35,
                title: reading.name,
                label: reading.unit,
                pointer: true,
                customSectors: [{
                  color: "#0000ff",
                  lo: reading.lowerLimit - 30,
                  hi: reading.lowerLimit
                }, {
                  color: "#00ff00",
                  lo: reading.lowerLimit,
                  hi: reading.upperLimit
                }, {
                  color: "#ff0000",
                  lo: reading.upperLimit,
                  hi: reading.upperLimit + 35
                }],
                counter: true,
                gaugeColor: '#333333',
                titleFontColor: '#ffffff',
                valueFontColor: '#ffffff',
                labelFontColor: '#cccccc',
                shadowOpacity: 0
              });
            } catch (e) {
              console.error('Error creating JustGage:', e);
              gaugeContainer.textContent = `${reading.value.toFixed(1)}${reading.unit}`;
            }
          }, 100);
        });
        
        wrapper.appendChild(gaugesContainer);

        // Add flash animation styles if not already present
        if (!document.getElementById('comet-flash-styles')) {
          const style = document.createElement('style');
          style.id = 'comet-flash-styles';
          style.textContent = `
            @keyframes flash-hot {
              from { background-color: rgba(244, 67, 54, 0.2); color: #f44336; }
              to { background-color: rgba(244, 67, 54, 0.8); color: white; }
            }
            @keyframes flash-cold {
              from { background-color: rgba(33, 150, 243, 0.2); color: #2196F3; }
              to { background-color: rgba(33, 150, 243, 0.8); color: white; }
            }
          `;
          document.head.appendChild(style);
        }

      } catch (error: any) {
        if (error.name === 'AbortError') return;
        wrapper.innerHTML = '';
        wrapper.appendChild(headerRow);
        this.renderError(wrapper, error.message || 'Failed to read');
      }
    };

    fetchData();
    const intervalId = window.setInterval(fetchData, (content.refreshInterval || 10) * 1000);
    this.intervals.set(widget.id, intervalId);
    this.setupCleanupObserver(container, widget.id);
  }

  private renderError(container: HTMLElement, message: string): void {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'color: #f44336; padding: 20px; text-align: center; font-size: 14px;';
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
      background: rgba(255, 255, 255, 0.1);
      color: white;
      box-sizing: border-box;
    `;
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

    // Channel enable/disable
    const channelsGroup = document.createElement('div');
    channelsGroup.style.marginBottom = '15px';
    
    const channelsLabel = document.createElement('div');
    channelsLabel.textContent = 'Enabled Channels';
    channelsLabel.style.cssText = 'font-size: 12px; opacity: 0.7; margin-bottom: 10px;';
    channelsGroup.appendChild(channelsLabel);

    const channels = ['temp1', 'temp2', 'temp3', 'temp4', 'humidity'];
    const channelNames = ['Temperature 1', 'Temperature 2', 'Temperature 3', 'Temperature 4', 'Humidity'];
    const channelInputs: { [key: string]: HTMLInputElement } = {};

    channels.forEach((ch, idx) => {
      const checkGroup = document.createElement('div');
      checkGroup.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 8px;';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = content.enabledChannels?.[ch as keyof typeof content.enabledChannels] !== false;
      checkbox.style.cursor = 'pointer';
      
      const label = document.createElement('label');
      label.textContent = channelNames[idx];
      label.style.cursor = 'pointer';
      label.onclick = () => checkbox.click();
      
      channelInputs[ch] = checkbox;
      checkGroup.appendChild(checkbox);
      checkGroup.appendChild(label);
      channelsGroup.appendChild(checkGroup);
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
        showAlarms: content.showAlarms !== false,
        enabledChannels: {
          temp1: channelInputs.temp1.checked,
          temp2: channelInputs.temp2.checked,
          temp3: channelInputs.temp3.checked,
          temp4: channelInputs.temp4.checked,
          humidity: channelInputs.humidity.checked
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
    showAlarms: true,
    enabledChannels: {
      temp1: true,
      temp2: true,
      temp3: true,
      temp4: true,
      humidity: true
    }
  }
};
