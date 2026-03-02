# Pi-hole Widget

Display Pi-hole DNS blocking statistics.

## Requirements

- Pi-hole instance
- Pi-hole credentials stored in Credential Manager (required)

## Setup

1. Get API key or application password from Pi-hole:
   - Settings → API → Show API token
2. Store in Credential Manager:
   - Go to user menu → Credentials
   - Add new credential
   - Service Type: Pi-hole
   - Save username/password or API key
3. Add widget
4. Configure:
   - Pi-hole URL: `http://pi.hole/admin`
   - Credentials: Select from dropdown (required)

## Display

- Total queries (24h)
- Queries blocked (24h)
- Percent blocked
- Domains on blocklist
- Status (enabled/disabled)

## Actions

- Enable/disable blocking
- Refresh statistics
