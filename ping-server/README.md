# Ping Server

Simple backend service for performing network pings from the dashboard uptime widget.

## Features

- Real ICMP ping capability (not just HTTP checks)
- Works with IPs and hostnames
- Configurable timeout
- CORS enabled for dashboard access
- Lightweight Node.js service

## API Endpoints

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "ping-server"
}
```

### GET /ping/:target
Ping a single target.

**Parameters:**
- `target` (path): IP address or hostname
- `timeout` (query, optional): Timeout in seconds (default: 5)

**Example:**
```
GET http://localhost:3001/ping/192.168.1.1?timeout=3
```

**Response:**
```json
{
  "target": "192.168.1.1",
  "success": true,
  "responseTime": 12.5,
  "totalTime": 15,
  "timestamp": 1699000000000
}
```

### POST /ping-batch
Ping multiple targets at once.

**Request Body:**
```json
{
  "targets": ["google.com", "192.168.1.1"],
  "timeout": 5
}
```

**Response:**
```json
{
  "results": [
    {
      "target": "google.com",
      "success": true,
      "responseTime": 23.4,
      "timestamp": 1699000000000
    },
    {
      "target": "192.168.1.1",
      "success": false,
      "responseTime": null,
      "timestamp": 1699000000000
    }
  ]
}
```

## Running with Docker

```bash
cd ping-server
docker build -t ping-server .
docker run -p 3001:3001 ping-server
```

## Running Standalone

```bash
cd ping-server
npm install
npm start
```

## Environment Variables

- `PING_SERVER_PORT` - Port to run on (default: 3001)

## Notes

- Requires elevated permissions for ICMP ping in some environments
- The ping package handles cross-platform compatibility
