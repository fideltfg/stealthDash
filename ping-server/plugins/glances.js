/**
 * Glances Widget Plugin
 * 
 * Provides proxy endpoint for Glances system monitoring API.
 */

const express = require('express');
const router = express.Router();
const { getCredentials, verifyAuth, respond } = require('../src/plugin-helpers');

router.get('/api/glances', async (req, res) => {
    try {
        const { host, credentialId } = req.query;
        if (!host) {
            return respond.badRequest(res, 'Missing host parameter');
        }

        const fetch = (await import('node-fetch')).default;
        const headers = {};

        // Optional auth via credential
        if (credentialId) {
            try {
                const decoded = verifyAuth(req);
                const creds = await getCredentials(credentialId, decoded.userId);
                if (creds.password) {
                    headers['Authorization'] = 'Basic ' + Buffer.from(`glances:${creds.password}`).toString('base64');
                }
            } catch (err) {
                return respond.unauthorized(res, 'Invalid token or credential');
            }
        }

        const base = host.replace(/\/$/, '');

        // Auto-detect Glances API version (v4, v3, v2)
        let apiVersion = null;
        for (const ver of [4, 3, 2]) {
            try {
                const r = await fetch(`${base}/api/${ver}/cpu`, { headers, timeout: 5000 });
                if (r.ok) { apiVersion = ver; break; }
            } catch { /* try next version */ }
        }

        if (!apiVersion) {
            return res.status(502).json({ error: `Cannot reach Glances at ${host}. Ensure Glances is running with: glances -w` });
        }

        const endpoints = ['cpu', 'mem', 'swap', 'load', 'fs', 'network', 'system', 'uptime', 'percpu', 'processcount', 'diskio', 'quicklook', 'containers', 'sensors', 'gpu'];
        const results = await Promise.all(endpoints.map(async ep => {
            try {
                const r = await fetch(`${base}/api/${apiVersion}/${ep}`, { headers, timeout: 5000 });
                return r.ok ? await r.json() : null;
            } catch { return null; }
        }));

        const [cpu, mem, swap, load, fs, network, system, uptime, percpu, processcount, diskio, quicklook, containers, sensors, gpu] = results;

        // If core endpoints (cpu + mem) both failed, report error
        if (!cpu && !mem) {
            return res.status(502).json({ error: `Glances API v${apiVersion} detected but returned no data. Check the Glances instance.` });
        }

        res.json({
            cpu: cpu ? { total: cpu.total, user: cpu.user, system: cpu.system, iowait: cpu.iowait || 0, cpucore: cpu.cpucore || 0, ctx_switches_rate: cpu.ctx_switches_rate_per_sec || 0, interrupts_rate: cpu.interrupts_rate_per_sec || 0 } : { total: 0, user: 0, system: 0, iowait: 0, cpucore: 0, ctx_switches_rate: 0, interrupts_rate: 0 },
            percpu: Array.isArray(percpu) ? percpu.map(c => ({ cpu_number: c.cpu_number, total: c.total, user: c.user, system: c.system, iowait: c.iowait || 0 })) : [],
            mem: mem ? { total: mem.total, used: mem.used, percent: mem.percent, available: mem.available || 0, buffers: mem.buffers || 0, cached: mem.cached || 0, active: mem.active || 0, inactive: mem.inactive || 0 } : { total: 0, used: 0, percent: 0, available: 0, buffers: 0, cached: 0, active: 0, inactive: 0 },
            swap: swap ? { total: swap.total, used: swap.used, percent: swap.percent } : { total: 0, used: 0, percent: 0 },
            load: load ? { min1: load.min1, min5: load.min5, min15: load.min15, cpucore: load.cpucore } : { min1: 0, min5: 0, min15: 0, cpucore: 1 },
            fs: Array.isArray(fs) ? fs.filter(d => d.mnt_point && !d.mnt_point.startsWith('/etc/')).map(d => ({ device_name: d.device_name, fs_type: d.fs_type || '', mnt_point: d.mnt_point, size: d.size, used: d.used, free: d.free || (d.size - d.used), percent: d.percent })) : [],
            diskio: Array.isArray(diskio) ? diskio.filter(d => d.disk_name && !d.disk_name.match(/^(loop|dm-)/)).map(d => ({ disk_name: d.disk_name, read_bytes_rate: d.read_bytes_rate_per_sec || 0, write_bytes_rate: d.write_bytes_rate_per_sec || 0, read_count_rate: d.read_count_rate_per_sec || 0, write_count_rate: d.write_count_rate_per_sec || 0 })) : [],
            network: Array.isArray(network) ? network.filter(n => n.interface_name && !n.interface_name.match(/^(lo|veth|br-)/)).map(n => ({ interface_name: n.interface_name, rx: n.bytes_recv_rate_per_sec || n.bytes_recv || 0, tx: n.bytes_sent_rate_per_sec || n.bytes_sent || 0, speed: n.speed || 0 })) : [],
            system: system ? { hostname: system.hostname, os_name: system.os_name, os_version: system.os_version } : { hostname: 'unknown', os_name: '', os_version: '' },
            uptime: uptime || 'N/A',
            quicklook: quicklook ? { cpu_name: quicklook.cpu_name || '', cpu_hz_current: quicklook.cpu_hz_current || 0, cpu_hz: quicklook.cpu_hz || 0 } : null,
            processcount: processcount ? { total: processcount.total || 0, running: processcount.running || 0, sleeping: processcount.sleeping || 0, thread: processcount.thread || 0 } : null,
            containers: Array.isArray(containers) ? containers.map(c => ({ name: c.name, status: c.status, cpu_percent: c.cpu_percent || 0, memory_usage: c.memory_usage || 0, uptime: c.uptime || '', engine: c.engine || 'docker' })) : [],
            sensors: Array.isArray(sensors) ? sensors.map(s => ({ label: s.label, value: s.value, unit: s.unit || '', type: s.type || '' })) : [],
            gpu: Array.isArray(gpu) ? gpu.map(g => ({ name: g.name || '', mem: g.mem || 0, proc: g.proc || 0, gpu_id: g.gpu_id || 0, temperature: g.temperature || 0 })) : []
        });
    } catch (error) {
        console.error('Glances proxy error:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch Glances data' });
    }
});

module.exports = {
    name: 'glances',
    description: 'Glances system monitoring API proxy',
    version: '1.0.0',
    routes: router,
    mountPath: '/'
};
