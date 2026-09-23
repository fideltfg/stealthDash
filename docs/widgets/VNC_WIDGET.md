# VNC Widget

Remote desktop access using the noVNC 1.5 browser client and the Dashboard VNC WebSocket proxy.

## Requirements

- A VNC server reachable from the `ping-server` container
- A saved Dashboard credential containing the VNC host, port, and authentication fields
- Network and firewall access from the Dashboard server to the VNC server

## Setup

1. Create a credential in Credential Manager. Choose `VNC` and enter the host, port, password, and optional username or target.
2. Add the VNC widget and select that credential.
3. Choose scaling, clipping, input, quality, compression, auto-connect, and reconnect settings.
4. Use the display icon in the widget header to open the VNC controls.

The browser sends only the saved credential ID to the proxy. The authenticated backend resolves the host and port from that user's encrypted credential; browser-supplied TCP targets are not accepted.

## Settings

| Setting | Behavior |
|---|---|
| Credential | Supplies the VNC host, port, password, optional username/target, and repeater ID |
| Scaling | Scale locally, request a remote resize, or display at 1:1 |
| View only | Disables keyboard and pointer input |
| Shared session | Requests a shared VNC connection |
| Clip to widget | Clips a larger remote framebuffer to the widget |
| Drag clipped viewport | Allows panning a clipped framebuffer |
| Focus keyboard on click | Focuses remote input when the display is clicked |
| Quality / compression | Controls noVNC image quality and compression from 0–9 |
| Auto-connect | Connects when the widget renders |
| Reconnect delay | Retries an unclean disconnect; `0` disables retries |
| Display background | Sets the noVNC display background |

## Header menu

The display icon beside the normal widget menu includes a colored connection indicator. Its menu contains:

- Connect or disconnect
- Focus remote keyboard
- Send Ctrl+Alt+Delete
- Clipboard transfer in either direction
- Download a PNG screenshot
- Toggle view-only mode
- Enter or leave fullscreen
- Send Escape, Tab, Windows/Meta, Alt+F4, Ctrl+Escape, or Ctrl+Alt+Backspace
- Shutdown, reboot, or force-reset when the VNC server advertises power support

The widget also handles credential prompts, server identity verification, security failures, remote desktop names, clipboard notifications, bell events, and capability changes.

## Security

- Store connection details in Credential Manager; do not place passwords in widget configuration.
- The WebSocket requires a valid Dashboard JWT and verifies that the credential belongs to the authenticated user.
- The proxy obtains its TCP destination from the saved credential, so it cannot be used as an arbitrary browser-controlled TCP proxy.
- Keep VNC on a trusted network or VPN. VNC server security varies by implementation.
- Confirm a presented server fingerprint through a separate trusted channel before approving it.

## Troubleshooting

**Cannot connect**

- Confirm the saved host and port are correct and reachable from the Dashboard server.
- Verify the VNC server is running and its firewall permits the Dashboard server.
- Review `docker logs stealth-ping-server` for TCP connection errors.
- Test the same credential with a standalone VNC client from an equivalent network.

**Keyboard or mouse does not work**

- Open the header menu and disable view-only mode.
- Click the remote display or choose **Focus remote keyboard**.
- Check whether the VNC server grants input control.

**Poor performance**

- Lower quality, increase compression, or use remote resizing.
- Check latency and bandwidth between the Dashboard server and VNC target.

Common ports are `5900` for display `:0`, `5901` for `:1`, and `5902` for `:2`.
