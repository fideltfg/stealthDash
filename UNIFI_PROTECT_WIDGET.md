# UniFi Protect Widget

A comprehensive widget for displaying UniFi Protect camera feeds and motion detection events in your dashboard.

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

### 1. Prerequisites
- UniFi Protect Console (Cloud Key Gen2+, UDM Pro, UNVR, or standalone NVR)
- Local admin account credentials
- Network access to the Protect console

### 2. Create Credentials
1. Go to **Credentials Manager** in your dashboard
2. Click **Add New Credential**
3. Fill in:
   - **Name**: "UniFi Protect Console" (or your preference)
   - **Service Type**: Select "UniFi Protect" or "Basic"
   - **Username**: Local admin username
   - **Password**: Local admin password
4. Save the credential

### 3. Add Widget to Dashboard
1. Click the **+** button or use **Add Widget** menu
2. Select **UniFi Protect** from the widget picker
3. Configure the widget:
   - **Console URL**: Your UniFi Protect URL (e.g., `https://192.168.1.1`)
   - **Credentials**: Select the credential you created
   - **Display Mode**: Choose how to display content
   - **View Mode**: Choose camera view type
   - **Max Detections**: Number of recent events to show (default: 10)
   - **Refresh Interval**: Auto-refresh time in seconds (default: 30)

## Configuration Options

### Basic Settings
- **UniFi Protect Console URL**: HTTPS URL of your Protect console
- **Credentials**: Saved credential for authentication

### Display Settings
- **Display Mode**:
  - `Both`: Cameras and detections (default)
  - `Cameras Only`: Just camera views
  - `Detections Only`: Just event list
  
- **View Mode**:
  - `Snapshots`: Static images (default)
  - `Streams`: Live video feeds
  - `Both`: Both viewing options

### Event Settings
- **Maximum Detections**: Limit event list (1-50, default: 10)
- **Refresh Interval**: Auto-update frequency in seconds (5-300, default: 30)

### Advanced Settings (Coming Soon)
- **Selected Cameras**: Choose specific cameras to display
- **Detection Types**: Filter by motion, person, vehicle, etc.
- **Auto Refresh Detections**: Toggle automatic event updates

## API Endpoints

The widget uses the following proxy endpoints on the ping-server:

### Bootstrap Data
```
GET /api/unifi-protect/bootstrap?host={url}&credentialId={id}
```
Returns cameras and recent events in one call.

### Camera Snapshot
```
GET /api/unifi-protect/camera/{cameraId}/snapshot?host={url}&credentialId={id}
```
Returns current camera snapshot image.

## Technical Details

### Authentication
- Uses session-based authentication with UniFi Protect API
- Sessions are cached for 30 minutes to reduce API calls
- Automatic re-authentication on session expiry
- Credentials stored securely using the Credentials Manager

### Security
- All API calls go through the ping-server proxy
- No credentials exposed to the frontend
- HTTPS with self-signed certificate support
- Bearer token authentication for credential access

### Performance
- Configurable refresh intervals to balance updates and load
- Session caching to minimize authentication overhead
- Efficient snapshot delivery with proper cache headers
- Event filtering to reduce data transfer

## Troubleshooting

### "No credential configured"
- Ensure you've created a credential in the Credentials Manager
- Select the credential in the widget configuration

### "Failed to load UniFi Protect data"
- Verify the console URL is correct and accessible
- Check that credentials are valid (username/password)
- Ensure the account has admin privileges
- Check network connectivity to the console

### "Snapshot unavailable"
- Camera might be offline
- Check camera connectivity in Protect console
- Verify camera is powered on and connected

### Events not showing
- No recent detections in the last 24 hours
- Check event settings in Protect console
- Verify motion detection is enabled on cameras

### Authentication errors
- Clear cached session by reloading the page
- Verify credentials in Credentials Manager
- Check for password changes
- Ensure account hasn't been locked

## Known Limitations

1. **Live Streaming**: RTSP stream support is planned for future release
2. **Camera Selection**: UI for selecting specific cameras coming soon
3. **Event Filtering**: Advanced filtering by detection type coming soon
4. **Video Playback**: Event video clips not yet supported (thumbnails only)
5. **PTZ Controls**: Camera controls not implemented yet

## Browser Compatibility

- Modern browsers with ES6+ support
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Future Enhancements

- [ ] RTSP live streaming support
- [ ] Camera selection interface
- [ ] Event type filtering
- [ ] Event video playback
- [ ] PTZ camera controls
- [ ] Event timeline visualization
- [ ] Camera grouping
- [ ] Event notifications
- [ ] Export/download events
- [ ] Multi-camera view layouts

## Related Widgets

- **UniFi Network**: Monitor UniFi network statistics and devices
- **Docker**: Manage containers (if running Protect in Docker)

## Support

For issues or questions:
1. Check the browser console for detailed error messages
2. Verify Protect console accessibility
3. Review credentials and permissions
4. Check ping-server logs for API errors

## Credits

Built for the StealthDash dashboard system by integrating with the UniFi Protect API.
