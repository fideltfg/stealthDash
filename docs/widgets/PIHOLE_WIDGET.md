# Pi-hole Widget

Display Pi-hole DNS blocking statistics.

## Requirements

- Pi-hole instance
- API key (optional but recommended)

## Setup

1. Get API key from Pi-hole:
   - Settings → API → Show API token
2. Store in Credential Manager
3. Add widget
4. Configure:
   - Pi-hole URL: `http://pi.hole/admin`
   - API Key: Select from credentials

## Display

- Total queries (24h)
- Queries blocked (24h)
- Percent blocked
- Domains on blocklist
- Status (enabled/disabled)

## Actions

- Enable/disable blocking
- Refresh statistics
