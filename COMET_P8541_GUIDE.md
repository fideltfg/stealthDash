# Comet System P8541 Widget - Configuration Guide

The **Comet P8541** widget displays all configured temperature, humidity, and pressure channels from your Comet System P8541 multi-channel sensor via Modbus TCP.

## Features

✅ **Multi-channel display** - Shows all enabled channels in one widget  
✅ **4 Temperature channels** - Independent temperature sensors  
✅ **Humidity monitoring** - Relative humidity reading  
✅ **Optional pressure** - Barometric pressure (if equipped)  
✅ **Dew point calculation** - Computed dew point temperature  
✅ **Color-coded values** - Visual feedback based on readings  
✅ **Alarm indicators** - Shows alarm status for each channel  
✅ **Auto-refresh** - Configurable update intervals  
✅ **Unit conversion** - Celsius or Fahrenheit  

---

## Quick Start Configuration

### Basic Setup (Celsius, All Channels)

```json
{
  "host": "192.168.1.100",
  "port": 502,
  "unitId": 1,
  "refreshInterval": 10,
  "enabledChannels": {
    "temp1": true,
    "temp2": true,
    "temp3": true,
    "temp4": true,
    "humidity": true,
    "pressure": false,
    "dewPoint": false
  },
  "temperatureUnit": "C",
  "showAlarms": true
}
```

### Fahrenheit with Selected Channels

```json
{
  "host": "192.168.1.100",
  "port": 502,
  "unitId": 1,
  "refreshInterval": 10,
  "enabledChannels": {
    "temp1": true,
    "temp2": true,
    "temp3": false,
    "temp4": false,
    "humidity": true,
    "pressure": false,
    "dewPoint": true
  },
  "temperatureUnit": "F",
  "showAlarms": true
}
```

### Fast Refresh for Critical Monitoring

```json
{
  "host": "192.168.1.100",
  "port": 502,
  "unitId": 1,
  "refreshInterval": 5,
  "enabledChannels": {
    "temp1": true,
    "temp2": true,
    "temp3": true,
    "temp4": true,
    "humidity": true,
    "pressure": true,
    "dewPoint": true
  },
  "temperatureUnit": "C",
  "showAlarms": true
}
```

---

## Configuration Reference

### Connection Settings

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `host` | string | **required** | IP address of P8541 device |
| `port` | number | 502 | Modbus TCP port |
| `unitId` | number | 1 | Modbus unit/slave ID |
| `refreshInterval` | number | 10 | Update interval in seconds |

### Channel Configuration

Enable/disable individual channels:

| Channel | Field | Description |
|---------|-------|-------------|
| Temperature 1 | `enabledChannels.temp1` | First temperature probe |
| Temperature 2 | `enabledChannels.temp2` | Second temperature probe |
| Temperature 3 | `enabledChannels.temp3` | Third temperature probe |
| Temperature 4 | `enabledChannels.temp4` | Fourth temperature probe |
| Humidity | `enabledChannels.humidity` | Relative humidity sensor |
| Pressure | `enabledChannels.pressure` | Barometric pressure (if equipped) |
| Dew Point | `enabledChannels.dewPoint` | Calculated dew point |

**Default**: All channels except pressure and dew point are enabled

### Display Settings

| Field | Options | Default | Description |
|-------|---------|---------|-------------|
| `temperatureUnit` | `'C'` or `'F'` | `'C'` | Temperature display unit |
| `showAlarms` | `boolean` | `true` | Show alarm indicators |

---

## Modbus Register Map

The widget uses the standard Comet System P8541 Modbus register layout:

### Input Registers (Read-Only)

| Address | Channel | Data Type | Scaling | Description |
|---------|---------|-----------|---------|-------------|
| 0 | Temperature 1 | int16 | ÷ 10 | First temperature probe (°C) |
| 2 | Temperature 2 | int16 | ÷ 10 | Second temperature probe (°C) |
| 4 | Temperature 3 | int16 | ÷ 10 | Third temperature probe (°C) |
| 6 | Temperature 4 | int16 | ÷ 10 | Fourth temperature probe (°C) |
| 8 | Humidity | int16 | ÷ 10 | Relative humidity (%RH) |
| 10 | Pressure | int16 | ÷ 10 | Barometric pressure (hPa) |
| 12 | Dew Point | int16 | ÷ 10 | Calculated dew point (°C) |

### Coils (Alarm Status)

| Address | Channel | Description |
|---------|---------|-------------|
| 20 | Temperature 1 Alarm | 1 = Alarm active, 0 = Normal |
| 21 | Temperature 2 Alarm | 1 = Alarm active, 0 = Normal |
| 24 | Humidity Alarm | 1 = Alarm active, 0 = Normal |

**Note**: If your P8541 uses different register addresses, you may need to modify the widget code. Check your device manual or contact Comet System support for the exact register map.

---

## Color Coding

### Temperature Colors

- 🔵 **Blue** (< 10°C) - Cold
- 🔷 **Cyan** (10-20°C) - Cool
- 🟢 **Green** (20-25°C) - Comfortable
- 🟠 **Orange** (25-30°C) - Warm
- 🔴 **Red** (> 30°C) - Hot

