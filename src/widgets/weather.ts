import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';
import { stopWidgetDragPropagation, dispatchWidgetUpdate } from '../utils/dom';
import { renderLoading, renderError } from '../utils/widgetRendering';

export class WeatherWidgetRenderer implements WidgetRenderer {
  configure(widget: Widget): void {
    const content = widget.content as { location: string };
    
    const overlay = document.createElement('div');
    overlay.className = 'widget-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'widget-dialog';

    dialog.innerHTML = `
      <h3 class="widget-dialog-title">Configure Weather</h3>
      <div class="widget-dialog-field">
        <label class="widget-dialog-label">Location</label>
        <input type="text" id="weather-location" value="${content.location || ''}" placeholder="e.g., London, New York, Tokyo" class="widget-dialog-input" />
      </div>
      <div class="widget-dialog-buttons">
        <button id="cancel-btn" class="widget-dialog-button-cancel">
          Cancel
        </button>
        <button id="save-btn" class="widget-dialog-button-save">
          Save
        </button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const locationInput = dialog.querySelector('#weather-location') as HTMLInputElement;
    const saveBtn = dialog.querySelector('#save-btn') as HTMLButtonElement;
    const cancelBtn = dialog.querySelector('#cancel-btn') as HTMLButtonElement;

    const close = () => overlay.remove();

    cancelBtn.onclick = close;
    overlay.onclick = (e) => e.target === overlay && close();

    saveBtn.onclick = () => {
      const location = locationInput.value.trim();
      if (location) {
        dispatchWidgetUpdate(widget.id, { location });
        close();
      }
    };
  }

  render(container: HTMLElement, widget: Widget): void {
    const content = widget.content as { location: string };
    const div = document.createElement('div');
    div.className = 'weather-widget';
    
    if (!content.location) {
      this.renderConfigScreen(div, widget);
    } else {
      this.fetchWeatherData(div, content.location);
    }
    
    container.appendChild(div);
  }

  private renderConfigScreen(div: HTMLElement, widget: Widget): void {
    const inputContainer = document.createElement('div');
    inputContainer.className = 'widget-config-screen padded';
    
    const icon = document.createElement('div');
    icon.className = 'widget-config-icon';
    icon.innerHTML = '<i class="fas fa-cloud-sun"></i>';
    
    const label = document.createElement('div');
    label.className = 'weather-config-prompt';
    label.textContent = 'Enter location for weather';
    
    const locationInput = document.createElement('input');
    locationInput.type = 'text';
    locationInput.placeholder = 'e.g., London, New York, Tokyo';
    locationInput.className = 'weather-input';
    
    const button = document.createElement('button');
    button.textContent = 'Get Weather';
    button.className = 'weather-button';
    button.disabled = true;
    
    const updateButtonState = () => {
      const location = locationInput.value.trim();
      button.disabled = location.length === 0;
    };
    
    const loadWeather = () => {
      const location = locationInput.value.trim();
      if (location) {
        dispatchWidgetUpdate(widget.id, { location });
      }
    };
    
    button.addEventListener('click', loadWeather);
    locationInput.addEventListener('input', updateButtonState);
    locationInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !button.disabled) {
        loadWeather();
      }
    });
    
    stopWidgetDragPropagation(locationInput);
    stopWidgetDragPropagation(button);
    
    inputContainer.appendChild(icon);
    inputContainer.appendChild(label);
    inputContainer.appendChild(locationInput);
    inputContainer.appendChild(button);
    div.appendChild(inputContainer);
  }

  private async fetchWeatherData(container: HTMLElement, location: string): Promise<void> {
    renderLoading(container, 'Loading weather...');
    
    try {
      const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`);
      const geoData = await geoResponse.json();
      
      if (!geoData.results || geoData.results.length === 0) {
        throw new Error('Location not found');
      }
      
      const { latitude, longitude, name, country } = geoData.results[0];
      
