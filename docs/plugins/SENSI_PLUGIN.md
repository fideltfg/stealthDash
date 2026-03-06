# Sensi Thermostat Plugin

Sensi WiFi thermostat integration via Socket.IO — read state and control temperature, HVAC mode, and fan.

## Routes

All routes accept either `credentialId` or `refreshToken` — one is required.

### `POST /sensi/state`

Get the current state of all thermostats on the account.

**Body:**
```json
{ "credentialId": 1 }
```

**Response:**
```json
{
  "success": true,
  "devices": [
    {
      "icd_id": "...",
      "temperature": 72,
      "humidity": 45,
      "mode": "heat",
      "setpoint_heat": 70,
      "setpoint_cool": 76,
      "fan_mode": "auto",
      "battery": "ok",
      "signal": "good"
    }
  ]
}
```

### `POST /sensi/set-temperature`

Set the target temperature.

**Body:**
```json
{
  "credentialId": 1,
  "icd_id": "device-id",
  "scale": "F",
  "mode": "heat",
  "target_temp": 72
}
```

### `POST /sensi/set-mode`

Change the HVAC mode.

**Body:**
```json
{
  "credentialId": 1,
  "icd_id": "device-id",
  "value": "heat"
}
```

Supported modes: `off`, `heat`, `cool`, `auto`, `aux`

### `POST /sensi/set-fan`

Set fan mode.

**Body:**
```json
{
  "credentialId": 1,
  "icd_id": "device-id",
  "value": "auto"
}
```

Supported modes: `auto`, `on`

## Authentication

Uses Sensi OAuth2 with a refresh token. The plugin handles token refresh automatically.

## Token Caching

- Access tokens cached in memory with auto-refresh (30 seconds before expiry)
- New refresh tokens from the Sensi API are automatically persisted to the stored credential

## Credential Setup

1. Go to [manager.sensicomfort.com](https://manager.sensicomfort.com)
2. Open browser DevTools → Network tab
3. Log in and find the `token` request
4. Copy the `refresh_token` from the response
5. Store in Credential Manager with service type `sensi` and field `refresh_token`

## Notes

- Connects to Sensi via Socket.IO (`https://rt.sensiapi.io`)
- State retrieval has a 15-second timeout; commands have a 10-second timeout
- State events are accumulated from multiple Socket.IO messages
- Validates refresh tokens and provides helpful error messages for common issues.
