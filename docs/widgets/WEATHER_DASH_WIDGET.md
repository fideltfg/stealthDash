# Weather Dash Widget

Display weather data using the Open-Meteo API (no API key required).

## Overview

A weather widget using the free Open-Meteo API that provides current conditions and forecasts without requiring an API key.

## Features

### Current Weather
- Temperature display
- Weather conditions (sunny, cloudy, rainy, etc.)
- Weather icon representation
- Humidity levels
- Wind speed and direction
- Precipitation information

### Forecast
- Multi-day forecast
- Hourly weather data
- Temperature trends
- Precipitation probability

### Display Options
- Clean, visual interface
- Weather icons (Font Awesome)
- Wind direction indicator
- Responsive layout

## Setup

1. Add Weather Dash widget to dashboard

2. Configure location:
   - **Latitude**: Geographic latitude
   - **Longitude**: Geographic longitude
   - **Timezone**: Local timezone (e.g., `America/New_York`)
   - **Location Name**: Display name (e.g., `New York City`)

3. Widget automatically fetches weather data

## Configuration Options

- **Latitude**: Location latitude (-90 to 90)
- **Longitude**: Location longitude (-180 to 180)
- **Timezone**: IANA timezone identifier
- **Location Name**: Custom display name
- **Refresh Interval**: Update frequency (default: 15 minutes)

## Getting Location Coordinates

### Option 1: Online Tools
- Use [LatLong.net](https://www.latlong.net/)
- Search your city/address
- Copy latitude and longitude

### Option 2: Google Maps
- Right-click location on Google Maps
- Select "What's here?"
- Copy coordinates from popup

### Option 3: Browser
```javascript
// In browser console
navigator.geolocation.getCurrentPosition(pos => {
  console.log(pos.coords.latitude, pos.coords.longitude);
});
```

## Weather Codes

The widget displays appropriate icons for various weather conditions:
- **0**: Clear sky
- **1-3**: Partly cloudy to cloudy
- **45, 48**: Fog
- **51-55**: Drizzle (light to heavy)
- **61-65**: Rain (light to heavy)
- **71-77**: Snow (light to heavy)
- **80-82**: Rain showers
- **85-86**: Snow showers
- **95-99**: Thunderstorms

## Advantages

**No API Key Required**
- Uses free Open-Meteo API
- No registration needed
- No rate limits for reasonable use
- No cost considerations

**Privacy Friendly**
- No tracking
- No personal data required
- Open source weather data

**Global Coverage**
- Works worldwide
- Multiple weather models
- Reliable forecasts

## Data Source

Weather data provided by [Open-Meteo.com](https://open-meteo.com/):
- Free weather API
- No API key required
- High-quality forecast data
- Multiple weather models
- Worldwide coverage

## Limitations

- Requires coordinates (not city name search)
- Refresh limited to prevent abuse
- Less historical data than paid services
- No advanced features (radar, satellites, etc.)

## Troubleshooting

**No weather data showing**
- Verify coordinates are correct
- Check latitude is -90 to 90
- Check longitude is -180 to 180
- Ensure internet connection

**Wrong location displaying**
- Confirm coordinates match intended location
- Check timezone is correct for location
- Swap latitude/longitude if reversed

**Data not updating**
- Check refresh interval setting
- Verify Open-Meteo API is accessible
- Check browser console for errors
- Try manual refresh
