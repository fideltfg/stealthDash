import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';
import { stopWidgetDragPropagation, dispatchWidgetUpdate } from '../utils/dom';
import { renderLoading, renderError } from '../utils/widgetRendering';

interface WeatherDashContent {
  latitude: number;
  longitude: number;
  timezone: string;
  locationName: string;
}

// --- Helper functions ---

function getWeatherIcon(code: number): string {
  const icons: Record<number, string> = {
    0: '<i class="fas fa-sun"></i>', 1: '<i class="fas fa-cloud-sun"></i>', 2: '<i class="fas fa-cloud-sun"></i>', 3: '<i class="fas fa-cloud"></i>',
    45: '<i class="fas fa-smog"></i>', 48: '<i class="fas fa-smog"></i>',
    51: '<i class="fas fa-cloud-sun-rain"></i>', 53: '<i class="fas fa-cloud-sun-rain"></i>', 55: '<i class="fas fa-cloud-rain"></i>',
    61: '<i class="fas fa-cloud-rain"></i>', 63: '<i class="fas fa-cloud-rain"></i>', 65: '<i class="fas fa-cloud-showers-heavy"></i>',
    71: '<i class="fas fa-snowflake"></i>', 73: '<i class="fas fa-snowflake"></i>', 75: '<i class="fas fa-snowflake"></i>', 77: '<i class="fas fa-snowflake"></i>',
    80: '<i class="fas fa-cloud-sun-rain"></i>', 81: '<i class="fas fa-cloud-rain"></i>', 82: '<i class="fas fa-cloud-showers-heavy"></i>',
    85: '<i class="fas fa-snowflake"></i>', 86: '<i class="fas fa-snowflake"></i>',
    95: '<i class="fas fa-cloud-bolt"></i>', 96: '<i class="fas fa-cloud-bolt"></i>', 99: '<i class="fas fa-cloud-bolt"></i>'
  };
  return icons[code] || '<i class="fas fa-cloud-sun"></i>';
}

function getWeatherDescription(code: number): string {
  const descriptions: Record<number, string> = {
    0: 'Clear', 1: 'Mostly Clear', 2: 'Partly Cloudy', 3: 'Cloudy',
    45: 'Foggy', 48: 'Foggy',
    51: 'Light Drizzle', 53: 'Drizzle', 55: 'Heavy Drizzle',
    61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain',
    71: 'Light Snow', 73: 'Snow', 75: 'Heavy Snow', 77: 'Snow Grains',
    80: 'Light Showers', 81: 'Showers', 82: 'Heavy Showers',
    85: 'Light Snow Showers', 86: 'Snow Showers',
    95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm'
  };
  return descriptions[code] || 'Unknown';
}

