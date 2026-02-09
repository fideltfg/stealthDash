import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';

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

  configure(widget: Widget): void {
    const container = document.getElementById(`widget-${widget.id}`)?.querySelector('.widget-content') as HTMLElement;
    if (container) {
      this.showSettings(container, widget);
    }
  }

  render(container: HTMLElement, widget: Widget): void {
    const content = widget.content as unknown as EnvCanadaContent;
    
    container.className = 'envcanada-container';

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
    configDiv.className = 'envcanada-config';

    configDiv.innerHTML = `
      <div class="display-1 text-center mb-3">🍁</div>
      <div class="h4 text-center mb-2">
        Environment Canada Weather
      </div>
      <div class="text-center text-muted mb-4">
        Enter latitude and longitude coordinates to display weather forecasts
      </div>
      
      <div class="mb-3">
        <label class="form-label">
          Latitude
        </label>
        <input
          type="text"
          id="latitude"
          placeholder="51.179"
          value="${content.latitude || ''}"
          class="form-control"
        >
      </div>
      
      <div class="mb-3">
        <label class="form-label">
          Longitude
        </label>
        <input
          type="text"
          id="longitude"
          placeholder="-115.569"
          value="${content.longitude || ''}"
          class="form-control"
        >
      </div>
      
      <div class="mb-3">
        <label class="form-label">
          Language
        </label>
        <select
          id="language"
          class="form-select"
        >
          <option value="e" ${content.language === 'e' ? 'selected' : ''}>English</option>
          <option value="f" ${content.language === 'f' ? 'selected' : ''}>Français</option>
        </select>
      </div>
      
      <button
        id="load-forecast"
        class="btn btn-primary w-100 mb-3"
      >
        Load Forecast
      </button>
      
      <div class="text-muted small text-center">
        Example: Banff, AB = 51.179, -115.569<br>
        Find coordinates at <a href="https://weather.gc.ca" target="_blank">weather.gc.ca</a>
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

 

    // Content area
    const contentArea = document.createElement('div');
    contentArea.className = 'envcanada-content';

    // Loading indicator
    contentArea.innerHTML = `
      <div class="widget-loading padded centered">
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
        <div class="widget-error simple">
          <div class="widget-error-icon">⚠️</div>
          <div class="widget-error-title">Failed to load forecast</div>
          <div class="widget-error-detail">${errorMessage}</div>
          <div class="widget-error-hint">
            Check coordinates and try again
          </div>
          <button id="retry-btn" class="envcanada-retry-button">
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
   * Parses Environment Canada RSS/Atom feed XML
   */
  private parseRSS(xmlDoc: Document): any {
    const data: any = {
      location: '',
      title: '',
      updated: '',
      entries: []
    };

    // Check if it's an Atom feed (Environment Canada uses Atom format)
    const feed = xmlDoc.querySelector('feed');
    if (feed) {
      // Atom feed format
      data.title = feed.querySelector('title')?.textContent || '';
      data.location = data.title.replace(' - Weather - Environment Canada', '');
      
      const updated = feed.querySelector('updated')?.textContent;
      if (updated) {
        data.updated = new Date(updated).toLocaleString();
      }
      
      // Parse Atom entries
      const entries = xmlDoc.querySelectorAll('entry');
      
      entries.forEach(entry => {
        const title = entry.querySelector('title')?.textContent || '';
        const summary = entry.querySelector('summary')?.textContent || '';
        
        // Extract temperature if present
        const tempMatch = summary.match(/(-?\d+)°C/);
        const temperature = tempMatch ? tempMatch[1] : null;
        
        data.entries.push({
          title,
          summary: summary.replace(/<[^>]*>/g, ''), // Strip HTML tags
          temperature
        });
      });
    } else {
      // RSS feed format
      const channel = xmlDoc.querySelector('channel');
      if (channel) {
        data.title = channel.querySelector('title')?.textContent || '';
        data.location = data.title.replace('Weather - ', '').replace(' - ', ', ');
        
        const pubDate = channel.querySelector('pubDate')?.textContent;
        if (pubDate) {
          data.updated = new Date(pubDate).toLocaleString();
        }
      }

      // Parse RSS items
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
    }

    return data;
  }

  /**
   * Renders the parsed forecast data with card-based design
   */
  private renderForecastData(container: HTMLElement, data: any, content: EnvCanadaContent): void {
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'envcanada-wrapper';

    // Location header with icon
    const locationDiv = document.createElement('div');
    locationDiv.className = 'envcanada-location';
    locationDiv.innerHTML = `
      <span class="envcanada-location-icon">📍</span>
      <span>${data.location || 'Weather Forecast'}</span>
    `;
    wrapper.appendChild(locationDiv);

    // Forecast entries with improved visual design
    data.entries.forEach((entry: any) => {
      const entryDiv = document.createElement('div');
      entryDiv.className = 'envcanada-entry';

      // Title row with temperature
      const titleDiv = document.createElement('div');
      titleDiv.className = 'envcanada-entry-title';
      
      const titleText = document.createElement('span');
      titleText.className = 'envcanada-entry-title-text';
      
      // Add weather icon based on title
      const weatherIcon = this.getWeatherIcon(entry.title);
      titleText.innerHTML = `
        <span class="envcanada-entry-icon">${weatherIcon}</span>
        <span>${entry.title}</span>
      `;
      titleDiv.appendChild(titleText);
      
      if (entry.temperature) {
        const tempSpan = document.createElement('span');
        tempSpan.className = 'envcanada-entry-temp';
        tempSpan.style.color = this.getTempColor(entry.temperature);
        tempSpan.innerHTML = `
          <span>${entry.temperature}</span>
          <span class="envcanada-entry-temp-unit">°C</span>
        `;
        titleDiv.appendChild(tempSpan);
      }
      
      entryDiv.appendChild(titleDiv);

      // Summary text with better formatting
      const summaryDiv = document.createElement('div');
      summaryDiv.className = 'envcanada-entry-summary';
      summaryDiv.textContent = entry.summary;
      entryDiv.appendChild(summaryDiv);

      wrapper.appendChild(entryDiv);
    });

    // Last updated with icon
    if (content.lastUpdated) {
      const lastUpdate = document.createElement('div');
      lastUpdate.className = 'envcanada-last-updated';
      lastUpdate.innerHTML = `
        <span>🕐</span>
        <span>Updated: ${new Date(content.lastUpdated).toLocaleTimeString()}</span>
      `;
      wrapper.appendChild(lastUpdate);
    }

    container.appendChild(wrapper);
  }

  /**
   * Get weather icon emoji based on forecast title
   */
  private getWeatherIcon(title: string): string {
    const t = title.toLowerCase();
    
    if (t.includes('sunny') || t.includes('clear')) return '<i class=\"fas fa-sun\"></i>';
    if (t.includes('cloudy') || t.includes('overcast')) return '<i class=\"fas fa-cloud\"></i>';
    if (t.includes('rain') || t.includes('shower')) return '<i class=\"fas fa-cloud-rain\"></i>';
    if (t.includes('snow') || t.includes('flurries')) return '<i class=\"fas fa-snowflake\"></i>';
    if (t.includes('storm') || t.includes('thunder')) return '<i class=\"fas fa-bolt\"></i>';
    if (t.includes('fog') || t.includes('mist')) return '<i class=\"fas fa-smog\"></i>';
    if (t.includes('wind')) return '<i class=\"fas fa-wind\"></i>';
    if (t.includes('mix') || t.includes('chance')) return '<i class=\"fas fa-cloud-sun-rain\"></i>';
    if (t.includes('night')) return '<i class=\"fas fa-moon\"></i>';
    
    return '<i class=\"fas fa-cloud-sun\"></i>'; // Default partly cloudy
  }

  /**
   * Get temperature color based on value
   */
  private getTempColor(temp: string): string {
    const tempNum = parseInt(temp);
    
    if (tempNum >= 30) return '#ff4444'; // Hot - red
    if (tempNum >= 20) return '#ff8800'; // Warm - orange
    if (tempNum >= 10) return '#ffaa00'; // Mild - yellow-orange
    if (tempNum >= 0) return '#00aaff'; // Cool - light blue
    if (tempNum >= -10) return '#0088ff'; // Cold - blue
    return '#4466ff'; // Very cold - deep blue
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
    overlay.className = 'widget-overlay dark';

    const modal = document.createElement('div');
    modal.className = 'widget-dialog extended';

    modal.innerHTML = `
      <h3>Weather Forecast Settings</h3>
      
      <div class="widget-dialog-field">
        <label class="widget-dialog-label medium">
          Latitude
        </label>
        <input
          type="text"
          id="settings-lat"
          value="${content.latitude}"
          class="widget-dialog-input extended"
        >
      </div>

      <div class="widget-dialog-field">
        <label class="widget-dialog-label medium">
          Longitude
        </label>
        <input
          type="text"
          id="settings-lon"
          value="${content.longitude}"
          class="widget-dialog-input extended"
        >
      </div>

      <div class="widget-dialog-field">
        <label class="widget-dialog-label medium">
          Language
        </label>
        <select
          id="settings-lang"
          class="widget-dialog-input extended"
        >
          <option value="e" ${content.language === 'e' ? 'selected' : ''}>English</option>
          <option value="f" ${content.language === 'f' ? 'selected' : ''}>Français</option>
        </select>
      </div>

      <div class="widget-dialog-field">
        <label class="widget-dialog-label medium">
          Refresh Interval (seconds)
        </label>
        <input
          type="number"
          id="settings-refresh"
          value="${content.refreshInterval || 1800}"
          min="0"
          step="300"
          class="widget-dialog-input extended"
        >
        <small class="envcanada-settings-hint">Set to 0 to disable auto-refresh</small>
      </div>

      <div class="widget-dialog-buttons top-margin">
        <button
          id="settings-save"
          class="widget-dialog-button-save extended full-width"
        >
          Save & Reload
        </button>
        <button
          id="settings-close"
          class="widget-dialog-button-cancel extended full-width"
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
  title: 'Environment Canada',
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
