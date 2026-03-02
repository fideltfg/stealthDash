# Home Assistant Widget

Display sensor data from Home Assistant.

## Requirements

- Home Assistant instance
- Long-lived access token

## Setup

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

## Example Entities

```
sensor.living_room_temperature
sensor.bedroom_humidity
light.kitchen
switch.fan
```

## Display

- Entity state and value
- Last updated time
- Unit of measurement
- Icon (if available)
