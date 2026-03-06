# Widget Plugin System

The ping server supports a plugin system that allows widget backend routes to be modular and self-contained, similar to how widgets work on the dashboard frontend.

## Overview

Instead of having all widget backend logic in `routes/widgets.js`, you can create individual plugin files in `ping-server/plugins/`. Each plugin provides its own Express routes and gets automatically loaded when the server starts.

## Plugin Structure

Plugins live in `ping-server/plugins/` and follow this interface:

```javascript
module.exports = {
  name: 'my-widget',                    // Required: Plugin identifier
  description: 'My widget description', // Optional: Human-readable description  
  version: '1.0.0',                     // Optional: Plugin version
  routes: router,                        // Required: Express Router
  mountPath: '/',                        // Optional: Mount path (default: '/')
  init: async function() { }             // Optional: Async initialization
};
```

## Creating a Plugin

### 1. Create the plugin file

Create a new file in `ping-server/plugins/` (e.g., `my-widget.js`):

```javascript
const express = require('express');
const router = express.Router();
const { db, authMiddleware, getCredentials, createCache, respond } = require('../src/plugin-helpers');

// Optional: Create a cache for API responses
const cache = createCache(60000); // 60-second TTL

// Define your routes
router.get('/api/my-widget/data', async (req, res) => {
  try {
    const { host } = req.query;
    
    if (!host) {
      return respond.badRequest(res, 'Missing host parameter');
    }
    
    // Check cache
    const cached = cache.get(host);
    if (cached) {
      return res.json(cached);
    }
    
    // Fetch data
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`${host}/api/data`);
    const data = await response.json();
    
    // Cache and return
    cache.set(host, data);
    res.json(data);
    
  } catch (error) {
    console.error('My widget error:', error);
    respond.error(res, error.message);
  }
});

// Route that requires authentication
router.get('/api/my-widget/secure', authMiddleware, async (req, res) => {
  // req.user contains the authenticated user
  respond.success(res, { data: 'secure data' });
});

module.exports = {
  name: 'my-widget',
  description: 'My custom widget plugin',
  version: '1.0.0',
  routes: router,
  mountPath: '/'
};
```

### 2. Restart the server

The plugin will be automatically loaded on server startup:

```
📦 Loading widget plugins...
   ✅ my-widget v1.0.0 → /
   Loaded 1 plugin(s)
```

## Plugin Helpers

The `plugin-helpers` module provides common utilities:

### Database Access

```javascript
const { db } = require('../src/plugin-helpers');

// Query the database
const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
```

### Authentication

```javascript
const { authMiddleware, verifyAuth } = require('../src/plugin-helpers');

// Middleware-based auth (recommended for routes requiring auth)
router.get('/secure', authMiddleware, async (req, res) => {
  // req.user available
});

// Manual auth verification
try {
  const decoded = verifyAuth(req);
  const userId = decoded.userId;
} catch (err) {
  // Not authenticated
}
```

### Credentials

```javascript
const { getCredentials, verifyAuth } = require('../src/plugin-helpers');

router.get('/data', async (req, res) => {
  const { credentialId } = req.query;
  
  if (credentialId) {
    const decoded = verifyAuth(req);
    const credentials = await getCredentials(credentialId, decoded.userId);
    // credentials.api_key, credentials.username, etc.
  }
});
```

### Caching

```javascript
const { createCache } = require('../src/plugin-helpers');

// Create cache with 60-second TTL
const cache = createCache(60000);

// Use the cache
const cached = cache.get('key');
if (cached) return res.json(cached);

// ... fetch data ...
cache.set('key', data);
```

### Response Helpers

```javascript
const { respond } = require('../src/plugin-helpers');

respond.success(res, { data: 'value' });     // 200 with success: true
respond.error(res, 'Error message');          // 500 with success: false
respond.badRequest(res, 'Invalid input');     // 400
respond.unauthorized(res, 'Auth required');   // 401  
respond.notFound(res, 'Not found');           // 404
```

