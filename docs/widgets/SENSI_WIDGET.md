# Sensi Thermostat Widget

Monitor and control Sensi WiFi thermostats from your dashboard.

## Overview

The Sensi widget provides full control and monitoring of Sensi WiFi thermostats, allowing you to adjust temperature, change modes, and monitor HVAC status.

## Requirements

- Sensi WiFi Thermostat
- Sensi account at manager.sensicomfort.com
- Thermostat connected to WiFi
- Refresh token from Sensi

## Setup

### Step 1: Obtain Refresh Token

1. Open Chrome/Edge browser and go to [manager.sensicomfort.com](https://manager.sensicomfort.com/)
2. Press **F12** to open DevTools and select the **Network** tab
3. Log in with your Sensi credentials
4. In DevTools Network tab, find the `token?device=` request and click on it
5. Select the **Response** tab (not the URL!)
6. Copy the `refresh_token` value from the JSON response body (it's a long random string)

**⚠ Important:** Do NOT copy the URL or the `device=` parameter. The refresh token is in the *response body*, not the URL.

### Step 2: Store Credential

1. Go to Credentials Manager (user menu → Credentials)
2. Click "Add New Credential"
3. Configure:
   - **Name**: `Sensi Thermostat` (or your preferred name)
   - **Service Type**: `sensi`
   - **Field Name**: `refresh_token`
   - **Value**: Paste the refresh token you copied
4. Save the credential

### Step 3: Configure Widget

1. Add Sensi widget to dashboard
2. Select credential from Credential Manager dropdown
3. Widget will auto-discover your thermostats
4. Choose thermostat if you have multiple

## Features

### Monitoring
- Current temperature display
- Humidity levels
- Operating mode (Heat, Cool, Auto, Off)
- Fan mode status
- HVAC demand status (heating/cooling active)
- Battery status
- WiFi signal strength

### Control
- Adjust temperature setpoints
- Change system mode (Heat/Cool/Auto/Off)
- Control fan operation
- Set hold/schedule modes
- Temperature scale (°F/°C)

### Display
- Clean card-based interface
- Color-coded status indicators
- Real-time updates
- Battery and connectivity warnings

## Configuration Options

- **Credentials**: Sensi account authentication
- **Device Selection**: Choose specific thermostat (if multiple)
- **Refresh Interval**: Update frequency (default: 30 seconds)
- **Temperature Scale**: Fahrenheit or Celsius

## Troubleshooting

**Cannot connect to Sensi**
- Verify credentials are correct
- Check Sensi app works with same credentials
- Ensure thermostat is online

**Commands not working**
- Check thermostat is not in schedule override
- Verify temperature is within valid range
- Wait for previous command to complete

**Stale data**
- Check thermostat WiFi connection
- Increase refresh interval if rate-limited
- Restart thermostat if non-responsive