### Humidity Colors

- 🟠 **Orange** (< 30%RH) - Too dry
- 🟢 **Green** (30-60%RH) - Comfortable
- 🔵 **Blue** (> 60%RH) - High humidity

### Alarm Indicators

When `showAlarms: true`, channels with active alarms will:
- Display a ⚠️ warning icon
- Have a pulsing red glow effect
- Indicate alarm conditions set on the device

---

## How to Add to Dashboard

1. **Click "+ Add Widget"** button
2. **Select "Comet P8541" (🌡️ icon)**
3. **Edit the widget** (click pencil icon)
4. **Configure your settings**:
   - Set `host` to your P8541's IP address
   - Adjust enabled channels
   - Set temperature unit (C or F)
   - Configure refresh interval
5. **Save** and watch your data appear!

---

## Example Configurations

### Server Room Monitoring

Monitor multiple zones with 4 temperature sensors:

```json
{
  "host": "192.168.1.50",
  "port": 502,
  "unitId": 1,
  "refreshInterval": 15,
  "enabledChannels": {
    "temp1": true,
    "temp2": true,
    "temp3": true,
    "temp4": true,
    "humidity": true,
    "pressure": false,
    "dewPoint": true
  },
  "temperatureUnit": "C",
  "showAlarms": true
}
```

### HVAC Control Room

Focus on temperature and humidity with fast updates:

```json
{
  "host": "192.168.1.51",
  "port": 502,
  "unitId": 1,
  "refreshInterval": 5,
  "enabledChannels": {
    "temp1": true,
    "temp2": false,
    "temp3": false,
    "temp4": false,
    "humidity": true,
    "pressure": false,
    "dewPoint": true
  },
  "temperatureUnit": "F",
  "showAlarms": true
}
```

### Warehouse with Multiple Sensors

All channels active for comprehensive monitoring:

```json
{
  "host": "192.168.1.52",
  "port": 502,
  "unitId": 1,
  "refreshInterval": 30,
  "enabledChannels": {
    "temp1": true,
    "temp2": true,
    "temp3": true,
    "temp4": true,
    "humidity": true,
    "pressure": true,
    "dewPoint": true
  },
  "temperatureUnit": "C",
  "showAlarms": true
}
```

---

## Troubleshooting

### Widget shows "Please configure Modbus host address"

**Solution**: Edit the widget and set the `host` field to your P8541's IP address.

### No data displayed / "Reading..." never updates

**Possible causes**:
1. **Network connectivity** - Verify you can ping the device: `ping 192.168.1.100`
2. **Wrong IP address** - Double-check the IP in device configuration
3. **Firewall blocking Modbus** - Ensure port 502 is accessible
4. **Modbus not enabled** - Check P8541 configuration to enable Modbus TCP
5. **Wrong Unit ID** - Verify the Modbus slave ID matches device settings

### Some channels show "---"

**Solution**: Those channels may not be connected or configured on the device. You can disable them in the widget configuration.

### Alarm indicators not working

**Solution**: 
- Verify `showAlarms: true` is set
- Check if alarms are configured on the P8541 device
- Some P8541 models may not support alarm coils

### Wrong temperature values

**Possible causes**:
- **Scaling issue**: P8541 stores values as `value × 10`. Widget divides by 10.
- **Register mismatch**: Your device may use different register addresses

---

## Testing the Modbus Connection

Test Modbus connectivity directly:

```bash
# Read Temperature 1 (register 0)
curl "http://localhost:3001/modbus/read?host=192.168.1.100&port=502&address=0&type=input&count=1&unitId=1"

# Expected response:
{
  "success": true,
  "data": [235],  // 23.5°C
  "timestamp": 1762148755000
}
```

If this returns data, your Modbus connection is working!

---

## Multiple P8541 Devices

To monitor multiple P8541 sensors:

1. Add multiple Comet P8541 widgets
2. Configure each with a different IP address
3. Optionally use different Unit IDs if on same IP

Example: 3 devices monitoring different zones:
- Widget 1: `host: "192.168.1.100"` - Zone A
- Widget 2: `host: "192.168.1.101"` - Zone B
- Widget 3: `host: "192.168.1.102"` - Zone C

---

## Tips

💡 **Refresh interval**: Use 5-10s for critical monitoring, 30-60s for general monitoring  
💡 **Channel layout**: Disable unused channels for cleaner display  
💡 **Alarm configuration**: Set alarm thresholds on the P8541 device itself  
💡 **Unit ID**: Most P8541 devices default to Unit ID 1  
💡 **Widget size**: Resize taller to show more channels comfortably  
💡 **Color coding**: Use visual feedback to quickly spot issues  

---

## Device Documentation

For complete P8541 specifications and Modbus register details, refer to:
- **Product Manual**: [Comet System P8541 Documentation](https://www.cometsystem.com/products/p8541-pressure-transmitter-with-ethernet/ie-snc-p85x1)
- **Modbus Guide**: Contact Comet System support for register map

---

**Your Comet P8541 monitoring is ready! 🌡️📊**
