/**
 * UniFi Widget Plugin
 * 
 * Provides proxy endpoints for UniFi Controller API.
 * Supports both legacy (username/password) and cloud API key authentication.
 */

const express = require('express');
const router = express.Router();
const https = require('https');
const { db, getCredentials, verifyAuth, decryptCredentials, createCache, respond } = require('../src/plugin-helpers');

// Session cache for legacy auth (30 minute TTL)
const sessionCache = createCache(30 * 60 * 1000);

// Cloud API base URL
const UNIFI_CLOUD_API = 'https://api.ui.com';

// Helper: Fetch UniFi data using legacy cookie-based auth (self-hosted controllers)
async function fetchUnifiLegacy(fetch, httpsAgent, host, site, username, password) {
  const cacheKey = `${host}:${username}:${password}`;
  
  let cookies;
  const cachedSession = sessionCache.get(cacheKey);
  
  if (cachedSession) {
    console.log('Using cached UniFi legacy session');
    cookies = cachedSession.cookies;
  } else {
    // Authenticate
    const loginUrl = `${host}/api/login`;
    console.log(`Authenticating with UniFi Controller (legacy) at: ${loginUrl}`);
    
    const loginResponse = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ 
        username: username,
        password: password,
        remember: false
      }),
      agent: httpsAgent,
      timeout: 10000
    });
    
    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      throw { status: loginResponse.status, error: `UniFi authentication failed: ${loginResponse.status}`, details: errorText };
    }
    
    const setCookieHeaders = loginResponse.headers.raw()['set-cookie'];
    if (!setCookieHeaders || setCookieHeaders.length === 0) {
      throw { status: 401, error: 'Authentication failed', details: 'No session cookies received' };
    }
    
    cookies = setCookieHeaders.map(cookie => cookie.split(';')[0]).join('; ');
    sessionCache.set(cacheKey, { cookies: cookies });
    console.log('UniFi legacy authentication successful');
  }
  
  const makeHeaders = () => ({ 'Accept': 'application/json', 'Cookie': cookies });
  const basePath = `/api/s/${site}/stat`;
  
  const [healthResponse, devicesResponse, clientsResponse, alarmsResponse] = await Promise.all([
    fetch(`${host}${basePath}/health`, { headers: makeHeaders(), agent: httpsAgent, timeout: 10000 }),
    fetch(`${host}${basePath}/device`, { headers: makeHeaders(), agent: httpsAgent, timeout: 10000 }).catch(() => null),
    fetch(`${host}${basePath}/sta`, { headers: makeHeaders(), agent: httpsAgent, timeout: 10000 }).catch(() => null),
    fetch(`${host}${basePath}/alarm`, { headers: makeHeaders(), agent: httpsAgent, timeout: 10000 }).catch(() => null)
  ]);
  
  if (!healthResponse.ok) {
    if (healthResponse.status === 401) sessionCache.clear(cacheKey);
    const errorText = await healthResponse.text();
    throw { status: healthResponse.status, error: `UniFi API returned ${healthResponse.status}`, details: errorText };
  }
  
  return {
    healthData: await healthResponse.json(),
    devicesData: devicesResponse && devicesResponse.ok ? await devicesResponse.json() : { data: [] },
    clientsData: clientsResponse && clientsResponse.ok ? await clientsResponse.json() : { data: [] },
    alarmsData: alarmsResponse && alarmsResponse.ok ? await alarmsResponse.json() : { data: [] }
  };
}

