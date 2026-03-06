# SNMP Plugin

SNMP query endpoint for monitoring network devices.

## Routes

### `GET /snmp/get`

Query SNMP OIDs from a device.

| Parameter | Type | In | Required | Default | Description |
|-----------|------|-----|----------|---------|-------------|
| `host` | string | query | Yes | — | Device IP or hostname |
| `oids` | string | query | Yes | — | Comma-separated OID list |
| `community` | string | query | No | `public` | SNMP community string |
| `credentialId` | number | query | No | — | Credential containing community string |

**Response:**
```json
{
  "success": true,
  "host": "192.168.1.1",
  "community": "public",
  "data": [
    { "oid": "1.3.6.1.2.1.1.1.0", "type": "OctetString", "value": "Linux router" },
    { "oid": "1.3.6.1.2.1.1.3.0", "type": "TimeTicks", "value": 123456 }
  ],
  "timestamp": "2026-03-06T12:00:00.000Z"
}
```

## Authentication

None required — uses the SNMP community string for device access.

Optionally pass `credentialId` to read the community string from a stored credential.

## Notes

- 10-second query timeout
- Buffer values are automatically converted to UTF-8 strings
- SNMP errors in individual varbinds are included in the response
- Session is closed after each request
- Used by the Comet P8541 widget for temperature/humidity sensor readings
