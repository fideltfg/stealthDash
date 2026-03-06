# Modbus Plugin

Modbus TCP read endpoint for querying industrial sensors and PLCs.

## Routes

### `GET /modbus/read`

Read register or coil values from a Modbus TCP device.

| Parameter | Type | In | Required | Default | Description |
|-----------|------|-----|----------|---------|-------------|
| `host` | string | query | Yes | — | Device IP address or hostname |
| `port` | number | query | No | `502` | Modbus TCP port |
| `address` | number | query | Yes | — | Starting register/coil address |
| `count` | number | query | No | `1` | Number of registers/coils to read |
| `type` | string | query | No | `holding` | Register type: `coil`, `discrete`, `input`, `holding` |
| `unitId` | number | query | No | `1` | Modbus unit/slave ID |

**Response:**
```json
{
  "success": true,
  "host": "192.168.1.100",
  "port": 502,
  "unitId": 1,
  "address": 0,
  "count": 4,
  "type": "holding",
  "data": [2345, 6789, 1234, 5678],
  "timestamp": "2026-03-06T12:00:00.000Z"
}
```

## Authentication

None required — endpoint is public.

## Register Types

| Type | Description |
|------|-------------|
| `coil` | Read coils (boolean on/off values) |
| `discrete` | Read discrete inputs (boolean, read-only) |
| `input` | Read input registers (16-bit, read-only) |
| `holding` | Read holding registers (16-bit, read/write) |

## Notes

- 3-second connection timeout, 5-second read timeout
- Returns raw register/coil values — interpretation depends on the device
- Client connections are properly cleaned up after each request
- Used by the Comet P8541 widget for temperature/humidity readings