function getWindDirection(degrees: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

function getWindArrow(degrees: number): string {
  // Use same 16-point compass as getWindDirection for consistency
  //              N    NNE   NE   ENE    E   ESE   SE   SSE    S   SSW   SW   WSW    W   WNW   NW   NNW
  const arrows = ['↓', '↙', '↙', '←', '←', '↖', '↖', '↑', '↑', '↗', '↗', '→', '→', '↘', '↘', '↓'];
  const index = Math.round(degrees / 22.5) % 16;
  return arrows[index];
}

export class WeatherDashWidgetRenderer implements WidgetRenderer {
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  destroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  configure(widget: Widget): void {
    const content = widget.content as WeatherDashContent;

    const overlay = document.createElement('div');
    overlay.className = 'widget-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'widget-dialog';

    dialog.innerHTML = `
      <h3 class="widget-dialog-title">Configure Weather Dashboard</h3>
      <div class="form-group">
        <label class="form-label">Location Name</label>
        <input type="text" id="wd-name" value="${content.locationName || ''}" placeholder="e.g., Mt. Norquay" class="form-input" />
      </div>
      <div class="form-group">
        <label class="form-label">Latitude</label>
        <input type="number" step="any" id="wd-lat" value="${content.latitude || ''}" placeholder="e.g., 51.1950" class="form-input" />
      </div>
      <div class="form-group">
        <label class="form-label">Longitude</label>
        <input type="number" step="any" id="wd-lon" value="${content.longitude || ''}" placeholder="e.g., -115.5177" class="form-input" />
      </div>
      <div class="form-group">
        <label class="form-label">Timezone</label>
        <input type="text" id="wd-tz" value="${content.timezone || 'America/Edmonton'}" placeholder="e.g., America/Edmonton" class="form-input" />
      </div>
      <div class="widget-dialog-buttons">
        <button id="cancel-btn" class="">Cancel</button>
        <button id="save-btn" class="">Save</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const saveBtn = dialog.querySelector('#save-btn') as HTMLButtonElement;
    const cancelBtn = dialog.querySelector('#cancel-btn') as HTMLButtonElement;
    const close = () => overlay.remove();

    cancelBtn.onclick = close;
    overlay.onclick = (e) => e.target === overlay && close();

    saveBtn.onclick = () => {
      const locationName = (dialog.querySelector('#wd-name') as HTMLInputElement).value.trim();
      const latitude = parseFloat((dialog.querySelector('#wd-lat') as HTMLInputElement).value);
      const longitude = parseFloat((dialog.querySelector('#wd-lon') as HTMLInputElement).value);
      const timezone = (dialog.querySelector('#wd-tz') as HTMLInputElement).value.trim() || 'America/Edmonton';

      if (locationName && !isNaN(latitude) && !isNaN(longitude)) {
        dispatchWidgetUpdate(widget.id, { locationName, latitude, longitude, timezone });
        close();
      }
    };
  }

  render(container: HTMLElement, widget: Widget): void {
    const content = widget.content as WeatherDashContent;
    const wrapper = document.createElement('div');
    wrapper.className = 'widget-wrapper';

    if (!content.latitude || !content.longitude || !content.locationName) {
      this.renderConfigScreen(wrapper, widget);
    } else {
      this.renderDashboard(wrapper, content);
    }

    container.appendChild(wrapper);
  }

  private renderConfigScreen(div: HTMLElement, widget: Widget): void {
    const inputContainer = document.createElement('div');
    inputContainer.className = 'widget-config-screen';

    const icon = document.createElement('div');
    icon.className = 'widget-config-icon';
    icon.innerHTML = '<i class="fas fa-mountain-sun"></i>';

    const label = document.createElement('div');
    label.className = 'widget-config-description';
    label.textContent = 'Configure weather dashboard location';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Location name (e.g., Mt. Norquay)';
    nameInput.className = 'form-input';

    const latInput = document.createElement('input');
    latInput.type = 'number';
    latInput.step = 'any';
    latInput.placeholder = 'Latitude (e.g., 51.1950)';
    latInput.className = 'form-input';

    const lonInput = document.createElement('input');
    lonInput.type = 'number';
    lonInput.step = 'any';
    lonInput.placeholder = 'Longitude (e.g., -115.5177)';
    lonInput.className = 'form-input';

    const tzInput = document.createElement('input');
    tzInput.type = 'text';
    tzInput.placeholder = 'Timezone (e.g., America/Edmonton)';
    tzInput.value = 'America/Edmonton';
    tzInput.className = 'form-input';

    const button = document.createElement('button');
    button.textContent = 'Load Forecast';
    button.className = 'btn btn-primary';
    button.disabled = true;

    const updateButtonState = () => {
      const name = nameInput.value.trim();
      const lat = parseFloat(latInput.value);
      const lon = parseFloat(lonInput.value);
      button.disabled = !name || isNaN(lat) || isNaN(lon);
    };

    const save = () => {
      const locationName = nameInput.value.trim();
      const latitude = parseFloat(latInput.value);
      const longitude = parseFloat(lonInput.value);
      const timezone = tzInput.value.trim() || 'America/Edmonton';
      if (locationName && !isNaN(latitude) && !isNaN(longitude)) {
        dispatchWidgetUpdate(widget.id, { locationName, latitude, longitude, timezone });
      }
    };

    [nameInput, latInput, lonInput, tzInput].forEach(input => {
      input.addEventListener('input', updateButtonState);
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !button.disabled) save();
      });
      stopWidgetDragPropagation(input);
    });
    button.addEventListener('click', save);
    stopWidgetDragPropagation(button);

    inputContainer.appendChild(icon);
    inputContainer.appendChild(label);
    inputContainer.appendChild(nameInput);
    inputContainer.appendChild(latInput);
    inputContainer.appendChild(lonInput);
    inputContainer.appendChild(tzInput);
    inputContainer.appendChild(button);
    div.appendChild(inputContainer);
  }

  private async renderDashboard(div: HTMLElement, content: WeatherDashContent): Promise<void> {
    renderLoading(div, 'Loading forecast...');

    try {
      const [hourlyData, dailyData] = await Promise.all([
        this.fetchHourly(content),
        this.fetchDaily(content)
      ]);

      div.innerHTML = '';
      div.className = 'card';

      // Header
      const header = document.createElement('div');
      header.className = 'card-header';

      const title = document.createElement('h2');
      title.className = 'header-title';
      title.innerHTML = `<i class="fas fa-person-skiing"></i> ${content.locationName} Forecast`;
      const subtitle = document.createElement('subtitle');
      subtitle.textContent = this.formatDateTime();
      header.appendChild(title);
      header.appendChild(subtitle);
      div.appendChild(header);

      // Scrollable body
      const body = document.createElement('div');
      body.className = 'card-body';

      // Hourly section
      const hourlySection = this.buildHourlySection(hourlyData);
      body.appendChild(hourlySection);

      // Daily section
      const dailySection = this.buildDailySection(dailyData);
      body.appendChild(dailySection);

      div.appendChild(body);

      // Auto-refresh every hour
      this.destroy();
      this.refreshInterval = setInterval(() => {
        this.renderDashboard(div, content);
      }, 3600000);

    } catch (error) {
      renderError(div, 'Failed to load forecast', error);
    }
  }

  private async fetchHourly(content: WeatherDashContent): Promise<any> {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${content.latitude}&longitude=${content.longitude}&hourly=temperature_2m,weather_code,precipitation_probability,wind_speed_10m,wind_direction_10m,relative_humidity_2m,snowfall&timezone=${encodeURIComponent(content.timezone)}&forecast_hours=24`
    );
    return response.json();
  }

  private async fetchDaily(content: WeatherDashContent): Promise<any> {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${content.latitude}&longitude=${content.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,relative_humidity_2m_max,wind_speed_10m_max,wind_direction_10m_dominant,snowfall_sum&timezone=${encodeURIComponent(content.timezone)}&forecast_days=7`
    );
    return response.json();
  }

  private buildHourlySection(data: any): HTMLElement {
    const section = document.createElement('div');
    section.className = 'mb-16';

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });

    // Section header
    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'flex space-between align-center mb-8';
    sectionHeader.innerHTML = `
      <span style="font-size:14px;font-weight:600;color:var(--text)"><i class="fas fa-clock"></i> 24-Hour Forecast — ${dateStr}</span>
    `;
    section.appendChild(sectionHeader);

    // Hourly grid — uses a scrollable row of stat-cards
    const scroll = document.createElement('div');
    scroll.style.cssText = 'display:grid;grid-template-columns:repeat(24,1fr);gap:4px;overflow-x:auto;';

    for (let i = 0; i < 24 && i < data.hourly.time.length; i++) {
      const time = new Date(data.hourly.time[i]);
      const isCurrent = i === 0;
      const timeStr = time.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
      const temp = Math.round(data.hourly.temperature_2m[i]);
      const code = data.hourly.weather_code[i];
      const icon = getWeatherIcon(code);
      const precip = data.hourly.precipitation_probability[i];
      const wind = Math.round(data.hourly.wind_speed_10m[i]);
      const windDir = data.hourly.wind_direction_10m[i];
      const windDirText = getWindDirection(windDir);
      const windArrow = getWindArrow(windDir);
      const snowfall = data.hourly.snowfall[i];

      // Min/max in a 3-hour window
      const startIdx = Math.max(0, i - 1);
      const endIdx = Math.min(23, i + 1);
      let tempMin = temp, tempMax = temp;
      for (let j = startIdx; j <= endIdx; j++) {
        const t = Math.round(data.hourly.temperature_2m[j]);
        if (t < tempMin) tempMin = t;
        if (t > tempMax) tempMax = t;
      }

      const card = document.createElement('div');
      card.className = 'stat-card';
      card.title = getWeatherDescription(code);
      card.style.cssText = `min-width:52px;padding:6px 3px;${isCurrent ? 'background:var(--accent);color:white;' : ''}`;

      card.innerHTML = `
        <div style="font-weight:700;font-size:11px;margin-bottom:2px">${isCurrent ? 'Now' : timeStr}</div>
        <div style="font-size:1.4em;margin:2px 0">${icon}</div>
        <div class="stat-value" style="color:${isCurrent ? 'white' : 'var(--text)'}">${temp}°</div>
        <div style="font-size:10px;line-height:1.2">
          <span style="color:${isCurrent ? 'white' : 'var(--info)'}">${tempMax}°</span> / 
          <span style="color:${isCurrent ? 'white' : 'var(--ring)'}">${tempMin}°</span>
        </div>
        <div style="font-size:9px;opacity:0.85;margin-top:2px;line-height:1.3">
          ${snowfall > 0 ? `<span style="color:${isCurrent ? 'white' : 'var(--info)'};font-weight:700"><i class="fas fa-snowflake"></i> ${snowfall.toFixed(1)}cm</span><br>` : ''}
          <i class="fas fa-droplet"></i> ${precip}%<br>
          <span style="font-size:1.6em;line-height:1">${windArrow}</span>${wind} ${windDirText}
        </div>
      `;
      scroll.appendChild(card);
    }

    section.appendChild(scroll);
    return section;
  }

  private buildDailySection(data: any): HTMLElement {
    const section = document.createElement('div');

    // Section header
    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'flex space-between align-center mb-8';
    sectionHeader.innerHTML = `
      <span style="font-size:14px;font-weight:600;color:var(--text)"><i class="fas fa-calendar-days"></i> 7-Day Forecast</span>
    `;
    section.appendChild(sectionHeader);

    // Daily grid
    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.style.cssText = 'grid-template-columns:repeat(7,1fr);';

    for (let i = 0; i < 7 && i < data.daily.time.length; i++) {
      const date = new Date(data.daily.time[i]);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const tempMax = Math.round(data.daily.temperature_2m_max[i]);
      const tempMin = Math.round(data.daily.temperature_2m_min[i]);
      const code = data.daily.weather_code[i];
      const icon = getWeatherIcon(code);
      const precip = data.daily.precipitation_sum[i];
      const precipProb = data.daily.precipitation_probability_max[i];
      const humidity = data.daily.relative_humidity_2m_max[i];
      const windSpeed = Math.round(data.daily.wind_speed_10m_max[i]);
      const windDir = data.daily.wind_direction_10m_dominant[i];
      const windDirText = getWindDirection(windDir);
      const windArrow = getWindArrow(windDir);
      const snowfall = data.daily.snowfall_sum[i];

      const card = document.createElement('div');
      card.className = 'stat-card text-center';
      card.title = getWeatherDescription(code);

      card.innerHTML = `
        <div class="card-title">${i === 0 ? 'Today' : dayName}</div>
        <div class="card-subtitle">${dateStr}</div>
        <div style="font-size:2em;margin:6px 0">${icon}</div>
        <div class="flex justify-center gap-8" style="font-size:14px">
          <h3 style="color:var(--info);">${tempMax}°</h3>
          <h3 style="color:var(--accent);">${tempMin}°</h3>
        </div>
        <div class="card-footer">
          ${snowfall > 0 ? `
          <div class="card-row" style="background:var(--bg-warning);margin:-4px -4px 4px;padding:4px 6px;border-radius:4px">
            <span class="card-row-label" style="color:var(--text);font-weight:700"><i class="fas fa-snowflake"></i> Snow</span>
            <span class="card-row-value" style="color:var(--text)">${snowfall.toFixed(1)}cm</span>
          </div>
          ` : ''}
          <div class="card-row">
            <span class="card-row-label"><i class="fas fa-droplet"></i> Precip</span>
            <span class="card-row-value">${precipProb}%</span>
          </div>
          <div class="card-row">
            <span class="card-row-label"><i class="fas fa-cloud-rain"></i> Amount</span>
            <span class="card-row-value">${precip.toFixed(1)}mm</span>
          </div>
          <div class="card-row">
            <span class="card-row-label"><i class="fas fa-water"></i> Humid</span>
            <span class="card-row-value">${humidity}%</span>
          </div>
          <div class="card-row">
            <span class="card-row-label">Wind</span>
            <span class="card-row-value"><span style="font-size:1.6em">${windArrow}</span>${windSpeed} ${windDirText}</span>
          </div>
        </div>
      `;
      grid.appendChild(card);
    }

    section.appendChild(grid);
    return section;
  }

  private formatDateTime(): string {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const dateStr = now.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    return `${dateStr} • ${timeStr}`;
  }
}

export const widget = {
  type: 'weather-dash',
  name: 'Weather Dashboard',
  icon: '<i class="fas fa-mountain-sun"></i>',
  description: 'Full weather dashboard with 24-hour hourly and 7-day daily forecasts',
  renderer: new WeatherDashWidgetRenderer(),
  defaultSize: { w: 1200, h: 800 },
  defaultContent: { latitude: 0, longitude: 0, timezone: 'America/Edmonton', locationName: '' }
};
