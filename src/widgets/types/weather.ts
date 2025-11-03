import type { Widget } from '../../types';
import type { WidgetRenderer } from './base';

export class WeatherWidgetRenderer implements WidgetRenderer {
  render(container: HTMLElement, widget: Widget): void {
    const content = widget.content as { location: string };
    const div = document.createElement('div');
    div.className = 'weather-widget';
    div.style.height = '100%';
    div.style.display = 'flex';
    div.style.flexDirection = 'column';
    div.style.padding = '16px';
    div.style.overflow = 'hidden'; // Changed from 'auto' to 'hidden'
    
    if (!content.location) {
      this.renderConfigScreen(div, widget);
    } else {
      this.fetchWeatherData(div, content.location);
    }
    
    container.appendChild(div);
  }

  private renderConfigScreen(div: HTMLElement, widget: Widget): void {
    const inputContainer = document.createElement('div');
    inputContainer.style.display = 'flex';
    inputContainer.style.flexDirection = 'column';
    inputContainer.style.alignItems = 'center';
    inputContainer.style.justifyContent = 'center';
    inputContainer.style.height = '100%';
    inputContainer.style.gap = '12px';
    
    const icon = document.createElement('div');
    icon.textContent = '🌤️';
    icon.style.fontSize = '48px';
    
    const label = document.createElement('div');
    label.textContent = 'Enter location for weather';
    label.style.color = 'var(--muted)';
    label.style.marginBottom = '8px';
    
    const locationInput = document.createElement('input');
    locationInput.type = 'text';
    locationInput.placeholder = 'e.g., London, New York, Tokyo';
    locationInput.style.width = '80%';
    locationInput.style.padding = '8px 12px';
    locationInput.style.border = '2px solid var(--border)';
    locationInput.style.borderRadius = '6px';
    locationInput.style.fontFamily = 'inherit';
    locationInput.style.fontSize = '14px';
    locationInput.style.background = 'var(--bg)';
    locationInput.style.color = 'var(--text)';
    
    const button = document.createElement('button');
    button.textContent = 'Get Weather';
    button.style.padding = '8px 20px';
    button.style.background = 'var(--accent)';
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.borderRadius = '6px';
    button.style.cursor = 'pointer';
    button.style.fontSize = '14px';
    button.style.fontWeight = '500';
    button.disabled = true;
    button.style.opacity = '0.5';
    button.style.cursor = 'not-allowed';
    
    const updateButtonState = () => {
      const location = locationInput.value.trim();
      if (location.length > 0) {
        button.disabled = false;
        button.style.opacity = '1';
        button.style.cursor = 'pointer';
      } else {
        button.disabled = true;
        button.style.opacity = '0.5';
        button.style.cursor = 'not-allowed';
      }
    };
    
    const loadWeather = () => {
      const location = locationInput.value.trim();
      if (location) {
        const event = new CustomEvent('widget-update', {
          detail: { id: widget.id, content: { location } }
        });
        document.dispatchEvent(event);
      }
    };
    
    button.addEventListener('click', loadWeather);
    locationInput.addEventListener('input', updateButtonState);
    locationInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !button.disabled) {
        loadWeather();
      }
    });
    
    locationInput.addEventListener('pointerdown', (e) => e.stopPropagation());
    button.addEventListener('pointerdown', (e) => e.stopPropagation());
    
    inputContainer.appendChild(icon);
    inputContainer.appendChild(label);
    inputContainer.appendChild(locationInput);
    inputContainer.appendChild(button);
    div.appendChild(inputContainer);
  }

  private async fetchWeatherData(container: HTMLElement, location: string): Promise<void> {
    container.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--muted);">Loading weather...</div>';
    
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
      container.innerHTML = `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--error); text-align: center; padding: 20px;">
        <div style="font-size: 32px; margin-bottom: 12px;">⚠️</div>
        <div>Failed to load weather data</div>
        <div style="font-size: 12px; margin-top: 8px; color: var(--muted);">${error instanceof Error ? error.message : 'Unknown error'}</div>
      </div>`;
    }
  }

  private renderWeatherUI(container: HTMLElement, data: any, cityName: string, country: string): void {
    const current = data.current;
    const daily = data.daily;
    
    const getWeatherEmoji = (code: number): string => {
      if (code === 0) return '☀️';
      if (code <= 3) return '⛅';
      if (code <= 49) return '🌫️';
      if (code <= 69) return '🌧️';
      if (code <= 79) return '🌨️';
      if (code <= 99) return '⛈️';
      return '🌤️';
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
    currentSection.style.marginBottom = '20px';
    
    const locationDiv = document.createElement('div');
    locationDiv.style.fontSize = '18px';
    locationDiv.style.fontWeight = '600';
    locationDiv.style.marginBottom = '12px';
    locationDiv.textContent = `${cityName}, ${country}`;
    
    const currentWeather = document.createElement('div');
    currentWeather.style.display = 'flex';
    currentWeather.style.alignItems = 'center';
    currentWeather.style.gap = '16px';
    currentWeather.style.marginBottom = '12px';
    
    const weatherIcon = document.createElement('div');
    weatherIcon.style.fontSize = '64px';
    weatherIcon.textContent = getWeatherEmoji(current.weather_code);
    
    const tempInfo = document.createElement('div');
    tempInfo.style.flex = '1';
    
    const temp = document.createElement('div');
    temp.style.fontSize = '36px';
    temp.style.fontWeight = '700';
    temp.textContent = `${Math.round(current.temperature_2m)}°C`;
    
    const description = document.createElement('div');
    description.style.fontSize = '16px';
    description.style.color = 'var(--muted)';
    description.textContent = getWeatherDescription(current.weather_code);
    
    const feelsLike = document.createElement('div');
    feelsLike.style.fontSize = '14px';
    feelsLike.style.color = 'var(--muted)';
    feelsLike.textContent = `Feels like ${Math.round(current.apparent_temperature)}°C`;
    
    tempInfo.appendChild(temp);
    tempInfo.appendChild(description);
    tempInfo.appendChild(feelsLike);
    
    currentWeather.appendChild(weatherIcon);
    currentWeather.appendChild(tempInfo);
    
    const additionalInfo = document.createElement('div');
    additionalInfo.style.display = 'flex';
    additionalInfo.style.gap = '16px';
    additionalInfo.style.fontSize = '14px';
    additionalInfo.style.color = 'var(--muted)';
    
    const humidity = document.createElement('div');
    humidity.textContent = `💧 ${current.relative_humidity_2m}%`;
    
    const wind = document.createElement('div');
    wind.textContent = `💨 ${Math.round(current.wind_speed_10m)} km/h`;
    
    additionalInfo.appendChild(humidity);
    additionalInfo.appendChild(wind);
    
    currentSection.appendChild(locationDiv);
    currentSection.appendChild(currentWeather);
    currentSection.appendChild(additionalInfo);
    
    // 5-day forecast
    const forecastTitle = document.createElement('div');
    forecastTitle.style.fontSize = '16px';
    forecastTitle.style.fontWeight = '600';
    forecastTitle.style.marginTop = '20px';
    forecastTitle.style.marginBottom = '12px';
    forecastTitle.textContent = '5-Day Forecast';
    
    const forecastContainer = document.createElement('div');
    forecastContainer.style.display = 'flex';
    forecastContainer.style.flexDirection = 'column';
    forecastContainer.style.gap = '8px';
    
    for (let i = 0; i < 5; i++) {
      const forecastDay = document.createElement('div');
      forecastDay.style.display = 'flex';
      forecastDay.style.alignItems = 'center';
      forecastDay.style.gap = '12px';
      forecastDay.style.padding = '8px';
      forecastDay.style.background = 'var(--bg)';
      forecastDay.style.borderRadius = '6px';
      forecastDay.style.fontSize = '14px';
      
      const date = new Date(daily.time[i]);
      const dayName = i === 0 ? 'Today' : date.toLocaleDateString('en', { weekday: 'short' });
      
      const dayLabel = document.createElement('div');
      dayLabel.style.width = '50px';
      dayLabel.style.fontWeight = '500';
      dayLabel.textContent = dayName;
      
      const icon = document.createElement('div');
      icon.style.fontSize = '24px';
      icon.textContent = getWeatherEmoji(daily.weather_code[i]);
      
      const temps = document.createElement('div');
      temps.style.flex = '1';
      temps.textContent = `${Math.round(daily.temperature_2m_max[i])}° / ${Math.round(daily.temperature_2m_min[i])}°`;
      
      const precip = document.createElement('div');
      precip.style.fontSize = '12px';
      precip.style.color = 'var(--muted)';
      precip.textContent = `💧 ${daily.precipitation_probability_max[i]}%`;
      
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