### Async Handler

Wrap async handlers to catch errors automatically:

```javascript
const { asyncHandler } = require('../src/plugin-helpers');

router.get('/data', asyncHandler(async (req, res) => {
  // Errors are automatically caught and passed to error middleware
  const data = await fetchData();
  res.json(data);
}));
```

## Plugin Loading Order

1. Plugins in `plugins/` are loaded first (alphabetically)
2. Built-in `routes/widgets.js` routes load after plugins
3. **Plugins can override built-in routes** - first match wins

This means you can gradually migrate routes from `widgets.js` to plugins without breaking anything.

## API Endpoint

You can check loaded plugins via:

```
GET /api/plugins

Response:
{
  "plugins": [
    {
      "name": "crypto",
      "description": "Crypto ticker widget - CoinGecko API proxy with caching",
      "version": "1.0.0",
      "file": "crypto.js",
      "mountPath": "/"
    }
  ]
}
```

## Installed Plugins

The server ships with 17 plugins. Each has detailed API documentation:

| Plugin | File | Documentation |
|--------|------|---------------|
| Ping | `ping.js` | [Ping Plugin](plugins/PING_PLUGIN.md) |
| Proxy | `proxy.js` | [Proxy Plugin](plugins/PROXY_PLUGIN.md) |
| Crypto | `crypto.js` | [Crypto Plugin](plugins/CRYPTO_PLUGIN.md) |
| Docker | `docker.js` | [Docker Plugin](plugins/DOCKER_PLUGIN.md) |
| Glances | `glances.js` | [Glances Plugin](plugins/GLANCES_PLUGIN.md) |
| Gmail | `gmail.js` | [Gmail Plugin](plugins/GMAIL_PLUGIN.md) |
| Google Calendar | `google-calendar.js` | [Google Calendar Plugin](plugins/GOOGLE_CALENDAR_PLUGIN.md) |
| Home Assistant | `home-assistant.js` | [Home Assistant Plugin](plugins/HOME_ASSISTANT_PLUGIN.md) |
| Pi-hole | `pihole.js` | [Pi-hole Plugin](plugins/PIHOLE_PLUGIN.md) |
| Sensi | `sensi.js` | [Sensi Plugin](plugins/SENSI_PLUGIN.md) |
| Speedtest | `speedtest.js` | [Speedtest Plugin](plugins/SPEEDTEST_PLUGIN.md) |
| Tasks | `tasks.js` | [Tasks Plugin](plugins/TASKS_PLUGIN.md) |
| Todoist | `todoist.js` | [Todoist Plugin](plugins/TODOIST_PLUGIN.md) |
| UniFi | `unifi.js` | [UniFi Plugin](plugins/UNIFI_PLUGIN.md) |
| UniFi Protect | `unifi-protect.js` | [UniFi Protect Plugin](plugins/UNIFI_PROTECT_PLUGIN.md) |
| SNMP | `snmp.js` | [SNMP Plugin](plugins/SNMP_PLUGIN.md) |
| Modbus | `modbus.js` | [Modbus Plugin](plugins/MODBUS_PLUGIN.md) |

## Example Plugins

See these files for reference implementations:

- `ping-server/plugins/crypto.js` - Simple proxy with caching
- `ping-server/plugins/speedtest.js` - Proxy with optional authentication

## Best Practices

1. **Use caching** for external API calls to avoid rate limiting
2. **Validate inputs** early with `respond.badRequest()`
3. **Handle credentials** securely using `getCredentials()`
4. **Log errors** to help with debugging
5. **Keep plugins focused** - one widget per plugin
6. **Export the standard interface** - name, routes, and optionally description/version

## Migration Path

To migrate existing widget routes from `widgets.js` to a plugin:

1. Copy the route code to a new plugin file
2. Update imports to use `plugin-helpers`
3. Export the plugin interface
4. Test the plugin routes
5. (Optional) Remove the routes from `widgets.js`

The built-in routes serve as fallbacks, so you can migrate incrementally.