      const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=5`);
      const weatherData = await weatherResponse.json();
      
      container.innerHTML = '';
      this.renderWeatherUI(container, weatherData, name, country);
    } catch (error) {
      renderError(container, 'Failed to load weather data', error);
    }
  }

  private renderWeatherUI(container: HTMLElement, data: any, cityName: string, country: string): void {
    const current = data.current;
    const daily = data.daily;
    
    const getWeatherEmoji = (code: number): string => {
      if (code === 0) return '<i class="fas fa-sun"></i>';
      if (code <= 3) return '<i class="fas fa-cloud-sun"></i>';
      if (code <= 49) return '<i class="fas fa-smog"></i>';
      if (code <= 69) return '<i class="fas fa-cloud-rain"></i>';
      if (code <= 79) return '<i class="fas fa-snowflake"></i>';
      if (code <= 99) return '<i class="fas fa-bolt"></i>';
      return '<i class="fas fa-cloud-sun"></i>';
    };
    
    const getWeatherDescription = (code: number): string => {
      if (code === 0) return 'Clear';
      if (code <= 3) return 'Partly Cloudy';
      if (code <= 49) return 'Foggy';
      if (code <= 69) return 'Rainy';
      if (code <= 79) return 'Snowy';
      if (code <= 99) return 'Thunderstorm';
      return 'Unknown';
    };
    
    // Current weather section
    const currentSection = document.createElement('div');
    currentSection.className = 'weather-current-section';
    
    const locationDiv = document.createElement('div');
    locationDiv.className = 'weather-location';
    locationDiv.textContent = `${cityName}, ${country}`;
    
    const currentWeather = document.createElement('div');
    currentWeather.className = 'weather-current';
    
    const weatherIcon = document.createElement('div');
    weatherIcon.className = 'weather-icon';
    weatherIcon.innerHTML = getWeatherEmoji(current.weather_code);
    
    const tempInfo = document.createElement('div');
    tempInfo.className = 'weather-temp-info';
    
    const temp = document.createElement('div');
    temp.className = 'weather-temp';
    temp.textContent = `${Math.round(current.temperature_2m)}°C`;
    
    const description = document.createElement('div');
    description.className = 'weather-description';
    description.textContent = getWeatherDescription(current.weather_code);
    
    const feelsLike = document.createElement('div');
    feelsLike.className = 'weather-feels-like';
    feelsLike.textContent = `Feels like ${Math.round(current.apparent_temperature)}°C`;
    
    tempInfo.appendChild(temp);
    tempInfo.appendChild(description);
    tempInfo.appendChild(feelsLike);
    
    currentWeather.appendChild(weatherIcon);
    currentWeather.appendChild(tempInfo);
    
    const additionalInfo = document.createElement('div');
    additionalInfo.className = 'weather-additional-info';
    
    const humidity = document.createElement('div');
    humidity.innerHTML = '<i class="fas fa-tint"></i> ' + `${current.relative_humidity_2m}%`;
    
    const wind = document.createElement('div');
    wind.innerHTML = '<i class="fas fa-wind"></i> ' + `${Math.round(current.wind_speed_10m)} km/h`;
    
    additionalInfo.appendChild(humidity);
    additionalInfo.appendChild(wind);
    
    currentSection.appendChild(locationDiv);
    currentSection.appendChild(currentWeather);
    currentSection.appendChild(additionalInfo);
    
    // 5-day forecast
    const forecastTitle = document.createElement('div');
    forecastTitle.className = 'weather-forecast-title';
    forecastTitle.textContent = '5-Day Forecast';
    
    const forecastContainer = document.createElement('div');
    forecastContainer.className = 'weather-forecast-container';
    
    for (let i = 0; i < 5; i++) {
      const forecastDay = document.createElement('div');
      forecastDay.className = 'weather-forecast-day';
      
      const date = new Date(daily.time[i]);
      const dayName = i === 0 ? 'Today' : date.toLocaleDateString('en', { weekday: 'short' });
      
      const dayLabel = document.createElement('div');
      dayLabel.className = 'weather-forecast-day-label';
      dayLabel.textContent = dayName;
      
      const icon = document.createElement('div');
      icon.className = 'weather-forecast-icon';
      icon.innerHTML = getWeatherEmoji(daily.weather_code[i]);
      
      const temps = document.createElement('div');
      temps.className = 'weather-forecast-temps';
      temps.textContent = `${Math.round(daily.temperature_2m_max[i])}° / ${Math.round(daily.temperature_2m_min[i])}°`;
      
      const precip = document.createElement('div');
      precip.className = 'weather-forecast-precip';
      precip.innerHTML = '<i class="fas fa-tint"></i> ' + `${daily.precipitation_probability_max[i]}%`;
      
      forecastDay.appendChild(dayLabel);
      forecastDay.appendChild(icon);
      forecastDay.appendChild(temps);
      forecastDay.appendChild(precip);
      
      forecastContainer.appendChild(forecastDay);
    }
    
    container.appendChild(currentSection);
    container.appendChild(forecastTitle);
    container.appendChild(forecastContainer);
  }
}

export const widget = {
  type: 'weather',
  name: 'Weather',
  icon: '<i class="fas fa-cloud-sun"></i>',
  description: 'Display weather information',
  renderer: new WeatherWidgetRenderer(),
  defaultSize: { w: 340, h: 580 },
  defaultContent: { location: '' }
};
