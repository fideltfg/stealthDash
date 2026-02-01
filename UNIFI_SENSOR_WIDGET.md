# UniFi Environmental Sensors Widget

Monitor temperature, humidity, and light levels from UniFi USL-Environmental devices directly in your dashboard.

## Overview

The UniFi Environmental Sensors widget connects to your UniFi Protect console and displays real-time environmental data from USL-Environmental devices. It provides a clean, card-based interface with configurable display options.

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

1. **UniFi Protect Console**
   - Cloud Key Gen2+, UDM Pro, UNVR, or standalone NVR
   - Accessible from your network
   - Local admin account

2. **USL-Environmental Device**
   - Adopted in UniFi Protect
   - Connected and reporting data

3. **Dashboard Credentials**
   - UniFi Protect credentials saved in Credentials Manager

### Step 1: Create Credentials

1. Open **Credentials Manager** in your dashboard
2. Click **Add New Credential**
3. Configure:
   - **Name**: "UniFi Protect Console" or similar
   - **Service Type**: "UniFi" or "Basic"
   - **Username**: Local admin username
   - **Password**: Local admin password
4. Save the credential

### Step 2: Add Widget

1. Click **+ Add Widget** button
2. Select **UniFi Environmental Sensors** (🌡️ icon)
3. Widget will be added to your dashboard

### Step 3: Configure Widget

1. Click the **gear icon** on the widget or it will prompt you on first load
2. Configure settings:
   - **Console URL**: Your UniFi Protect address (e.g., `https://192.168.1.1`)
   - **Credentials**: Select the credential you created
   - **Temperature Display**: Choose Celsius, Fahrenheit, or Both
   - **Show Temperature**: Enable/disable temperature display
   - **Show Humidity**: Enable/disable humidity display
   - **Show Light Level**: Enable/disable light sensor
   - **Refresh Interval**: Auto-update frequency (default: 30 seconds)
3. Click **Save**

## Configuration Options

### Basic Settings

#### Console URL
- UniFi Protect console address
- Format: `https://192.168.1.1` or `https://unifi-protect.local`
- Must be HTTPS
- Must be accessible from dashboard

#### Credentials
- Select from saved credentials
- Must have UniFi Protect access
- Uses secure token-based authentication

### Display Settings

#### Temperature Display
- **Both (°C / °F)**: Shows dual temperature (default)
- **Celsius only**: Shows only °C
- **Fahrenheit only**: Shows only °F

#### Sensor Metrics
- **Show Temperature**: Toggle temperature display
- **Show Humidity**: Toggle humidity display
- **Show Light Level**: Toggle light sensor display

All metrics are enabled by default. Disable any you don't want to see.

### Performance Settings

#### Refresh Interval
- Range: 5-300 seconds
- Default: 30 seconds
- Lower values = more frequent updates = more API calls
- Higher values = less frequent updates = reduced server load

## Display Layout

Each sensor appears as a card showing:

```
🌡️ [Sensor Name]
   [Model]
   
   Temperature  [23.5°C / 74.3°F]
   Humidity     [45.2%]
   Light Level  [125 lux]
   
   ● Connected  |  2m ago
```

## API Integration

The widget uses the dashboard's backend proxy to communicate with UniFi Protect:

### Endpoint
```
GET /api/unifi-protect/bootstrap
```

### Parameters
- `host`: UniFi Protect console URL
- `credentialId`: ID of saved credential

### Response
```json
{
  "cameras": [...],
  "events": [...],
  "sensors": [
    {
      "id": "sensor-id",
      "name": "Living Room Sensor",
      "model": "USL-Environmental",
      "isConnected": true,
      "stats": {
        "temperature": {
          "value": 23.5,
          "unit": "celsius"
        },
        "humidity": {
          "value": 45.2,
          "unit": "percent"
        },
        "light": {
          "value": 125,
          "unit": "lux"
        }
      }
    }
  ]
}
```

## Troubleshooting

### No Sensors Displayed

**Possible Causes:**
1. No USL-Environmental devices adopted
2. Devices not connected
3. Console URL incorrect
4. Credentials invalid

**Solutions:**
- Verify devices in UniFi Protect dashboard
- Check device connection status
- Test console URL in browser
- Re-enter credentials

### "Authentication required" Error

**Cause:** Dashboard authentication issue

**Solution:**
1. Log out of dashboard
2. Log back in
3. Refresh the widget

### "Failed to fetch sensor data" Error

**Possible Causes:**
1. Console unreachable
2. Network connectivity issue
3. UniFi Protect service down
4. Credentials expired

**Solutions:**
- Verify console accessibility
- Check network connection
- Restart UniFi Protect service
- Update saved credentials

### Stale Data / Not Updating

**Cause:** Refresh not working

**Solutions:**
1. Click the **Refresh** button manually
2. Check browser console for errors
3. Verify refresh interval setting
4. Try increasing refresh interval
5. Save widget configuration again

### Data Shows "-- / --"

**Cause:** Sensor not reporting that metric

**Possible Reasons:**
- Sensor doesn't support that metric
- Sensor initializing
- Sensor malfunction

**Solutions:**
- Wait a few minutes for initialization
- Check sensor in UniFi Protect dashboard
- Restart sensor if needed

## Best Practices

### Refresh Intervals
- **Real-time monitoring**: 10-30 seconds
- **Casual monitoring**: 60-120 seconds
- **Low bandwidth**: 180-300 seconds

Environmental data changes slowly, so 30-60 seconds is typically sufficient.

### Multiple Sensors
- Widget automatically displays all sensors in a grid
- Cards resize based on widget dimensions
- Minimum 280px width per card recommended

### Widget Sizing
- **Single sensor**: 300x350px minimum
- **Two sensors**: 600x350px minimum
- **Three+ sensors**: Use full width, adjust height

### Credential Security
- Use a dedicated UniFi Protect account
- Limit account to viewer permissions if possible
- Rotate passwords periodically
- Don't share credential IDs

## Performance

### Resource Usage
- **API Calls**: 1 per refresh interval
- **Bandwidth**: ~5-20KB per update
- **Memory**: Minimal (<5MB per widget)
- **CPU**: Negligible

### Optimization Tips
1. Increase refresh interval for better performance
2. Disable unused metrics to reduce processing
3. Limit number of sensor widgets per dashboard

## Related Widgets

- **UniFi Protect**: Camera and detection monitoring
- **UniFi**: Network device statistics
- **COMET P8541**: Alternative temperature/humidity sensor

## Technical Details

### Widget Type
`unifi-sensor`

### Technology
- TypeScript/JavaScript
- REST API integration
- Token-based authentication
- Responsive CSS Grid layout

### Browser Support
- Modern browsers (Chrome, Firefox, Safari, Edge)
- ES6+ JavaScript required
- CSS Grid support required

## Future Enhancements

Planned features:
- [ ] Historical data graphs
- [ ] Temperature alerts/thresholds
- [ ] Sensor selection filter
- [ ] Export data to CSV
- [ ] Multiple console support
- [ ] Custom units (Kelvin)

## Contributing

To extend or modify the widget:

1. Edit [unifi-sensor.ts](../src/widgets/unifi-sensor.ts)
2. Update backend in [widgets.js](../ping-server/routes/widgets.js)
3. Test with actual USL-Environmental device
4. Follow TypeScript and ESLint standards

## License

Part of the Dashboard project. See main LICENSE file.

## Support

For issues:
1. Check browser console (F12)
2. Verify UniFi Protect access
3. Review widget configuration
4. Check network connectivity
5. Consult main Dashboard documentation