// Helper: Fetch UniFi data using API key via cloud Site Manager API
async function fetchUnifiApiKey(fetch, apiKey) {
  const makeHeaders = () => ({
    'Accept': 'application/json',
    'X-API-Key': apiKey
  });
  
  console.log('Fetching UniFi data from cloud Site Manager API...');
  
  const [sitesResponse, devicesResponse, hostsResponse] = await Promise.all([
    fetch(`${UNIFI_CLOUD_API}/v1/sites`, { headers: makeHeaders(), timeout: 15000 }),
    fetch(`${UNIFI_CLOUD_API}/v1/devices`, { headers: makeHeaders(), timeout: 15000 }).catch(() => null),
    fetch(`${UNIFI_CLOUD_API}/v1/hosts`, { headers: makeHeaders(), timeout: 15000 }).catch(() => null)
  ]);
  
  if (!sitesResponse.ok) {
    const errorText = await sitesResponse.text();
    throw { status: sitesResponse.status, error: `UniFi cloud API returned ${sitesResponse.status}`, details: errorText };
  }
  
  const sitesData = await sitesResponse.json();
  const devicesData = devicesResponse && devicesResponse.ok ? await devicesResponse.json() : { data: [] };
  const hostsData = hostsResponse && hostsResponse.ok ? await hostsResponse.json() : { data: [] };
  
  // Fetch ISP metrics
  let ispMetrics = { data: [] };
  try {
    const metricsResponse = await fetch(`${UNIFI_CLOUD_API}/v1/isp-metrics/5m?duration=24h`, {
      headers: makeHeaders(),
      timeout: 15000
    });
    if (metricsResponse.ok) ispMetrics = await metricsResponse.json();
  } catch { /* non-critical */ }
  
  return { sitesData, devicesData, hostsData, ispMetrics };
}

// Helper: Map device types
function mapDeviceType(shortname, model) {
  const sn = (shortname || '').toUpperCase();
  const m = (model || '').toUpperCase();
  
  if (sn.startsWith('UDM') || sn.startsWith('UXG') || sn.startsWith('USG') || sn.startsWith('UDR')) return 'ugw';
  if (sn.startsWith('U6') || sn.startsWith('U7') || sn.startsWith('UAP') || m.includes('AP')) return 'uap';
  if (sn.startsWith('USW') || sn.startsWith('USL') || m.includes('SWITCH')) return 'usw';
  return 'usw';
}

