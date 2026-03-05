/**
 * Widget Plugin Loader
 * 
 * Dynamically discovers and loads widget plugins from the plugins directory.
 * 
 * HOW IT WORKS:
 * - Scans the plugins/ directory for .js files
 * - Each plugin exports a WidgetPlugin object with routes
 * - Routes are automatically mounted to the Express app
 * 
 * PLUGIN INTERFACE:
 * Each plugin must export an object with:
 * - name: string          - Plugin identifier (e.g., 'crypto', 'docker')
 * - description: string   - Human-readable description
 * - version: string       - Plugin version
 * - routes: Router        - Express Router with the plugin's routes
 * - mountPath: string     - Where to mount (default: '/')
 * - init?: Function       - Optional async initialization function
 * 
 * EXAMPLE PLUGIN:
 * ```javascript
 * const express = require('express');
 * const router = express.Router();
 * const { db, authMiddleware, createCache } = require('../src/plugin-helpers');
 * 
 * router.get('/api/my-widget/data', async (req, res) => {
 *   // Your widget's backend logic
 * });
 * 
 * module.exports = {
 *   name: 'my-widget',
 *   description: 'My custom widget plugin',
 *   version: '1.0.0',
 *   routes: router,
 *   mountPath: '/'
 * };
 * ```
 */

const fs = require('fs');
const path = require('path');

// Track loaded plugins
const loadedPlugins = new Map();

/**
 * Load all plugins from the plugins directory
 * @param {Express} app - Express application instance
 * @param {string} pluginsDir - Path to plugins directory
 * @returns {Promise<Map>} - Map of loaded plugins
 */
async function loadPlugins(app, pluginsDir = path.join(__dirname, '../plugins')) {
  console.log('\n📦 Loading widget plugins...');
  
  // Create plugins directory if it doesn't exist
  if (!fs.existsSync(pluginsDir)) {
    fs.mkdirSync(pluginsDir, { recursive: true });
    console.log(`   Created plugins directory: ${pluginsDir}`);
  }
  
  // Get all .js files in the plugins directory
  const pluginFiles = fs.readdirSync(pluginsDir)
    .filter(file => file.endsWith('.js'))
    .sort();
  
  if (pluginFiles.length === 0) {
    console.log('   No plugins found in plugins/ directory');
    console.log('   Widget routes will use built-in handlers from routes/widgets.js');
    return loadedPlugins;
  }
  
  // Load each plugin
  for (const file of pluginFiles) {
    const pluginPath = path.join(pluginsDir, file);
    
    try {
      const plugin = require(pluginPath);
      
      // Validate plugin interface
      if (!plugin.name || !plugin.routes) {
        console.error(`   ❌ Invalid plugin ${file}: missing 'name' or 'routes'`);
        continue;
      }
      
      // Check for duplicate plugins
      if (loadedPlugins.has(plugin.name)) {
        console.warn(`   ⚠️  Plugin ${plugin.name} already loaded, skipping ${file}`);
        continue;
      }
      
      // Initialize plugin if it has an init function
      if (typeof plugin.init === 'function') {
        await plugin.init();
      }
      
      // Mount routes
      const mountPath = plugin.mountPath || '/';
      app.use(mountPath, plugin.routes);
      
      // Track loaded plugin
      loadedPlugins.set(plugin.name, {
        name: plugin.name,
        description: plugin.description || '',
        version: plugin.version || '1.0.0',
        file: file,
        mountPath: mountPath
      });
      
      console.log(`   ✅ ${plugin.name} v${plugin.version || '1.0.0'} → ${mountPath}`);
      
    } catch (error) {
      console.error(`   ❌ Failed to load plugin ${file}:`, error.message);
    }
  }
  
  console.log(`   Loaded ${loadedPlugins.size} plugin(s)\n`);
  return loadedPlugins;
}

/**
 * Get information about a loaded plugin
 * @param {string} name - Plugin name
 * @returns {object|undefined} - Plugin info or undefined
 */
function getPlugin(name) {
  return loadedPlugins.get(name);
}

/**
 * Get all loaded plugins
 * @returns {Array} - Array of plugin info objects
 */
function getAllPlugins() {
  return Array.from(loadedPlugins.values());
}

/**
 * Check if a plugin is loaded
 * @param {string} name - Plugin name
 * @returns {boolean}
 */
function hasPlugin(name) {
  return loadedPlugins.has(name);
}

module.exports = {
  loadPlugins,
  getPlugin,
  getAllPlugins,
  hasPlugin
};
