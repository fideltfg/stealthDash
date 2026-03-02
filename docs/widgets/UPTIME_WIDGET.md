# Uptime Widget

Monitor network connectivity with real-time ping.

## Features

- Single target monitoring
- Visual latency bar chart
- Success/failure statistics
- Historical data (last 20 pings)
- Configurable ping interval and timeout

## Configuration

1. Add widget to dashboard
2. Click to configure
3. Enter target:
   - **Target**: Domain name or IP address (e.g., `google.com` or `192.168.1.1`)
   - **Ping Interval**: Time between pings in seconds (default: 30)
   - **Timeout**: Maximum wait time in milliseconds (default: 5000)
4. View real-time ping status

## Display

- Target hostname/IP at top
- Color-coded bar chart showing response times:
  - **Green**: Excellent (\<50ms)
  - **Light Green**: Good (50-150ms)
  - **Yellow**: OK (150-300ms)
  - **Orange**: Slow (300-1000ms)
  - **Red**: Very slow or failed (\>1000ms or timeout)
- Statistics:
  - **Uptime**: Percentage of successful pings
  - **Avg**: Average response time
  - **Samples**: Number of pings collected (max 20)

## How It Works

- Widget sends ping requests at specified interval
- Displays last 20 ping results as horizontal bars
- Bar height represents response time
- Failed pings shown at full height in red
- Hover over bars to see timestamp and exact response time

## Requirements

- Ping server must be running
- Target must be reachable from server
- Server must have ping capabilities enabled