// Transform cloud API data to widget format
function transformCloudApiData(sitesData, devicesData, hostsData, ispMetrics, targetSite) {
  const sites = sitesData.data || [];
  const deviceHosts = devicesData.data || [];
  const hosts = hostsData.data || [];
  const metricsEntries = ispMetrics.data || [];
  
  // Find target site
  let site = sites.find(s => s.siteId === targetSite);
  if (!site) {
    const matchingSites = sites.filter(s => 
      (s.meta?.name || '').toLowerCase() === targetSite.toLowerCase() ||
      (s.meta?.desc || '').toLowerCase() === targetSite.toLowerCase()
    );
    site = matchingSites.find(s => s.isOwner) || matchingSites[0];
  }
  if (!site && sites.length > 0) {
    site = sites.find(s => s.isOwner) || sites[0];
  }
  
  const siteHostId = site?.hostId;
  
  const stats = {
    site_name: site?.meta?.desc || site?.meta?.name || targetSite,
    num_user: 0, num_guest: 0, num_iot: 0,
    gateways: 0, switches: 0, access_points: 0,
    wan_ip: undefined, uptime: undefined, wan_uptime: undefined,
    latency: undefined, speedtest_ping: undefined,
    xput_up: undefined, xput_down: undefined,
    gateway_status: undefined, gateway_model: undefined, isp_name: undefined,
    devices: [], clients: [], alarms: [],
    traffic: { tx_bytes: 0, rx_bytes: 0, tx_packets: 0, rx_packets: 0 },
    wan_download_kbps: undefined, wan_upload_kbps: undefined,
    wan_packet_loss: undefined, wan_downtime: undefined
  };
  
  // Extract site statistics
  if (site?.statistics) {
    const siteStats = site.statistics;
    const counts = siteStats.counts || {};
    
    stats.num_user = (counts.wifiClient || 0) + (counts.wiredClient || 0);
    stats.num_guest = counts.guestClient || 0;
    stats.num_iot = counts.iotClient || 0;
    stats.gateways = counts.gatewayDevice || 0;
    stats.switches = counts.wiredDevice || 0;
    stats.access_points = counts.wifiDevice || 0;
    
    if (siteStats.wans?.WAN || siteStats.wans?.WAN1) {
      stats.wan_ip = (siteStats.wans.WAN || siteStats.wans.WAN1).externalIp;
    }
    
    if (siteStats.percentages?.wanUptime !== undefined) {
      const wanUp = siteStats.percentages.wanUptime;
      stats.gateway_status = wanUp === 100 ? 'ok' : (wanUp > 90 ? 'warning' : 'error');
      stats.wan_uptime = wanUp;
    }
    
    if (siteStats.ispInfo) stats.isp_name = siteStats.ispInfo.name;
    if (siteStats.gateway) stats.gateway_model = siteStats.gateway.shortname;
  }
  
  // Process ISP metrics
  const siteMetrics = metricsEntries.find(m => m.siteId === site?.siteId) || metricsEntries[0];
  if (siteMetrics?.periods?.length > 0) {
    const latest = siteMetrics.periods[siteMetrics.periods.length - 1];
    const wan = latest?.data?.wan;
    if (wan) {
      if (wan.avgLatency !== undefined) stats.latency = wan.avgLatency;
      if (wan.maxLatency !== undefined) stats.speedtest_ping = wan.maxLatency;
      if (wan.download_kbps !== undefined) {
        stats.xput_down = wan.download_kbps * 1000;
        stats.wan_download_kbps = wan.download_kbps;
      }
      if (wan.upload_kbps !== undefined) {
        stats.xput_up = wan.upload_kbps * 1000;
        stats.wan_upload_kbps = wan.upload_kbps;
      }
      if (wan.packetLoss !== undefined) stats.wan_packet_loss = wan.packetLoss;
      if (wan.downtime !== undefined) stats.wan_downtime = wan.downtime;
    }
  }
  
  // Process devices
  let siteDeviceList = [];
  if (siteHostId) {
    const hostEntry = deviceHosts.find(h => h.hostId === siteHostId);
    if (hostEntry) siteDeviceList = hostEntry.devices || [];
  }
  if (siteDeviceList.length === 0 && deviceHosts.length > 0) {
    siteDeviceList = deviceHosts.flatMap(h => h.devices || []);
  }
  
  const networkDevices = siteDeviceList.filter(d => d.productLine === 'network');
  networkDevices.forEach(device => {
    let uptimeSeconds = 0;
    if (device.startupTime) {
      const startTime = new Date(device.startupTime).getTime();
      if (!isNaN(startTime)) uptimeSeconds = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
    }
    
    stats.devices.push({
      name: device.name || 'Unknown',
      model: device.model || device.shortname || '',
      type: mapDeviceType(device.shortname, device.model),
      ip: device.ip || '',
      mac: device.mac || '',
      state: device.status === 'online' ? 1 : 0,
      adopted: device.isManaged || false,
      uptime: uptimeSeconds,
      version: device.version || '',
      upgradable: !!(device.updateAvailable),
      num_sta: 0, user_num_sta: 0, guest_num_sta: 0,
      bytes: 0, tx_bytes: 0, rx_bytes: 0,
      satisfaction: 0, cpu: 0, mem: 0,
      shortname: device.shortname || ''
    });
  });
  
  // Process hosts for uptime
  if (hosts.length > 0 && siteHostId) {
    const host = hosts.find(h => h.id === siteHostId);
    if (host?.reportedState?.state === 'connected' && host.lastConnectionStateChange) {
      const connTime = new Date(host.lastConnectionStateChange).getTime();
      if (!isNaN(connTime)) stats.uptime = Math.floor((Date.now() - connTime) / 1000);
    }
  }
  
  return stats;
}

