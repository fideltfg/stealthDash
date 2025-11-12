# Widget Configuration Guide

Complete guide to configuring and using all available dashboard widgets.

## Table of Contents

- [Core Widgets](#core-widgets)
- [Monitoring Widgets](#monitoring-widgets)
- [Integration Widgets](#integration-widgets)
- [Specialized Widgets](#specialized-widgets)

---

## Core Widgets

### Text Widget

Markdown editor with live preview for notes and documentation.

**Features:**
- Full markdown support (headings, lists, links, code)
- Live preview
- Syntax highlighting for code blocks
- Auto-save

**Configuration:**
- No additional setup required
- Just start typing in the editor

**Usage:**
```markdown
# My Notes

- Task 1
- Task 2

**Important:** Remember to check logs
```

---

### Image Widget

Display images from URLs with various fit modes.

**Configuration:**
1. Click "Set Image URL" in widget
2. Enter image URL
3. Choose object-fit mode:
   - **Contain**: Image fits within bounds (default)
   - **Cover**: Image fills widget, may crop
4. Optional: Add alt text for accessibility

**Supported Formats:**
- JPG/JPEG
- PNG
- GIF
- WebP
- SVG

**Example URLs:**
```
https://example.com/image.jpg
https://picsum.photos/400/300
```

---

### Data Widget

Display JSON data with syntax highlighting.

**Features:**
- Automatic JSON formatting
- Syntax highlighting
- Collapsible objects/arrays
- Copy to clipboard

**Configuration:**
1. Paste or type JSON data
2. Widget auto-formats

**Example:**
```json
{
  "status": "online",
  "users": 42,
  "uptime": "99.9%"
}
```

---

### Embed Widget

Embed external websites in sandboxed iframe.

**Configuration:**
1. Click "Set URL" in widget
2. Enter website URL
3. Widget loads content

**Security:**
- Sandboxed iframe for safety
- Some sites block embedding (X-Frame-Options)
- Click-to-activate reduces load

**Supported:**
- Most public websites
- YouTube embeds
- Google Maps
- Documentation pages

---

## Monitoring Widgets

### Uptime Widget

Monitor network connectivity with real-time ping.

**Features:**
- Multiple target monitoring
- Latency graphs
- Success/failure statistics
- Historical data
- Configurable intervals

**Configuration:**
1. Add widget to dashboard
2. Click settings icon
3. Add monitored targets:
   - Name: `Google DNS`
   - Host: `8.8.8.8` or `google.com`
   - Interval: `60` seconds (default)
4. View real-time ping status

**Targets Examples:**
```
Name: Primary Router
Host: 192.168.1.1
Interval: 30

Name: Google
Host: google.com
Interval: 60

Name: Cloudflare DNS
Host: 1.1.1.1
Interval: 60
```

**Display Modes:**
- **Table**: List of all targets with status
- **Graph**: Latency over time
- **Gauge**: Current latency visualization

**Requirements:**
- Ping server must be running
- Targets must be reachable from server

---

### Clock Widget

Display current time with multiple formats.

**Configuration:**
1. Add widget
2. Click settings
3. Choose options:
   - **Format**: 12-hour or 24-hour
   - **Display**: Digital or Analog
   - **Show Seconds**: On/Off
   - **Show Date**: On/Off

**Customization:**
- Font size
- Colors
- Timezone (uses browser timezone by default)

---

### Timezones Widget

Display multiple timezone clocks simultaneously.

**Configuration:**
1. Add widget
2. Click "Add Timezone"
3. Search for city or timezone
4. Repeat for multiple locations

**Example Timezones:**
```
America/New_York (EST)
Europe/London (GMT)
Asia/Tokyo (JST)
Australia/Sydney (AEST)
```

**Features:**
- Add unlimited timezones
- Real-time updates
- Shows offset from local time
- Day/night indicator

---

## Integration Widgets

### ChatGPT Widget

Direct integration with OpenAI's ChatGPT API.

**Requirements:**
- OpenAI API key
- Stored in Credential Manager

**Setup:**
1. Get API key from [platform.openai.com](https://platform.openai.com)
2. Store in Credential Manager:
   - Name: `openai_api_key`
   - Value: `sk-...your-key...`
3. Add ChatGPT widget
4. Select credential from dropdown
5. Choose model (gpt-3.5-turbo, gpt-4, etc.)

**Configuration:**
- **Model**: GPT-3.5 Turbo, GPT-4, GPT-4 Turbo
- **Temperature**: 0.0 - 2.0 (creativity)
- **Max Tokens**: Response length limit

**Usage:**
- Type message in input field
- Press Enter or click Send
- View response in chat history
- Conversation persists in widget

**Note:** API usage incurs costs on your OpenAI account.

---

### Weather Widget

Display current weather and forecast.

**Requirements:**
- Weather API key (OpenWeatherMap, WeatherAPI, etc.)
- Location coordinates or city name

**Setup:**
1. Get API key from weather provider
2. Store in Credential Manager
3. Add widget
4. Configure:
   - API Key (from credentials)
   - Location: `New York, US` or `40.7128,-74.0060`
   - Units: Metric or Imperial
   - Update interval

**Display:**
- Current temperature
- Conditions (sunny, cloudy, etc.)
- Humidity
- Wind speed
- 5-day forecast

---

### RSS Feed Widget

Display RSS/Atom feed entries.

**Configuration:**
1. Add widget
2. Enter RSS feed URL
3. Set update interval (minutes)
4. Choose number of items to display

**Example Feeds:**
```
https://news.ycombinator.com/rss
https://www.reddit.com/r/programming/.rss
https://github.com/trending.atom
```

**Features:**
- Auto-refresh
- Clickable links
- Timestamps
- Excerpt display

---

### Google Calendar Widget

View upcoming calendar events.

**Requirements:**
- Google Calendar API credentials
- OAuth 2.0 setup

**Setup:**
1. Enable Google Calendar API in Google Cloud Console
2. Create OAuth 2.0 credentials
3. Store credentials in Credential Manager
4. Add widget
5. Authorize access
6. Select calendars to display

**Display:**
- Next 10 events
- Event time and title
- Color coding by calendar
- Refreshes every 15 minutes

---

### Home Assistant Widget

Display sensor data from Home Assistant.

**Requirements:**
- Home Assistant instance
- Long-lived access token

**Setup:**
1. In Home Assistant, create long-lived token:
   - Profile → Security → Long-Lived Access Tokens
2. Store in Credential Manager:
   - Name: `homeassistant_token`
   - Value: `your-token`
3. Add widget
4. Configure:
   - Home Assistant URL: `http://homeassistant.local:8123`
   - Token: Select from credentials
   - Entity IDs to display

**Example Entities:**
```
sensor.living_room_temperature
sensor.bedroom_humidity
light.kitchen
switch.fan
```

**Display:**
- Entity state and value
- Last updated time
- Unit of measurement
- Icon (if available)

---

### Pi-hole Widget

Display Pi-hole DNS blocking statistics.

**Requirements:**
- Pi-hole instance
- API key (optional but recommended)

**Setup:**
1. Get API key from Pi-hole:
   - Settings → API → Show API token
2. Store in Credential Manager
3. Add widget
4. Configure:
   - Pi-hole URL: `http://pi.hole/admin`
   - API Key: Select from credentials

**Display:**
- Total queries (24h)
- Queries blocked (24h)
- Percent blocked
- Domains on blocklist
- Status (enabled/disabled)

**Actions:**
- Enable/disable blocking
- Refresh statistics

---

### UniFi Widget

Monitor UniFi network devices and clients.

**Requirements:**
- UniFi Controller
- Controller credentials

**Setup:**
1. Store credentials in Credential Manager:
   - Name: `unifi_username`
   - Value: `admin`
   - Name: `unifi_password`
   - Value: `your-password`
2. Add widget
3. Configure:
   - Controller URL: `https://unifi.local:8443`
   - Username: Select credential
   - Password: Select credential
   - Site: `default`

**Display:**
- Connected clients count
- Device status (online/offline)
- Uplink status
- WAN IP
- Network traffic

---

## Specialized Widgets

### Environment Canada Widget

Canadian weather data from Environment Canada.

**Configuration:**
1. Add widget
2. Select province
3. Select city/location
4. Choose language (English/French)

**Features:**
- Current conditions
- Hourly forecast
- Weather warnings/alerts
- No API key required

**Available Locations:**
- All major Canadian cities
- Many smaller towns
- Automatic updates

---

### MTN XML Widget

Parse and display XML data with XPath queries.

**Configuration:**
1. Add widget
2. Enter XML data source URL
3. Configure XPath queries:
   - Path: `//item/title`
   - Label: `Title`
4. Set refresh interval

**Example:**
```xml
XPath: //weather/temperature
Label: Temperature

XPath: //weather/condition
Label: Conditions
```

**Use Cases:**
- Custom API responses
- XML feeds
- SOAP web services
- Legacy data sources

---

### Comet P8541 Widget

Display data from Comet P8541 temperature/humidity sensors.

**Requirements:**
- Comet P8541 sensor
- Network access to sensor

**Configuration:**
1. Add widget
2. Enter sensor IP address
3. Choose display mode:
   - Gauge (visual)
   - Text (numeric)
4. Set update interval

**Display:**
- Temperature (°C or °F)
- Humidity (%)
- Dewpoint
- Alarm status

**Features:**
- Real-time updates
- Alarm notifications
- Historical graphs
- Multi-sensor support

---

## General Widget Tips

### Performance

- Limit update intervals for API widgets (≥60 seconds recommended)
- Use credential manager for API keys
- Disable unused widgets instead of deleting
- Keep widget count reasonable (<20 for best performance)

### Troubleshooting

**Widget Not Updating:**
1. Check API credentials
2. Verify network connectivity
3. Check browser console for errors
4. Increase update interval

**Widget Shows Error:**
1. Verify API key is valid
2. Check service status (external API may be down)
3. Review widget settings
4. Check ping-server logs

**Credential Not Found:**
1. Add credential in Credential Manager
2. Ensure credential name matches exactly
3. Refresh widget settings

### Security Best Practices

- Store all API keys in Credential Manager
- Never share credentials between users
- Use read-only API keys when possible
- Regularly rotate API keys
- Review credential usage in admin panel
- Delete unused credentials

### Customization

All widgets support:
- Custom titles
- Adjustable size
- Position anywhere on canvas
- Z-index control (bring forward/send back)
- Theme-aware styling

---

## Creating Custom Widgets

Want to create your own widget? See the development guide:

1. Create widget file in `src/widgets/types/`
2. Implement `WidgetRenderer` interface:
   ```typescript
   export class MyWidgetRenderer implements WidgetRenderer {
     render(widget: Widget, container: HTMLElement): void {
       // Your render logic
     }
     
     cleanup(): void {
       // Cleanup when widget is removed
     }
   }
   ```
3. Export widget plugin:
   ```typescript
   export const widget = {
     type: 'my-widget',
     name: 'My Widget',
     description: 'Does something cool',
     icon: '🎉',
     renderer: MyWidgetRenderer
   };
   ```
4. Register in `src/widgets/types/index.ts`

---

## Widget Icons Reference

| Widget | Icon | Type |
|--------|------|------|
| Text | 📝 | Core |
| Image | 🖼️ | Core |
| Data | 📊 | Core |
| Embed | 🌐 | Core |
| Uptime | 🏓 | Monitoring |
| Clock | 🕐 | Monitoring |
| Timezones | 🌍 | Monitoring |
| ChatGPT | 🤖 | Integration |
| Weather | ☁️ | Integration |
| RSS | 📰 | Integration |
| Calendar | 📅 | Integration |
| Home Assistant | 🏠 | Integration |
| Pi-hole | 🛡️ | Integration |
| UniFi | 📡 | Integration |
| Env Canada | 🍁 | Specialized |
| MTN XML | 📄 | Specialized |
| Comet P8541 | 🌡️ | Specialized |

---

## Need Help?

- Check main [README.md](./README.md) for setup instructions
- Review [DEPLOYMENT.md](./DEPLOYMENT.md) for production configuration
- Open issue on GitHub for bugs or feature requests
- Check browser console (F12) for error messages
