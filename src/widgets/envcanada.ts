import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';
import { stopAllDragPropagation, dispatchWidgetUpdate } from '../utils/dom';
import { WidgetPoller } from '../utils/polling';
import { renderConfigPrompt, renderLoading, renderError } from '../utils/widgetRendering';

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
  private poller = new WidgetPoller();

  destroy(): void {
    this.poller.stopAll();
  }

  configure(widget: Widget): void {
    const container = document.getElementById(`widget-${widget.id}`)?.querySelector('.widget-content') as HTMLElement;
    if (container) {
      this.showSettings(container, widget);
    }
  }

  render(container: HTMLElement, widget: Widget): void {
    const content = widget.content as unknown as EnvCanadaContent;
    
    container.className = 'widget-content';

    // Stop any existing polling
    this.poller.stop(widget.id);

    if (!content.latitude || !content.longitude) {
      const btn = renderConfigPrompt(container, '🍁', 'Environment Canada Weather', 'Enter coordinates to display weather forecasts');
      btn.addEventListener('click', () => this.configure(widget));
      return;
    }

    // Start polling - calls renderData immediately, then on interval
    if (content.refreshInterval > 0) {
      this.poller.start(widget.id, () => this.renderData(container, widget), content.refreshInterval * 1000);
    } else {
      this.renderData(container, widget);
    }
  }

  /**
   * Renders the weather forecast data
   */
  private async renderData(container: HTMLElement, widget: Widget): Promise<void> {
    const content = widget.content as unknown as EnvCanadaContent;
    
    container.innerHTML = '';

    // Header with settings button
    const header = document.createElement('div');
    header.className = 'envcanada-header';

    const headerLeft = document.createElement('div');
    headerLeft.className = 'envcanada-header-left';
    headerLeft.innerHTML = `
      <span>🍁Weather Forecast</span>
    `;

    header.appendChild(headerLeft);
    container.appendChild(header);

    // Content area
    const contentArea = document.createElement('div');
    contentArea.className = 'envcanada-content';

    // Loading indicator
    renderLoading(contentArea, 'Loading forecast...');

    container.appendChild(contentArea);

    try {
      const data = await this.fetchForecast(content);
      content.cachedData = data;
      content.lastUpdated = Date.now();
      
      this.renderForecastData(contentArea, data, content);
      
    } catch (error) {
      console.error('Weather widget error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      renderError(contentArea, 'Failed to load forecast', errorMessage, 'Check coordinates and try again');
      
      const retryBtn = document.createElement('button');
      retryBtn.className = 'envcanada-retry-button';
      retryBtn.textContent = 'Retry';
      contentArea.querySelector('.widget-error')?.appendChild(retryBtn);
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
    wrapper.className = 'list';

      // Last updated with icon
    if (content.lastUpdated) {
      const lastUpdate = document.createElement('div');
      lastUpdate.className = 'envcanada-last-updated';
      lastUpdate.innerHTML = `
        <subtitle>Updated: ${new Date(content.lastUpdated).toLocaleTimeString()}</subtitle>
      `;
      wrapper.appendChild(lastUpdate);
    }

    // Location header with icon
    const locationDiv = document.createElement('div');
    locationDiv.className = 'card';
    locationDiv.innerHTML = `
      <span class="envcanada-location-icon">📍</span>
      <span>${data.location || 'Weather Forecast'}</span>
    `;
    wrapper.appendChild(locationDiv);

    // Forecast entries with improved visual design
    data.entries.forEach((entry: any) => {
      const entryDiv = document.createElement('div');
      entryDiv.className = 'card';

      // Title row with temperature
      const titleDiv = document.createElement('div');
      titleDiv.className = 'card-header';
      
      const titleText = document.createElement('span');
      titleText.className = 'card-title-text';
      
      // Add weather icon based on title
      const weatherIcon = this.getWeatherIcon(entry.title);
      titleText.innerHTML = `
        <span class="card-icon">${weatherIcon}</span>
        <span>${entry.title}</span>
      `;
      titleDiv.appendChild(titleText);
      
      if (entry.temperature) {
        const tempSpan = document.createElement('span');
        tempSpan.className = 'card-temp';
        tempSpan.style.color = this.getTempColor(entry.temperature);
        tempSpan.innerHTML = `
          <span>${entry.temperature}</span>
          <span class="card-temp-unit">°C</span>
        `;
        titleDiv.appendChild(tempSpan);
      }
      
      entryDiv.appendChild(titleDiv);

      // Summary text with better formatting
      const summaryDiv = document.createElement('div');
      summaryDiv.className = 'card-summary';
      summaryDiv.textContent = entry.summary;
      entryDiv.appendChild(summaryDiv);

      wrapper.appendChild(entryDiv);
    });

  

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
        <div
          id="settings-save"
          class="btn btn-small btn-primary"
        >Save</div>
        <button
          id="settings-close"
          class="btn btn-small btn-secondary"
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

    stopAllDragPropagation(modal);

    saveBtn.addEventListener('click', () => {
      content.latitude = latInput.value.trim();
      content.longitude = lonInput.value.trim();
      content.language = langSelect.value as 'e' | 'f';
      content.refreshInterval = parseInt(refreshInput.value) || 1800;

      dispatchWidgetUpdate(widget.id, content as Record<string, any>);

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
  icon: '<i class="fas fa-leaf"></i>',
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
