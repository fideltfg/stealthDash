# UniFi Environmental Sensors Widget

Monitor temperature, humidity, and light levels from UniFi USL-Environmental devices.

## Overview

Connects to UniFi Protect console and displays real-time environmental data from USL-Environmental devices with a clean, card-based interface.

## Features

### Sensor Monitoring
- **Temperature**: Display in Celsius, Fahrenheit, or both
- **Humidity**: Show relative humidity percentage
- **Light Level**: Display ambient light in lux
- **Connection Status**: Real-time device status indicators
- **Last Seen**: Timestamp of last sensor update

### Customization
- **Selective Display**: Choose which metrics to show
- **Temperature Units**: Pick your preferred temperature display
- **Auto-refresh**: Configurable refresh intervals (5-300 seconds)
- **Multi-sensor**: Display multiple sensors in a responsive grid

### Visual Design
- **Card Layout**: Each sensor in its own card
- **Status Indicators**: Color-coded connection status
- **Responsive Grid**: Automatically adjusts to widget size
- **Theme Integration**: Follows dashboard theme colors

## Setup

### Prerequisites

1. UniFi Protect Console (Cloud Key Gen2+, UDM Pro, UNVR, or standalone NVR)
2. USL-Environmental Device (adopted and connected in UniFi Protect)
3. Dashboard Credentials (saved in Credentials Manager)

### Configuration Steps

1. **Create Credentials**
   - Open Credentials Manager in your dashboard
   - Click Add New Credential
   - Configure:
     - Name: "UniFi Protect Console"
     - Service Type: "UniFi" or "Basic"
     - Username: Local admin username
     - Password: Local admin password
   - Save the credential

2. **Add Widget**
   - Click + Add Widget button
   - Select UniFi Environmental Sensors

3. **Configure Widget**
   - Console URL: Your UniFi Protect address (e.g., `https://192.168.1.1`)
   - Credentials: Select the credential you created
   - Temperature Display: Choose Celsius, Fahrenheit, or Both
   - Show Temperature/Humidity/Light: Enable/disable metrics
   - Refresh Interval: Auto-update frequency (default: 30 seconds)
   - Click Save

## Configuration Options

**Basic Settings:**
- Console URL (HTTPS, e.g., `https://192.168.1.1`)
- Credentials (from Credential Manager)

**Display Settings:**
- Temperature Display: Both (°C / °F) / Celsius only / Fahrenheit only
- Show Temperature: Toggle
- Show Humidity: Toggle
- Show Light Level: Toggle

**Performance Settings:**
- Refresh Interval: 5-300 seconds (default: 30)

## Display Layout

Each sensor appears as a card:
```
[Sensor Name]
[Model]

Temperature  [23.5°C / 74.3°F]
Humidity     [45.2%]
Light Level  [125 lux]

Connected  |  2m ago
```

## Troubleshooting

**No Sensors Displayed**
- Verify USL-Environmental devices are adopted in UniFi Protect
- Check device connection status
- Test console URL in browser
- Verify credentials

**"Authentication required" Error**
- Log out and log back in
- Refresh the widget

**"Failed to fetch sensor data" Error**
- Verify console accessibility
- Check network connection
- Restart UniFi Protect service
- Update saved credentials

**Stale Data / Not Updating**
- Click Refresh button manually
- Check browser console for errors
- Try increasing refresh interval
- Save widget configuration again

**Data Shows "-- / --"**
- Sensor may not support that metric
- Sensor initializing
- Wait a few minutes or check in UniFi Protect dashboard

## Best Practices

**Refresh Intervals:**
- Real-time monitoring: 10-30 seconds
- Casual monitoring: 60-120 seconds
- Low bandwidth: 180-300 seconds

**Widget Sizing:**
- Single sensor: 300x350px minimum
- Two sensors: 600x350px minimum
- Three+ sensors: Use full width, adjust height

**Credential Security:**
- Use a dedicated UniFi Protect account
- Limit account to viewer permissions if possible
- Rotate passwords periodically
