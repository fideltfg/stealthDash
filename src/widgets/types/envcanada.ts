import type { Widget } from '../../types';
import type { WidgetRenderer } from './base';

export interface EnvCanadaContent {
  latitude: string;
  longitude: string;
  language: 'e' | 'f'; // English or French
  refreshInterval: number; // in seconds
  lastUpdated?: number;
  cachedData?: any;
}

/**
 * Environment Canada Weather Forecast Widget
 * Fetches and displays weather forecasts from Environment Canada RSS feeds
 * Feed format: https://weather.gc.ca/rss/weather/{lat}_{lon}_{lang}.xml
 */
class EnvCanadaWidgetRenderer implements WidgetRenderer {
  private refreshIntervals = new Map<string, number>();

  render(container: HTMLElement, widget: Widget): void {
    const content = widget.content as unknown as EnvCanadaContent;
    
    container.style.cssText = `
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--surface);
      border-radius: 8px;
      overflow: hidden;
    `;

    if (!content.latitude || !content.longitude) {
      this.renderConfigScreen(container, widget);
      return;
    }

    this.renderData(container, widget);
    this.setupAutoRefresh(widget);
  }

  /**
   * Renders the initial configuration screen for setting up coordinates
   */
  private renderConfigScreen(container: HTMLElement, widget: Widget): void {
    const content = widget.content as unknown as EnvCanadaContent;
    
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
      <div style="font-size: 48px;">🍁</div>
      <div style="color: var(--text); font-size: 18px; font-weight: bold; text-align: center;">
        Environment Canada Weather
      </div>
      <div style="color: var(--muted); font-size: 14px; text-align: center; max-width: 300px;">
        Enter latitude and longitude coordinates to display weather forecasts
      </div>
      
      <div style="width: 100%; max-width: 400px; display: flex; flex-direction: column; gap: 12px;">
        <div>
          <label style="display: block; margin-bottom: 6px; font-size: 12px; color: var(--muted);">
            Latitude
          </label>
          <input
            type="text"
            id="latitude"
            placeholder="51.179"
            value="${content.latitude || ''}"
            style="
              width: 100%;
              padding: 12px;
              box-sizing: border-box;
              border: 2px solid var(--border);
              border-radius: 6px;
              background: var(--background);
              color: var(--text);
              font-size: 14px;
            "
          >
        </div>
        
        <div>
          <label style="display: block; margin-bottom: 6px; font-size: 12px; color: var(--muted);">
            Longitude
          </label>
          <input
            type="text"
            id="longitude"
            placeholder="-115.569"
            value="${content.longitude || ''}"
            style="
              width: 100%;
              padding: 12px;
              box-sizing: border-box;
              border: 2px solid var(--border);
              border-radius: 6px;
              background: var(--background);
              color: var(--text);
              font-size: 14px;
            "
          >
        </div>
        
        <div>
          <label style="display: block; margin-bottom: 6px; font-size: 12px; color: var(--muted);">
            Language
          </label>
          <select
            id="language"
            style="
              width: 100%;
              padding: 12px;
              box-sizing: border-box;
              border: 2px solid var(--border);
              border-radius: 6px;
              background: var(--background);
              color: var(--text);
              font-size: 14px;
            "
          >
            <option value="e" ${content.language === 'e' ? 'selected' : ''}>English</option>
            <option value="f" ${content.language === 'f' ? 'selected' : ''}>Français</option>
          </select>
        </div>
      </div>
      
      <button
        id="load-forecast"
        style="
          padding: 12px 24px;
          background: var(--accent);
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
        "
      >
        Load Forecast
      </button>
      
      <div style="color: var(--muted); font-size: 11px; text-align: center; max-width: 350px;">
        Example: Banff, AB = 51.179, -115.569<br>
        Find coordinates at <a href="https://weather.gc.ca" target="_blank" style="color: var(--accent);">weather.gc.ca</a>
      </div>
    `;

    const latInput = configDiv.querySelector('#latitude') as HTMLInputElement;
    const lonInput = configDiv.querySelector('#longitude') as HTMLInputElement;
    const langSelect = configDiv.querySelector('#language') as HTMLSelectElement;
    const button = configDiv.querySelector('#load-forecast') as HTMLButtonElement;

    const loadForecast = () => {
      const lat = latInput.value.trim();
      const lon = lonInput.value.trim();
      
      if (lat && lon) {
        content.latitude = lat;
        content.longitude = lon;
        content.language = langSelect.value as 'e' | 'f';
        content.refreshInterval = content.refreshInterval || 1800; // 30 minutes default
        
        const event = new CustomEvent('widget-update', {
          detail: { id: widget.id, content }
        });
        document.dispatchEvent(event);
      }
    };

    button.addEventListener('click', loadForecast);
    latInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') lonInput.focus();
    });
    lonInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') loadForecast();
    });

    latInput.addEventListener('pointerdown', (e) => e.stopPropagation());
    lonInput.addEventListener('pointerdown', (e) => e.stopPropagation());
    langSelect.addEventListener('pointerdown', (e) => e.stopPropagation());
    button.addEventListener('pointerdown', (e) => e.stopPropagation());

    container.appendChild(configDiv);
  }

  /**
   * Renders the weather forecast data
   */
  private async renderData(container: HTMLElement, widget: Widget): Promise<void> {
    const content = widget.content as unknown as EnvCanadaContent;
    
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
      <span>🍁</span>
      <span>Weather Forecast</span>
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
        <div>Loading forecast...</div>
      </div>
    `;

    container.appendChild(contentArea);

    try {
      const data = await this.fetchForecast(content);
      content.cachedData = data;
      content.lastUpdated = Date.now();
      
      this.renderForecastData(contentArea, data, content);
      
    } catch (error) {
      console.error('Weather widget error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      contentArea.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #f44336;">
          <div style="font-size: 32px; margin-bottom: 12px;">⚠️</div>
          <div style="font-weight: bold; margin-bottom: 8px;">Failed to load forecast</div>
          <div style="font-size: 12px; opacity: 0.8; margin-bottom: 12px;">${errorMessage}</div>
          <div style="font-size: 11px; opacity: 0.6; color: var(--muted); margin-bottom: 16px;">
            Check coordinates and try again
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

  /**
   * Fetches weather forecast from Environment Canada RSS feed
   */
  private async fetchForecast(content: EnvCanadaContent): Promise<any> {
    const feedUrl = `https://weather.gc.ca/rss/weather/${content.latitude}_${content.longitude}_${content.language}.xml`;
    
    // Use proxy by default to avoid CORS errors in console
    const proxyUrl = `http://internal.norquay.local:3001/proxy?url=${encodeURIComponent(feedUrl)}`;
    const response = await fetch(proxyUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText || 'Failed to fetch'}`);
    }

    const xmlText = await response.text();
    
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      throw new Error('Invalid XML format');
    }

    return this.parseRSS(xmlDoc);
  }

  /**
   * Parses Environment Canada RSS feed XML
   */
  private parseRSS(xmlDoc: Document): any {
    const data: any = {
      location: '',
      title: '',
      updated: '',
      entries: []
    };

    // Parse channel info
    const channel = xmlDoc.querySelector('channel');
    if (channel) {
      data.title = channel.querySelector('title')?.textContent || '';
      data.location = data.title.replace('Weather - ', '').replace(' - ', ', ');
      
      const pubDate = channel.querySelector('pubDate')?.textContent;
      if (pubDate) {
        data.updated = new Date(pubDate).toLocaleString();
      }
    }

    // Parse forecast entries
    const entries = xmlDoc.querySelectorAll('item');
    entries.forEach(entry => {
      const title = entry.querySelector('title')?.textContent || '';
      const summary = entry.querySelector('summary')?.textContent || 
                     entry.querySelector('description')?.textContent || '';
      
      // Extract temperature if present
      const tempMatch = summary.match(/(-?\d+)°C/);
      const temperature = tempMatch ? tempMatch[1] : null;
      
      data.entries.push({
        title,
        summary: summary.replace(/<[^>]*>/g, ''), // Strip HTML tags
        temperature
      });
    });

    return data;
  }

  /**
   * Renders the parsed forecast data
   */
  private renderForecastData(container: HTMLElement, data: any, content: EnvCanadaContent): void {
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 16px;
    `;

    // Location
    const locationDiv = document.createElement('div');
    locationDiv.style.cssText = `
      font-size: 18px;
      font-weight: bold;
      color: var(--text);
      text-align: center;
      padding-bottom: 8px;
      border-bottom: 2px solid var(--border);
    `;
    locationDiv.textContent = data.location || 'Weather Forecast';
    wrapper.appendChild(locationDiv);

    // Forecast entries
    data.entries.forEach((entry: any) => {
      const entryDiv = document.createElement('div');
      entryDiv.style.cssText = `
        background: var(--surface-hover);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 12px;
      `;

      const titleDiv = document.createElement('div');
      titleDiv.style.cssText = `
        font-weight: bold;
        font-size: 14px;
        color: var(--text);
        margin-bottom: 8px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      `;
      
      const titleText = document.createElement('span');
      titleText.textContent = entry.title;
      titleDiv.appendChild(titleText);
      
      if (entry.temperature) {
        const tempSpan = document.createElement('span');
        tempSpan.style.cssText = `
          font-size: 16px;
          color: var(--accent);
        `;
        tempSpan.textContent = `${entry.temperature}°C`;
        titleDiv.appendChild(tempSpan);
      }
      
      entryDiv.appendChild(titleDiv);

      const summaryDiv = document.createElement('div');
      summaryDiv.style.cssText = `
        font-size: 13px;
        color: var(--text);
        opacity: 0.9;
        line-height: 1.5;
      `;
      summaryDiv.textContent = entry.summary;
      entryDiv.appendChild(summaryDiv);

      wrapper.appendChild(entryDiv);
    });

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

  /**
   * Sets up automatic refresh interval
   */
  private setupAutoRefresh(widget: Widget): void {
    const content = widget.content as unknown as EnvCanadaContent;
    
    const existingInterval = this.refreshIntervals.get(widget.id);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

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

  /**
   * Shows settings modal for changing coordinates and preferences
   */
  private showSettings(container: HTMLElement, widget: Widget): void {
    const content = widget.content as unknown as EnvCanadaContent;

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
      <h3 style="margin: 0 0 20px 0;">Weather Forecast Settings</h3>
      
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500;">
          Latitude
        </label>
        <input
          type="text"
          id="settings-lat"
          value="${content.latitude}"
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
          Longitude
        </label>
        <input
          type="text"
          id="settings-lon"
          value="${content.longitude}"
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
          Language
        </label>
        <select
          id="settings-lang"
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
          <option value="e" ${content.language === 'e' ? 'selected' : ''}>English</option>
          <option value="f" ${content.language === 'f' ? 'selected' : ''}>Français</option>
        </select>
      </div>

      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500;">
          Refresh Interval (seconds)
        </label>
        <input
          type="number"
          id="settings-refresh"
          value="${content.refreshInterval || 1800}"
          min="0"
          step="300"
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
    const latInput = modal.querySelector('#settings-lat') as HTMLInputElement;
    const lonInput = modal.querySelector('#settings-lon') as HTMLInputElement;
    const langSelect = modal.querySelector('#settings-lang') as HTMLSelectElement;
    const refreshInput = modal.querySelector('#settings-refresh') as HTMLInputElement;

    saveBtn.addEventListener('click', () => {
      content.latitude = latInput.value.trim();
      content.longitude = lonInput.value.trim();
      content.language = langSelect.value as 'e' | 'f';
      content.refreshInterval = parseInt(refreshInput.value) || 1800;

      const event = new CustomEvent('widget-update', {
        detail: { id: widget.id, content }
      });
      document.dispatchEvent(event);

      overlay.remove();
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
  type: 'envcanada',
  name: 'Environment Canada',
  icon: '🍁',
  description: 'Display weather forecasts from Environment Canada',
  renderer: new EnvCanadaWidgetRenderer(),
  defaultSize: { w: 350, h: 500 },
  defaultContent: {
    latitude: '',
    longitude: '',
    language: 'e',
    refreshInterval: 1800 // 30 minutes
  }
};
