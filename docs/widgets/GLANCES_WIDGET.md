# Glances Widget

Monitor system resources and performance metrics from a Glances server.

## Overview

The Glances widget displays comprehensive system monitoring data including CPU, memory, disk I/O, network, sensors, containers, and GPU metrics.

## Requirements

- Glances server running on monitored system
- Network access to Glances web interface
- Glances credentials (if authentication is enabled)

## Setup

1. Install and run Glances on target system:
   ```bash
   pip install glances
   glances -w  # Start web server mode
   ```

2. Store credentials in Credential Manager (if needed):
   - Name: `glances_server`
   - URL: `http://server:61208`
   - Password: (if authentication enabled)

3. Add Glances widget to dashboard

4. Configure:
   - Server URL: `http://server:61208`
   - Credentials: Select from Credential Manager
   - Refresh Interval: Auto-update frequency

## Displayed Metrics

### System Overview
- CPU usage (total, user, system, I/O wait)
- Per-core CPU utilization
- Memory usage (used, available, buffers, cached)
- Swap usage
- System load averages (1, 5, 15 minutes)

### Storage
- Filesystem usage per mount point
- Disk I/O rates (read/write bytes and operations)

### Network
- Network interface traffic (RX/TX rates)
- Interface speed capabilities

### Advanced Metrics
- Running containers (Docker/Podman)
- Hardware sensors (temperature, fan speeds)
- GPU utilization and temperature
- Process counts (total, running, sleeping)
- System uptime and information

## Features

- Real-time sparkline graphs for historical trends
- Color-coded progress bars for resource usage
- Responsive card-based layout
- Auto-refresh with configurable intervals
- Support for multiple data views

## Troubleshooting

**Cannot connect to Glances server**
- Verify Glances is running in web server mode (`-w` flag)
- Check firewall allows port 61208
- Confirm server URL is correct

**Authentication errors**
- Store correct credentials in Credential Manager
- Verify password if authentication is enabled

**Missing metrics**
- Some metrics require additional sensors or hardware
- Container metrics require Docker/Podman
- GPU metrics require supported nvidia/amd GPUs
