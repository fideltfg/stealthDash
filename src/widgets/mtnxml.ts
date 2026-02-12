import type { Widget, WidgetContent } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';

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

  configure(widget: Widget): void {
    const container = document.getElementById(`widget-${widget.id}`)?.querySelector('.widget-content') as HTMLElement;
    if (container) {
      this.showSettings(container, widget);
    }
  }

  render(container: HTMLElement, widget: Widget): void {
    const content = widget.content as unknown as MTNXMLContent;

    container.className = 'widget-content';

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
    configDiv.className = 'mtnxml-config';

    configDiv.innerHTML = `
      <div class="widget-config-icon">⛷️</div>
      <div class="mtnxml-config-title">
        Mountain XML Feed
      </div>
      <div class="mtnxml-config-description">
        Display ski resort conditions, lifts, trails, and weather from MTNXML feeds
      </div>
      <input
        type="text"
        id="feed-url"
        placeholder="https://example.com/mtn-xml/"
        value="${content.feedUrl || ''}"
        class="mtnxml-config-input"
      >
      <button
        id="load-feed"
        class="mtnxml-config-button"
      >
        Load Feed
      </button>
      <div class="mtnxml-config-hint">
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

    // Content area
    const contentArea = document.createElement('div');
    contentArea.className = 'mtnxml-content';

    // Loading indicator
    contentArea.innerHTML = `
      <div class="widget-loading padded centered">
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
        <div class="widget-error simple">
          <div class="widget-error-icon">⚠️</div>
          <div class="widget-error-title">Failed to load feed</div>
          <div class="widget-error-detail">${errorMessage}</div>
          <div class="widget-error-hint">
            Check browser console (F12) for details
          </div>
          <button id="retry-btn" class="mtnxml-retry-button">
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
    // Use proxy by default to avoid CORS errors in console
    const proxyUrl = `http://internal.norquay.local:3001/proxy?url=${encodeURIComponent(url)}`;

    const response = await fetch(proxyUrl);

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
    wrapper.className = 'card-list';

    // Resort name
    const resortName = document.createElement('h4');
    resortName.className = 'mtnxml-resort-name';
    resortName.textContent = data.resort.name || 'Unknown Resort';
    wrapper.appendChild(resortName);
    // Last updated
    if (content.lastUpdated) {
      const lastUpdate = document.createElement('subtitle');
      lastUpdate.textContent = `Updated: ${new Date(content.lastUpdated).toLocaleTimeString()}`;
      wrapper.appendChild(lastUpdate);
    }
    // Snow conditions
    if (content.showSnow && data.snowReport) {
      const snowSection = this.createSection('Snow Report', [
        { label: 'Base Depth', value: `${data.snowReport.baseDepth} ${data.snowReport.units}` },
        { label: 'New Snow (24h)', value: `${data.snowReport.newSnow24} ${data.snowReport.units}` },
        { label: 'New Snow (48h)', value: `${data.snowReport.newSnow48} ${data.snowReport.units}` },
        { label: 'Last Snowfall', value: data.snowReport.lastSnowfall || 'N/A' }
      ]);
      wrapper.appendChild(snowSection);
    }

    // Weather
    if (content.showWeather && data.weather && data.weather.temperature) {
      const weatherSection = this.createSection('Weather', [
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
        'Lifts',
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
        'Trails',
        data.trails,
        openTrails,
        data.trails.length
      );
      wrapper.appendChild(trailsSection);
    }



    container.appendChild(wrapper);
  }

  private createSection(title: string, items: Array<{ label: string; value: string }>): HTMLElement {
    const section = document.createElement('div');
    section.className = 'card';
    const header = document.createElement('div');
    header.className = 'card-header';
    header.textContent = title;
    section.appendChild(header);

    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'card-row';
      row.innerHTML = `
        <span class="card-row-label">${item.label}:</span>
        <span class="card-row-value">${item.value}</span>
      `;
      section.appendChild(row);
    });

    return section;
  }

  /**
   * Creates a scrollable section for displaying lifts or trails status
   * Shows all items with a scrollable container (max 250px height)
   * 
   * @param title - Section title 
   * @param items - Array of lift/trail objects with name, status, and optional difficulty
   * @param openCount - Number of items with 'open' status
   * @param totalCount - Total number of items
   * @returns HTMLElement containing the formatted status section
   */
  private createStatusSection(title: string, items: any[], openCount: number, totalCount: number): HTMLElement {
    const section = document.createElement('div');
    section.className = 'card';

    section.style.marginTop = '6px';

    // Header showing title and open/total count
    const header = document.createElement('div');
    header.className = 'card-header';
    const statusClass = openCount > 0 ? 'success' : 'error';
    header.innerHTML = `
      <span>${title}</span>
      <span class="badge badge-${statusClass}">${openCount}/${totalCount}</span>
    `;
    section.appendChild(header);

    // Scrollable container for all items (no limit, shows all lifts/trails)
    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'card-items';

    // Render all items with status indicator and difficulty (if available)
    items.forEach(item => {
      const statusIcon = item.status === 'open' ? 'fas fa-check-circle success' : 'fas fa-times-circle error';
      const row = document.createElement('div');
      row.className = 'card-item';

     

      row.innerHTML = `
        <i class="${statusIcon}"></i>`;
       var badgeClass = '';
 switch (item.difficulty) {
        case 'beginner':
           badgeClass= ('badge badge-success');
          break;
        case 'intermediate':
          badgeClass= ('badge badge-info');
          break;
        case 'advanced':
          badgeClass= ('badge badge-secondary');
          break;
      }

      row.innerHTML += `
        <span class="card-item-name">${item.name}</span>
        ${item.difficulty ? `<span class="${badgeClass}">${item.difficulty}</span>` : ''}
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
    overlay.className = 'widget-overlay dark';

    const modal = document.createElement('div');
    modal.className = 'widget-dialog extended';

    modal.innerHTML = `
      <h3>Mountain XML Settings</h3>
      
      <div class="widget-dialog-field">
        <label class="widget-dialog-label medium">
          Feed URL
        </label>
        <input
          type="text"
          id="settings-url"
          value="${content.feedUrl}"
          class="widget-dialog-input extended"
        >
      </div>

      <div class="widget-dialog-field">
        <label class="widget-dialog-label medium">
          Refresh Interval (seconds)
        </label>
        <input
          type="number"
          id="settings-refresh"
          value="${content.refreshInterval || 300}"
          min="0"
          step="60"
          class="widget-dialog-input extended"
        >
        <small class="mtnxml-settings-hint">Set to 0 to disable auto-refresh</small>
      </div>

      <div class="widget-dialog-field">
        <label class="widget-dialog-label medium">
          Display Options
        </label>
        <div class="mtnxml-settings-checkboxes">
          <label class="mtnxml-settings-checkbox-label">
            <input type="checkbox" id="settings-snow" ${content.showSnow !== false ? 'checked' : ''}>
            <span>Show Snow Report</span>
          </label>
          <label class="mtnxml-settings-checkbox-label">
            <input type="checkbox" id="settings-weather" ${content.showWeather !== false ? 'checked' : ''}>
            <span>Show Weather</span>
          </label>
          <label class="mtnxml-settings-checkbox-label">
            <input type="checkbox" id="settings-lifts" ${content.showLifts !== false ? 'checked' : ''}>
            <span>Show Lifts</span>
          </label>
          <label class="mtnxml-settings-checkbox-label">
            <input type="checkbox" id="settings-trails" ${content.showTrails !== false ? 'checked' : ''}>
            <span>Show Trails</span>
          </label>
        </div>
      </div>

      <div class="widget-dialog-buttons top-margin">
        <div
          id="settings-save"
          class="btn btn-small btn-primary"
        >Save</div>
        <div
          id="settings-close"
          class="btn btn-small btn-secondary"
        >
          Cancel
        </div>
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
  icon: '<i class="fas fa-skiing"></i>',
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
