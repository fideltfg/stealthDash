# UniFi Widget

Monitor UniFi network devices and clients.

## Requirements

- UniFi Controller
- Controller credentials

## Setup

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

## Display

- Connected clients count
- Device status (online/offline)
- Uplink status
- WAN IP
- Network traffic
