# Speedtest Widget

Display internet speed test results from a self-hosted Speedtest Tracker instance.

## Overview

Connect to a Speedtest Tracker server to view download/upload speeds and latency over time with historical charts and statistics. This widget displays results from an external Speedtest Tracker instance - it does not run tests itself.

## Features

### Speed Testing
- Download speed measurement (Mbps)
- Upload speed measurement (Mbps)
- Ping latency (ms)
- Jitter measurement
- Server location information

### Visualization
- Historical speed charts
- Trend analysis
- Color-coded performance indicators
- Last test timestamp

### Automation
- Scheduled automatic tests
- Configurable test intervals
- Test result history

## Requirements

- Self-hosted Speedtest Tracker instance (https://github.com/alexjustesen/speedtest-tracker)
- Network access to Speedtest Tracker server
- Optional: API token if authentication is enabled

## Setup

1. Install and run Speedtest Tracker on your server

2. Store credentials in Credential Manager (if auth enabled):
   - Service Type: Speedtest Tracker
   - API Token: Your tracker API token

3. Add Speedtest widget to dashboard

4. Configure:
   - Speedtest Tracker URL: `http://speedtest.local:8765`
   - Credentials: Select if authentication required
   - History Range: Number of days to display (default: 7)
   - Refresh Interval: Update frequency in seconds

## Configuration Options

- **Speedtest Tracker URL**: URL of your Speedtest Tracker instance
- **Credentials**: API token credential (if auth is enabled)
- **Show History Chart**: Display download/upload speed chart
- **History Range**: Number of days of results to display (1-90)
- **Refresh Interval**: How often to fetch new data (seconds)

## Display

### Speed Cards
- Download speed with trend indicator
- Upload speed with trend indicator
- Ping latency measurement
- Jitter (connection stability)

### Historical Chart
- Download speeds over time (green line)
- Upload speeds over time (blue line)
- Performance trends
- Peak/average annotations

## Usage Tips

**Refresh Interval**
- Frequent updates (30-60 seconds): Real-time monitoring
- Moderate updates (5 minutes): General monitoring
- Infrequent updates (15-30 minutes): Light usage

**Test Scheduling**
- Configure test schedule in your Speedtest Tracker instance
- This widget only displays results, it does not trigger tests
- Ensure Speedtest Tracker is scheduling tests as desired

**Data Retention**
- Adjust history range (days) based on your needs
- Longer ranges show broader trends
- Shorter ranges show recent performance

## Troubleshooting

**Cannot connect to Speedtest Tracker**
- Verify Speedtest Tracker URL is correct
- Check Speedtest Tracker is running and accessible
- Verify network connectivity

**Authentication errors**
- Ensure API token is correct in Credential Manager
- Check Speedtest Tracker authentication settings

**No history showing**
- Ensure Speedtest Tracker has run tests and has data
- Check that tests are being scheduled in Speedtest Tracker
- Verify date range is appropriate
