import type { Widget, WidgetContent } from '../../types';
import type { WidgetRenderer } from './base';

export interface MTNXMLContent extends WidgetContent {
  feedUrl: string;
  refreshInterval: number; // in seconds
  displayMode: 'summary' | 'detailed';
  showLifts: boolean;
  showTrails: boolean;
  showSnow: boolean;
  showWeather: boolean;
  lastUpdated?: number;
  cachedData?: any;
}

class MTNXMLWidgetRenderer implements WidgetRenderer {
  private refreshIntervals = new Map<string, number>();

  render(container: HTMLElement, widget: Widget): void {
    const content = widget.content as unknown as MTNXMLContent;
    
    container.style.cssText = `
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--surface);
      border-radius: 8px;
      overflow: hidden;
    `;

    if (!content.feedUrl) {
      this.renderConfigScreen(container, widget);
      return;
    }

    this.renderData(container, widget);
    this.setupAutoRefresh(widget);
  }

  private renderConfigScreen(container: HTMLElement, widget: Widget): void {
    const content = widget.content as unknown as MTNXMLContent;
    
    const configDiv = document.createElement('div');
    configDiv.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 16px;
      padding: 20px;
    `;

    configDiv.innerHTML = `
      <div style="font-size: 48px;">⛷️</div>
      <div style="color: var(--text); font-size: 18px; font-weight: bold; text-align: center;">
        Mountain XML Feed
      </div>
      <div style="color: var(--muted); font-size: 14px; text-align: center; max-width: 300px;">
        Display ski resort conditions, lifts, trails, and weather from MTNXML feeds
      </div>
      <input
        type="text"
        id="feed-url"
        placeholder="https://example.com/mtn-xml/"
        value="${content.feedUrl || ''}"
        style="
          width: 100%;
          max-width: 400px;
          padding: 12px;
          border: 2px solid var(--border);
          border-radius: 6px;
          background: var(--background);
          color: var(--text);
          font-size: 14px;
        "
      >
      <button
        id="load-feed"
        style="
          padding: 12px 24px;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
        "
      >
        Load Feed
      </button>
      <div style="color: var(--muted); font-size: 12px; text-align: center;">
        Example: https://banffnorquay.com/mtn-xml/
      </div>
    `;

    const input = configDiv.querySelector('#feed-url') as HTMLInputElement;
    const button = configDiv.querySelector('#load-feed') as HTMLButtonElement;

    const loadFeed = () => {
      const url = input.value.trim();
      if (url) {
        content.feedUrl = url;
        content.refreshInterval = content.refreshInterval || 300; // 5 minutes default
        content.displayMode = content.displayMode || 'summary';
        content.showLifts = content.showLifts !== false;
        content.showTrails = content.showTrails !== false;
        content.showSnow = content.showSnow !== false;
        content.showWeather = content.showWeather !== false;
        
        const event = new CustomEvent('widget-update', {
          detail: { id: widget.id, content }
        });
        document.dispatchEvent(event);
      }
    };

    button.addEventListener('click', loadFeed);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') loadFeed();
    });

    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    button.addEventListener('pointerdown', (e) => e.stopPropagation());

    container.appendChild(configDiv);
  }

  private async renderData(container: HTMLElement, widget: Widget): Promise<void> {
    const content = widget.content as unknown as MTNXMLContent;
    
    container.innerHTML = '';

    // Header with settings button
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 12px 16px;
      background: var(--accent);
      color: white;
      font-weight: bold;
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    `;

    const headerLeft = document.createElement('div');
    headerLeft.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    headerLeft.innerHTML = `
      <span>⛷️</span>
      <span>Mountain Conditions</span>
    `;

    const settingsBtn = document.createElement('button');
    settingsBtn.innerHTML = '⚙️';
    settingsBtn.title = 'Settings';
    settingsBtn.style.cssText = `
      background: rgba(255, 255, 255, 0.3);
      border: none;
      border-radius: 4px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 18px;
      color: white;
      flex-shrink: 0;
    `;
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showSettings(container, widget);
    });
    settingsBtn.addEventListener('pointerdown', (e) => e.stopPropagation());

    header.appendChild(headerLeft);
    header.appendChild(settingsBtn);
    container.appendChild(header);

    // Content area
    const contentArea = document.createElement('div');
    contentArea.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    `;

    // Loading indicator
    contentArea.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--muted);">
        <div>Loading data...</div>
      </div>
    `;

    container.appendChild(contentArea);

    try {
      const data = await this.fetchFeed(content.feedUrl);
      content.cachedData = data;
      content.lastUpdated = Date.now();
      
      // Render the mountain data
      this.renderMountainData(contentArea, data, content);
      
      // Note: We don't dispatch widget-update here as it causes a re-render loop
      // The content is already updated by reference, and will be saved by the dashboard
      
    } catch (error) {
      console.error('Widget render error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      contentArea.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #f44336;">
          <div style="font-size: 32px; margin-bottom: 12px;">⚠️</div>
          <div style="font-weight: bold; margin-bottom: 8px;">Failed to load feed</div>
          <div style="font-size: 12px; opacity: 0.8; margin-bottom: 12px;">${errorMessage}</div>
          <div style="font-size: 11px; opacity: 0.6; color: var(--muted); margin-bottom: 16px;">
            Check browser console (F12) for details
          </div>
          <button
            id="retry-btn"
            style="
              padding: 8px 16px;
              background: var(--accent);
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
            "
          >
            Retry
          </button>
        </div>
      `;
      
      const retryBtn = contentArea.querySelector('#retry-btn') as HTMLButtonElement;
      retryBtn.addEventListener('click', () => {
        this.renderData(container, widget);
      });
    }
  }

  private async fetchFeed(url: string): Promise<any> {
    let response: Response | undefined;
    
    try {
      // Try direct fetch first (silently, CORS errors are expected)
      response = await fetch(url, {
        mode: 'cors',
        cache: 'no-cache'
      });
    } catch (directError) {
      // Direct fetch failed (likely CORS), try local proxy
      try {
        const proxyUrl = `http://internal.norquay.local:3001/proxy?url=${encodeURIComponent(url)}`;
        response = await fetch(proxyUrl);
      } catch (proxyError) {
        console.error('Failed to fetch feed:', proxyError);
        throw new Error('Failed to fetch feed. Check console for details.');
      }
    }
    
    if (!response) {
      throw new Error('No response received from server');
    }
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const xmlText = await response.text();
    
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

    // Check for XML parsing errors
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      console.error('XML Parse Error:', parserError.textContent);
      throw new Error('Invalid XML format');
    }

    return this.parseXML(xmlDoc);
  }

  private parseXML(xmlDoc: Document): any {
    const data: any = {
      resort: {},
      lifts: [],
      trails: [],
      snowReport: {},
      weather: {}
    };

    // Parse report info (Banff Norquay format)
    const report = xmlDoc.querySelector('report');
    if (report) {
      data.resort.name = report.getAttribute('name') || 'Unknown Resort';
      data.resort.updated = report.getAttribute('updated') || '';
      data.resort.units = report.getAttribute('units') || 'metric';
    }

    // Try standard MTNXML format first
    const resort = xmlDoc.querySelector('resort');
    if (resort) {
      data.resort.name = resort.getAttribute('name') || data.resort.name;
      data.resort.url = resort.getAttribute('url') || '';
    }

    // Parse lifts (both formats)
    const lifts = xmlDoc.querySelectorAll('lift, liftStatus');
    lifts.forEach(lift => {
      data.lifts.push({
        name: lift.getAttribute('name') || lift.getAttribute('liftName') || '',
        status: lift.getAttribute('status') || lift.getAttribute('liftStatus') || 'unknown',
        type: lift.getAttribute('type') || ''
      });
    });

    // Parse trails (both formats)
    const trails = xmlDoc.querySelectorAll('trail, trailStatus');
    trails.forEach(trail => {
      data.trails.push({
        name: trail.getAttribute('name') || trail.getAttribute('trailName') || '',
        status: trail.getAttribute('status') || trail.getAttribute('trailStatus') || 'unknown',
        difficulty: trail.getAttribute('difficulty') || '',
        groomed: trail.getAttribute('groomed') === 'true'
      });
    });

    // Parse Banff Norquay current conditions format
    const locations = xmlDoc.querySelectorAll('location');
    if (locations.length > 0) {
      const location = locations[0]; // Use first location
      data.snowReport = {
        baseDepth: location.getAttribute('base') || '0',
        newSnow24: location.getAttribute('snow24Hours') || '0',
        newSnow48: location.getAttribute('snow48Hours') || '0',
        snowOverNight: location.getAttribute('snowOverNight') || '0',
        snow7Days: location.getAttribute('snow7Days') || '0',
        lastSnowfall: '',
        units: data.resort.units === 'metric' ? 'cm' : 'in'
      };
      
      data.weather = {
        condition: location.getAttribute('weatherConditions') || '',
        temperature: location.getAttribute('temperature') || '',
        windSpeed: '',
        windDirection: ''
      };
    }

    // Parse standard MTNXML snow report
    const snowReport = xmlDoc.querySelector('snowReport');
    if (snowReport) {
      data.snowReport = {
        baseDepth: snowReport.querySelector('baseDepth')?.textContent || data.snowReport.baseDepth || '0',
        newSnow24: snowReport.querySelector('newSnow[period="24"]')?.textContent || data.snowReport.newSnow24 || '0',
        newSnow48: snowReport.querySelector('newSnow[period="48"]')?.textContent || data.snowReport.newSnow48 || '0',
        lastSnowfall: snowReport.querySelector('lastSnowfall')?.textContent || '',
        units: snowReport.getAttribute('units') || data.snowReport.units || 'in'
      };
    }

    // Parse standard MTNXML weather
    const weather = xmlDoc.querySelector('weather');
    if (weather) {
      data.weather = {
        condition: weather.querySelector('condition')?.textContent || data.weather.condition || '',
        temperature: weather.querySelector('temperature')?.textContent || data.weather.temperature || '',
        windSpeed: weather.querySelector('windSpeed')?.textContent || '',
        windDirection: weather.querySelector('windDirection')?.textContent || ''
      };
    }

    return data;
  }

  private renderMountainData(container: HTMLElement, data: any, content: MTNXMLContent): void {
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 16px;
    `;

    // Resort name
    const resortName = document.createElement('div');
    resortName.style.cssText = `
      font-size: 20px;
      font-weight: bold;
      color: var(--text);
      text-align: center;
      padding-bottom: 8px;
      border-bottom: 2px solid var(--border);
    `;
    resortName.textContent = data.resort.name || 'Unknown Resort';
    wrapper.appendChild(resortName);

    // Snow conditions
    if (content.showSnow && data.snowReport) {
      const snowSection = this.createSection('🌨️ Snow Report', [
        { label: 'Base Depth', value: `${data.snowReport.baseDepth} ${data.snowReport.units}` },
        { label: 'New Snow (24h)', value: `${data.snowReport.newSnow24} ${data.snowReport.units}` },
        { label: 'New Snow (48h)', value: `${data.snowReport.newSnow48} ${data.snowReport.units}` },
        { label: 'Last Snowfall', value: data.snowReport.lastSnowfall || 'N/A' }
      ]);
      wrapper.appendChild(snowSection);
    }

    // Weather
    if (content.showWeather && data.weather && data.weather.temperature) {
      const weatherSection = this.createSection('🌤️ Current Weather', [
        { label: 'Condition', value: data.weather.condition || 'N/A' },
        { label: 'Temperature', value: `${data.weather.temperature}°` },
        { label: 'Wind', value: `${data.weather.windSpeed} ${data.weather.windDirection}` }
      ]);
      wrapper.appendChild(weatherSection);
    }

    // Lifts
    if (content.showLifts && data.lifts.length > 0) {
      const openLifts = data.lifts.filter((l: any) => l.status === 'open').length;
      const liftsSection = this.createStatusSection(
        '🚡 Lifts',
        data.lifts,
        openLifts,
        data.lifts.length
      );
      wrapper.appendChild(liftsSection);
    }

    // Trails
    if (content.showTrails && data.trails.length > 0) {
      const openTrails = data.trails.filter((t: any) => t.status === 'open').length;
      const trailsSection = this.createStatusSection(
        '⛷️ Trails',
        data.trails,
        openTrails,
        data.trails.length
      );
      wrapper.appendChild(trailsSection);
    }

    // Last updated
    if (content.lastUpdated) {
      const lastUpdate = document.createElement('div');
      lastUpdate.style.cssText = `
        text-align: center;
        font-size: 11px;
        color: var(--muted);
        margin-top: 8px;
      `;
      lastUpdate.textContent = `Updated: ${new Date(content.lastUpdated).toLocaleTimeString()}`;
      wrapper.appendChild(lastUpdate);
    }

    container.appendChild(wrapper);
  }

  private createSection(title: string, items: Array<{ label: string; value: string }>): HTMLElement {
    const section = document.createElement('div');
    section.style.cssText = `
      background: var(--surface-hover);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 12px;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      font-weight: bold;
      font-size: 14px;
      color: var(--text);
      margin-bottom: 8px;
    `;
    header.textContent = title;
    section.appendChild(header);

    items.forEach(item => {
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex;
        justify-content: space-between;
        padding: 4px 0;
        font-size: 13px;
        color: var(--text);
      `;
      row.innerHTML = `
        <span style="opacity: 0.7;">${item.label}:</span>
        <span style="font-weight: 500;">${item.value}</span>
      `;
      section.appendChild(row);
    });

    return section;
  }

  /**
   * Creates a scrollable section for displaying lifts or trails status
   * Shows all items with a scrollable container (max 250px height)
   * 
   * @param title - Section title (e.g., "🚡 Lifts" or "⛷️ Trails")
   * @param items - Array of lift/trail objects with name, status, and optional difficulty
   * @param openCount - Number of items with 'open' status
   * @param totalCount - Total number of items
   * @returns HTMLElement containing the formatted status section
   */
  private createStatusSection(title: string, items: any[], openCount: number, totalCount: number): HTMLElement {
    const section = document.createElement('div');
    section.style.cssText = `
      background: var(--surface-hover);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 12px;
    `;

    // Header showing title and open/total count
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: bold;
      font-size: 14px;
      color: var(--text);
      margin-bottom: 8px;
    `;
    header.innerHTML = `
      <span>${title}</span>
      <span style="color: ${openCount > 0 ? '#4CAF50' : '#f44336'};">${openCount}/${totalCount}</span>
    `;
    section.appendChild(header);

    // Scrollable container for all items (no limit, shows all lifts/trails)
    const itemsContainer = document.createElement('div');
    itemsContainer.style.cssText = `
      max-height: 250px;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: var(--accent) var(--surface);
    `;

    // Render all items with status indicator and difficulty (if available)
    items.forEach(item => {
      const status = item.status === 'open' ? '✅' : '❌';
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 0;
        font-size: 12px;
        color: var(--text);
      `;
      row.innerHTML = `
        <span>${status}</span>
        <span style="flex: 1;">${item.name}</span>
        ${item.difficulty ? `<span style="opacity: 0.6;">${item.difficulty}</span>` : ''}
      `;
      itemsContainer.appendChild(row);
    });

    section.appendChild(itemsContainer);

    return section;
  }

  private setupAutoRefresh(widget: Widget): void {
    const content = widget.content as unknown as MTNXMLContent;
    
    // Clear existing interval
    const existingInterval = this.refreshIntervals.get(widget.id);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    // Set up new interval if refresh is enabled
    if (content.refreshInterval > 0) {
      const intervalId = window.setInterval(() => {
        const container = document.querySelector(`#widget-${widget.id} .widget-content`) as HTMLElement;
        if (container) {
          this.renderData(container, widget);
        }
      }, content.refreshInterval * 1000);

      this.refreshIntervals.set(widget.id, intervalId);
    }
  }

  private showSettings(container: HTMLElement, widget: Widget): void {
    const content = widget.content as unknown as MTNXMLContent;

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
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      max-width: 500px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      color: var(--text);
    `;

    modal.innerHTML = `
      <h3 style="margin: 0 0 20px 0;">Mountain XML Settings</h3>
      
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500;">
          Feed URL
        </label>
        <input
          type="text"
          id="settings-url"
          value="${content.feedUrl}"
          style="
            width: 100%;
            padding: 10px;
            box-sizing: border-box;
            border: 1px solid var(--border);
            border-radius: 6px;
            background: var(--background);
            color: var(--text);
            font-size: 14px;
          "
        >
      </div>

      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500;">
          Refresh Interval (seconds)
        </label>
        <input
          type="number"
          id="settings-refresh"
          value="${content.refreshInterval || 300}"
          min="0"
          step="60"
          style="
            width: 100%;
            padding: 10px;
            box-sizing: border-box;
            border: 1px solid var(--border);
            border-radius: 6px;
            background: var(--background);
            color: var(--text);
            font-size: 14px;
          "
        >
        <small style="opacity: 0.7; font-size: 12px;">Set to 0 to disable auto-refresh</small>
      </div>

      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 10px; font-size: 14px; font-weight: 500;">
          Display Options
        </label>
        <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer;">
          <input type="checkbox" id="settings-snow" ${content.showSnow !== false ? 'checked' : ''}>
          <span>Show Snow Report</span>
        </label>
        <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer;">
          <input type="checkbox" id="settings-weather" ${content.showWeather !== false ? 'checked' : ''}>
          <span>Show Weather</span>
        </label>
        <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer;">
          <input type="checkbox" id="settings-lifts" ${content.showLifts !== false ? 'checked' : ''}>
          <span>Show Lifts</span>
        </label>
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
          <input type="checkbox" id="settings-trails" ${content.showTrails !== false ? 'checked' : ''}>
          <span>Show Trails</span>
        </label>
      </div>

      <div style="display: flex; gap: 12px; margin-top: 24px;">
        <button
          id="settings-save"
          style="
            flex: 1;
            padding: 12px;
            background: var(--accent);
            border: none;
            border-radius: 6px;
            color: white;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
          "
        >
          Save & Reload
        </button>
        <button
          id="settings-close"
          style="
            flex: 1;
            padding: 12px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid var(--border);
            border-radius: 6px;
            color: var(--text);
            cursor: pointer;
            font-size: 14px;
          "
        >
          Cancel
        </button>
      </div>
    `;

    const saveBtn = modal.querySelector('#settings-save') as HTMLButtonElement;
    const closeBtn = modal.querySelector('#settings-close') as HTMLButtonElement;
    const urlInput = modal.querySelector('#settings-url') as HTMLInputElement;
    const refreshInput = modal.querySelector('#settings-refresh') as HTMLInputElement;
    const snowCheck = modal.querySelector('#settings-snow') as HTMLInputElement;
    const weatherCheck = modal.querySelector('#settings-weather') as HTMLInputElement;
    const liftsCheck = modal.querySelector('#settings-lifts') as HTMLInputElement;
    const trailsCheck = modal.querySelector('#settings-trails') as HTMLInputElement;

    saveBtn.addEventListener('click', () => {
      content.feedUrl = urlInput.value.trim();
      content.refreshInterval = parseInt(refreshInput.value) || 300;
      content.showSnow = snowCheck.checked;
      content.showWeather = weatherCheck.checked;
      content.showLifts = liftsCheck.checked;
      content.showTrails = trailsCheck.checked;

      const event = new CustomEvent('widget-update', {
        detail: { id: widget.id, content }
      });
      document.dispatchEvent(event);

      overlay.remove();
      // Reload the widget
      this.renderData(container, widget);
    });

    closeBtn.addEventListener('click', () => {
      overlay.remove();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }
}

export const widget = {
  type: 'mtnxml',
  name: 'Mountain XML',
  icon: '⛷️',
  description: 'Display ski resort conditions from MTNXML feeds',
  renderer: new MTNXMLWidgetRenderer(),
  defaultSize: { w: 350, h: 500 },
  defaultContent: {
    feedUrl: '',
    refreshInterval: 300,
    displayMode: 'summary',
    showLifts: true,
    showTrails: true,
    showSnow: true,
    showWeather: true
  }
};