// List available sites (for config dialog)
router.get('/api/unifi/sites', async (req, res) => {
  try {
    const { credentialId } = req.query;
    if (!credentialId) return respond.badRequest(res, 'Missing credentialId parameter');
    
    let serviceType, credentials;
    try {
      const decoded = verifyAuth(req);
      const credResult = await db.query(
        'SELECT service_type, credential_data FROM credentials WHERE id = $1 AND user_id = $2',
        [credentialId, decoded.userId]
      );
      if (credResult.rows.length === 0) return respond.notFound(res, 'Credential not found');
      serviceType = credResult.rows[0].service_type;
      credentials = decryptCredentials(credResult.rows[0].credential_data);
    } catch (err) {
      return respond.unauthorized(res, 'Invalid authentication token');
    }
    
    if (serviceType !== 'unifi_api' || !credentials.apiKey) {
      return res.json({ sites: [] });
    }
    
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`${UNIFI_CLOUD_API}/v1/sites`, {
      headers: { 'Accept': 'application/json', 'X-API-Key': credentials.apiKey },
      timeout: 15000
    });
    
    if (!response.ok) return res.status(response.status).json({ error: 'Failed to fetch sites' });
    
    const data = await response.json();
    const sites = (data.data || []).map(s => ({
      siteId: s.siteId,
      name: s.meta?.name || 'unknown',
      desc: s.meta?.desc || s.meta?.name || 'Unknown',
      isOwner: s.isOwner || false,
      gateway: s.statistics?.gateway?.shortname || '',
      totalDevices: s.statistics?.counts?.totalDevice || 0,
      totalClients: (s.statistics?.counts?.wifiClient || 0) + (s.statistics?.counts?.wiredClient || 0) + (s.statistics?.counts?.guestClient || 0)
    }));
    
    res.json({ sites });
  } catch (error) {
    console.error('Error listing UniFi sites:', error);
    res.status(500).json({ error: 'Failed to list sites' });
  }
});

