# UniFi Protect Widget

A comprehensive widget for displaying UniFi Protect camera feeds and motion detection events.

## Features

### Camera Display
- **Live Camera Grid**: View all or selected cameras in a responsive grid layout
- **Snapshot View**: Display camera snapshots with automatic refresh
- **Live Streams**: Support for RTSP live streaming (coming soon)
- **Camera Status**: Real-time online/offline status indicators
- **Recording Indicator**: Visual indication when cameras are recording
- **Motion Detection Alert**: Highlights cameras detecting motion

### Event Detection
- **Smart Detection Events**: View recent motion, person, and vehicle detections
- **Event Thumbnails**: Display captured images from detection events
- **Detection Confidence**: Show confidence scores for smart detections
- **Event Timeline**: Chronological list of recent events
- **Camera Association**: Each event shows which camera detected it
- **Time Stamps**: Display when events occurred with "time ago" format

### Display Modes
1. **Both** (default): Shows cameras and recent detections together
2. **Cameras Only**: Focus on camera grid view
3. **Detections Only**: Focus on event list

### View Modes
1. **Snapshots**: Display static camera images (refreshed automatically)
2. **Streams**: Live video feeds (requires RTSP support)
3. **Both**: Show both options where available

## Setup

### Prerequisites
- UniFi Protect Console (Cloud Key Gen2+, UDM Pro, UNVR, or standalone NVR)
- Local admin account credentials
- Network access to the Protect console

### Configuration Steps

1. **Create Credentials**
   - Go to Credentials Manager in your dashboard
   - Click Add New Credential
   - Fill in:
     - Name: "UniFi Protect Console"
     - Service Type: "UniFi Protect" or "Basic"
     - Username: Local admin username
     - Password: Local admin password
   - Save the credential

2. **Add Widget**
   - Click the + button or use Add Widget menu
   - Select UniFi Protect from the widget picker

3. **Configure Widget**
   - Console URL: Your UniFi Protect URL (e.g., `https://192.168.1.1`)
   - Credentials: Select the credential you created
   - Display Mode: Choose how to display content
   - View Mode: Choose camera view type
   - Max Detections: Number of recent events to show (default: 10)
   - Refresh Interval: Auto-refresh time in seconds (default: 30)

## Configuration Options

**Basic Settings:**
- UniFi Protect Console URL (HTTPS required)
- Credentials (from Credential Manager)

**Display Settings:**
- Display Mode: Both / Cameras Only / Detections Only
- View Mode: Snapshots / Streams / Both

**Event Settings:**
- Maximum Detections: 1-50 (default: 10)
- Refresh Interval: 5-300 seconds (default: 30)

## Troubleshooting

**"No credential configured"**
- Ensure you've created a credential in the Credentials Manager
- Select the credential in the widget configuration

**"Failed to load UniFi Protect data"**
- Verify the console URL is correct and accessible
- Check that credentials are valid
- Ensure the account has admin privileges
- Check network connectivity

**"Snapshot unavailable"**
- Camera might be offline
- Check camera connectivity in Protect console

**Events not showing**
- No recent detections in the last 24 hours
- Check event settings in Protect console
- Verify motion detection is enabled

## Known Limitations

1. RTSP stream support is planned for future release
2. UI for selecting specific cameras coming soon
3. Advanced filtering by detection type coming soon
4. Event video clips not yet supported (thumbnails only)
5. PTZ controls not implemented yet
