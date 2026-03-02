# UniFi Widget

Monitor UniFi network devices and clients.

## Requirements

- UniFi Controller
- Controller credentials

## Setup

1. Store credentials in Credential Manager:
   - Go to user menu → Credentials
   - Add new credential
   - Service Type: UniFi
   - Host: `https://unifi.local:8443`
   - Username: Your UniFi admin username
   - Password: Your UniFi admin password
2. Add widget
3. Configure:
   - Select saved credential from dropdown
   - Site: `default` (or your site name)

## Display

- Connected clients count
- Device status (online/offline)
- Uplink status
- WAN IP
- Network traffic
