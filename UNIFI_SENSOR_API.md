# UniFi Environmental Sensors API

A simple **public** REST API endpoint for retrieving temperature, humidity, and light data from UniFi USL-Environmental devices.

## Endpoint

```
GET http://your-dashboard:3001/api/unifi-protect/sensors?host=<unifi-protect-host>
```

## Authentication

**No authentication required** - This is a public endpoint that automatically uses the first UniFi Protect (or UniFi) credentials stored in the database.

## Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `host` | string | Yes | UniFi Protect console URL (e.g., `https://192.168.1.1`). Must include protocol (https://). |

## Example Request

```bash
# Request with host parameter
curl -X GET "http://localhost:3001/api/unifi-protect/sensors?host=https://192.168.1.1"

# Or from a remote machine
curl -X GET "http://192.168.1.100:3001/api/unifi-protect/sensors?host=https://192.168.1.1"
```

## Response Format

### Success Response (200 OK)

```json
{
  "success": true,
  "timestamp": "2026-01-01T12:00:00.000Z",
  "host": "https://192.168.1.1",
  "sensorCount": 2,
  "sensors": [
    {
      "id": "62e1234567890abcdef12345",
      "name": "Living Room Sensor",
      "type": "sensor",
      "model": "USL-Environmental",
      "mac": "FC:EC:DA:XX:XX:XX",
      "state": "CONNECTED",
      "isConnected": true,
      "lastSeen": 1735689600000,
      "lastSeenReadable": "2026-01-01T12:00:00.000Z",
      "temperature": {
        "value": 23.5,
        "celsius": 23.5,
        "fahrenheit": 74.3,
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
    },
    {
      "id": "62e9876543210fedcba98765",
      "name": "Bedroom Sensor",
      "type": "sensor",
      "model": "USL-Environmental",
      "mac": "FC:EC:DA:YY:YY:YY",
      "state": "CONNECTED",
      "isConnected": true,
      "lastSeen": 1735689590000,
      "lastSeenReadable": "2026-01-01T11:59:50.000Z",
      "temperature": {
        "value": 21.8,
        "celsius": 21.8,
        "fahrenheit": 71.2,
        "unit": "celsius"
      },
      "humidity": {
        "value": 52.1,
        "unit": "percent"
      },
      "light": {
        "value": 45,
        "unit": "lux"
      }
    }
  ]
}
```

### Error Responses

#### 404 Not Found
```json
{
  "error": "No UniFi Protect credentials found",
  "details": "Please configure credentials in the Dashboard first"
}
```

#### 400 Bad Request
```json
{
  "error": "Missing host parameter",
  "details": "Provide host parameter or configure it in credentials"
}
```

#### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Connection timeout",
  "details": "Failed to fetch sensor data. Check if console is accessible and credentials are correct."
}
```

## Setup

The API automatically uses the first UniFi Protect credential found in the Dashboard database. Make sure you have configured credentials:

1. Log into the Dashboard
2. Go to **Credentials Manager**
3. Click **Add New Credential**
4. Fill in:
   - Name: "UniFi Protect"
   - Service Type: "Basic", "UniFi", or "UniFi Protect"
   - Username: UniFi Protect local admin username
   - Password: UniFi Protect local admin password
   - (Optional) Add `host` field in the credential data
5. Save the credential

The API will automatically find and use these credentials.

## Use Cases

### Home Automation
```python
import requests

API_URL = "http://your-dashboard:3001/api/unifi-protect/sensors"

response = requests.get(API_URL)
data = response.json()

for sensor in data["sensors"]:
    print(f"{sensor['name']}: {sensor['temperature']['celsius']}°C")
```

### Node.js Application
```javascript
const axios = require('axios');

const API_URL = 'http://your-dashboard:3001/api/unifi-protect/sensors';

async function getSensorData() {
  try {
    const response = await axios.get(API_URL);
    return response.data.sensors;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

getSensorData().then(sensors => {
  sensors.forEach(sensor => {
    console.log(`${sensor.name}: ${sensor.temperature.celsius}°C`);
  });
});
```

### Bash Script
```bash
#!/bin/bash

API_URL="http://localhost:3001/api/unifi-protect/sensors"

curl -s -X GET "${API_URL}" \
  | jq '.sensors[] | "\(.name): \(.temperature.celsius)°C, \(.humidity.value)%"'
```

## Data Fields Explained

### Sensor Object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique sensor identifier |
| `name` | string | User-assigned sensor name |
| `type` | string | Device type (usually "sensor") |
| `model` | string | Device model (e.g., "USL-Environmental") |
| `mac` | string | MAC address of the device |
| `state` | string | Connection state ("CONNECTED", "DISCONNECTED") |
| `isConnected` | boolean | Whether device is currently connected |
| `lastSeen` | number | Unix timestamp (milliseconds) of last communication |
| `lastSeenReadable` | string | ISO 8601 formatted timestamp |

### Temperature Object (if available)

| Field | Type | Description |
|-------|------|-------------|
| `value` | number | Temperature in original unit (usually Celsius) |
| `celsius` | number | Temperature in Celsius |
| `fahrenheit` | number | Temperature in Fahrenheit |
| `unit` | string | Original unit ("celsius") |

### Humidity Object (if available)

| Field | Type | Description |
|-------|------|-------------|
| `value` | number | Relative humidity percentage |
| `unit` | string | Unit ("percent") |

### Light Object (if available)

| Field | Type | Description |
|-------|------|-------------|
| `value` | number | Light level in lux |
| `unit` | string | Unit ("lux") |

## Rate Limiting

- API uses cached UniFi Protect sessions (30 minutes)
- Recommended polling interval: 30-60 seconds
- No hard rate limit, but excessive requests may be throttled

## CORS

CORS is enabled with `Access-Control-Allow-Origin: *` for external access.

## Security Considerations

1. **Network Access**: This is a **public endpoint** - restrict access at the firewall/reverse proxy level
2. **Internal Use Only**: Recommended for use on trusted internal networks only
3. **Reverse Proxy**: Use nginx/Caddy with authentication if exposing to the internet
4. **Read-Only**: API only reads data, cannot modify UniFi Protect settings
5. **Credential Storage**: Credentials are encrypted in the database
6. **Session Caching**: Sessions are cached in memory only (not persisted)

### Example: Protect with Basic Auth (nginx)

```nginx
location /api/unifi-protect/sensors {
    auth_basic "Restricted";
    auth_basic_user_file /etc/nginx/.htpasswd;
    proxy_pass http://localhost:3001;
}
```

## Troubleshooting

### "No UniFi Protect credentials found" error
- Configure credentials in Dashboard Credentials Manager
- Ensure service type is "unifi", "unifi-protect", "basic", or "custom"

### "Missing host parameter" error
- Add `?host=https://your-protect-console` to the URL
- Or configure the host in the credential data

### "Failed to fetch sensor data" error
- Verify UniFi Protect console is accessible
- Check that credentials are correct
- Ensure USL-Environmental device is adopted and connected

### No sensors in response
- Verify device is adopted in UniFi Protect
- Check device shows "Connected" status
- Wait a few minutes for device to initialize

## Support

For issues or questions:
1. Check ping-server logs: `docker compose logs -f ping-server`
2. Verify UniFi Protect API access
3. Test with the standalone web app first
4. Check Dashboard documentation

## Related Documentation

- [Standalone Web App](../unifi-protect/README.md)
- [Dashboard Widget](UNIFI_SENSOR_WIDGET.md)
- [UniFi Protect Widget](UNIFI_PROTECT_WIDGET.md)
- [Dashboard API Documentation](DOCUMENTATION.md)