// Main stats endpoint
router.get('/api/unifi/stats', async (req, res) => {
  try {
    const { credentialId, site = 'default' } = req.query;
    if (!credentialId) return respond.badRequest(res, 'Missing credentialId parameter');
    
    let credentials, serviceType;
    try {
      const decoded = verifyAuth(req);
      const credResult = await db.query(
        'SELECT service_type, credential_data FROM credentials WHERE id = $1 AND user_id = $2',
        [credentialId, decoded.userId]
      );
      if (credResult.rows.length === 0) return respond.notFound(res, 'Credential not found');
      serviceType = credResult.rows[0].service_type;
      credentials = decryptCredentials(credResult.rows[0].credential_data);
    } catch (err) {
      return respond.unauthorized(res, 'Invalid authentication token');
    }

    const fetch = (await import('node-fetch')).default;
    const httpsAgent = new https.Agent({ rejectUnauthorized: false });
    
    if (serviceType === 'unifi_api') {
      if (!credentials.apiKey) return respond.badRequest(res, 'Credential does not contain an API key');
      const cloudData = await fetchUnifiApiKey(fetch, credentials.apiKey);
      const stats = transformCloudApiData(cloudData.sitesData, cloudData.devicesData, cloudData.hostsData, cloudData.ispMetrics, site);
      res.set('Access-Control-Allow-Origin', '*');
      return res.json(stats);
    }
    
    // Legacy auth
    const host = credentials.host;
    if (!host) return respond.badRequest(res, 'Credential does not contain a host URL');
    if (!credentials.username || !credentials.password) return respond.badRequest(res, 'Missing username or password');
    
    const rawData = await fetchUnifiLegacy(fetch, httpsAgent, host, site, credentials.username, credentials.password);
    const { healthData, devicesData, clientsData, alarmsData } = rawData;
    
    // Aggregate stats
    const stats = {
      site_name: site,
      num_user: 0, num_guest: 0, num_iot: 0,
      gateways: 0, switches: 0, access_points: 0,
      devices: [], clients: [], alarms: [],
      traffic: { tx_bytes: 0, rx_bytes: 0, tx_packets: 0, rx_packets: 0 }
    };
    
    if (healthData.data && Array.isArray(healthData.data)) {
      healthData.data.forEach(item => {
        if (item.subsystem === 'wlan') {
          stats.num_user = item.num_user || 0;
          stats.num_guest = item.num_guest || 0;
          stats.num_iot = item.num_iot || 0;
          stats.access_points = item.num_ap || 0;
        } else if (item.subsystem === 'wan') {
          stats.wan_ip = item.wan_ip;
          stats.uptime = item.uptime;
          stats.wan_uptime = item.uptime;
          stats.latency = item.latency;
          stats.speedtest_ping = item.speedtest_ping;
          stats.xput_up = item.xput_up;
          stats.xput_down = item.xput_down;
        } else if (item.subsystem === 'www') {
          stats.gateways = item.num_gw || 0;
          stats.gateway_status = item.status;
        } else if (item.subsystem === 'sw') {
          stats.switches = item.num_sw || 0;
        }
        if (item.tx_bytes) stats.traffic.tx_bytes += item.tx_bytes;
        if (item.rx_bytes) stats.traffic.rx_bytes += item.rx_bytes;
        if (item.tx_packets) stats.traffic.tx_packets += item.tx_packets;
        if (item.rx_packets) stats.traffic.rx_packets += item.rx_packets;
      });
    }
    
    if (devicesData.data && Array.isArray(devicesData.data)) {
      devicesData.data.forEach(device => {
        stats.devices.push({
          name: device.name || device.hostname || 'Unknown',
          model: device.model,
          type: device.type,
          ip: device.ip,
          mac: device.mac,
          state: device.state,
          adopted: device.adopted,
          uptime: device.uptime,
          version: device.version,
          upgradable: device.upgradable,
          num_sta: device.num_sta || 0,
          user_num_sta: device['user-num_sta'] || 0,
          guest_num_sta: device['guest-num_sta'] || 0,
          bytes: device.bytes || device.stat?.bytes || 0,
          tx_bytes: device.tx_bytes || device.stat?.tx_bytes || 0,
          rx_bytes: device.rx_bytes || device.stat?.rx_bytes || 0,
          satisfaction: device.satisfaction,
          cpu: device['system-stats']?.cpu,
          mem: device['system-stats']?.mem,
          uplink: device.uplink
        });
      });
    }
    
    if (clientsData.data && Array.isArray(clientsData.data)) {
      clientsData.data.forEach(client => {
        stats.clients.push({
          name: client.hostname || client.name || 'Unknown',
          mac: client.mac,
          ip: client.ip,
          network: client.network,
          essid: client.essid,
          is_guest: client.is_guest,
          is_wired: client.is_wired,
          signal: client.signal,
          rssi: client.rssi,
          tx_bytes: client.tx_bytes || 0,
          rx_bytes: client.rx_bytes || 0,
          tx_rate: client.tx_rate,
          rx_rate: client.rx_rate,
          uptime: client.uptime,
          last_seen: client.last_seen,
          ap_mac: client.ap_mac,
          channel: client.channel,
          radio: client.radio
        });
      });
    }
    
    if (alarmsData.data && Array.isArray(alarmsData.data)) {
      stats.alarms = alarmsData.data.slice(0, 10).map(alarm => ({
        datetime: alarm.datetime,
        msg: alarm.msg,
        key: alarm.key,
        subsystem: alarm.subsystem,
        archived: alarm.archived
      }));
    }
    
    res.set('Access-Control-Allow-Origin', '*');
    res.json(stats);
    
  } catch (error) {
    console.error('UniFi proxy error:', error);
    if (error.status && error.error) {
      return res.status(error.status).json({ error: error.error, details: error.details });
    }
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to fetch UniFi data'
    });
  }
});

module.exports = {
  name: 'unifi',
  description: 'UniFi Controller API proxy (legacy and cloud)',
  version: '1.0.0',
  routes: router,
  mountPath: '/'
};
