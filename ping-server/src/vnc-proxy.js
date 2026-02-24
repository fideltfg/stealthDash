/**
 * VNC WebSocket Proxy (websockify)
 * 
 * Bridges browser WebSocket connections to raw TCP VNC servers.
 * This acts like websockify — the noVNC client connects to this proxy
 * via WebSocket, and the proxy forwards traffic to the target VNC server
 * over a raw TCP socket.
 * 
 * Authentication: JWT token is passed as a query parameter since
 * WebSocket connections cannot set custom headers.
 */

const WebSocket = require('ws');
const net = require('net');
const jwt = require('jsonwebtoken');
const url = require('url');
const db = require('./db');
const { decryptCredentials } = require('./crypto-utils');

/**
 * Fetch and decrypt credentials for a user
 */
async function getCredentials(credentialId, userId) {
  const result = await db.query(
    'SELECT credential_data FROM credentials WHERE id = $1 AND user_id = $2',
    [credentialId, userId]
  );
  if (result.rows.length === 0) {
    throw new Error('Credential not found or access denied');
  }
  return decryptCredentials(result.rows[0].credential_data);
}

/**
 * Initialize the VNC WebSocket proxy on an existing HTTP server.
 * 
 * @param {http.Server} server - The HTTP server to attach to
 */
function initVncProxy(server) {
  const wss = new WebSocket.Server({
    server,
    path: '/api/vnc/connect',
    // Verify the connection before upgrading
    verifyClient: async (info, callback) => {
      try {
        const parsed = url.parse(info.req.url, true);
        const token = parsed.query.token;

        if (!token) {
          callback(false, 401, 'Authentication required');
          return;
        }

        // Verify JWT
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
        info.req.userId = decoded.userId;
        info.req.query = parsed.query;
        callback(true);
      } catch (err) {
        console.error('VNC proxy auth error:', err.message);
        callback(false, 401, 'Invalid token');
      }
    }
  });

  wss.on('connection', async (ws, req) => {
    const query = req.query || url.parse(req.url, true).query;
    const { host, port: portStr, credentialId } = query;
    const port = parseInt(portStr) || 5900;
    const userId = req.userId;

    console.log(`VNC proxy: connecting to ${host}:${port} for user ${userId}`);

    // Validate host
    if (!host) {
      ws.close(4400, 'Missing host parameter');
      return;
    }

    // If credentialId is provided, validate that it exists and belongs to this user.
    // The actual VNC password is fetched by the frontend via REST API and passed
    // directly to the noVNC RFB client for VNC authentication. The proxy is a
    // pure binary bridge and must NOT inject any messages into the WebSocket stream.
    if (credentialId) {
      try {
        await getCredentials(parseInt(credentialId), userId);
      } catch (err) {
        console.error('VNC proxy credential error:', err.message);
        ws.close(4401, 'Invalid credentials');
        return;
      }
    }

    // Create TCP connection to VNC server
    const tcpSocket = net.createConnection({ host, port }, () => {
      console.log(`VNC proxy: TCP connected to ${host}:${port}`);
    });

    // Bridge: TCP → WebSocket
    tcpSocket.on('data', (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(data);
        } catch (err) {
          console.error('VNC proxy: error sending to WebSocket:', err.message);
        }
      }
    });

    // Bridge: WebSocket → TCP
    ws.on('message', (data) => {
      // Ignore JSON control messages (like password request)
      if (typeof data === 'string') {
        try {
          const msg = JSON.parse(data);
          if (msg.type === '__vnc_control__') {
            // Future: handle control messages
            return;
          }
        } catch (e) {
          // Not JSON, pass through as binary
        }
      }
      if (tcpSocket.writable) {
        tcpSocket.write(data);
      }
    });

    // Handle TCP errors/close
    tcpSocket.on('error', (err) => {
      console.error(`VNC proxy: TCP error for ${host}:${port}:`, err.message);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(4502, `VNC server error: ${err.message}`);
      }
    });

    tcpSocket.on('close', () => {
      console.log(`VNC proxy: TCP closed for ${host}:${port}`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'VNC server disconnected');
      }
    });

    tcpSocket.on('timeout', () => {
      console.error(`VNC proxy: TCP timeout for ${host}:${port}`);
      tcpSocket.destroy();
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(4504, 'VNC server timeout');
      }
    });

    // Set TCP timeout (30 seconds for initial connection)
    tcpSocket.setTimeout(30000);
    // Remove timeout after connection is established
    tcpSocket.on('connect', () => {
      tcpSocket.setTimeout(0);
    });

    // Handle WebSocket close
    ws.on('close', () => {
      console.log(`VNC proxy: WebSocket closed for ${host}:${port}`);
      tcpSocket.destroy();
    });

    ws.on('error', (err) => {
      console.error(`VNC proxy: WebSocket error for ${host}:${port}:`, err.message);
      tcpSocket.destroy();
    });
  });

  console.log('✅ VNC WebSocket proxy initialized on /api/vnc/connect');
  return wss;
}

module.exports = { initVncProxy };
