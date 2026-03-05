import type { Widget, SystemResourcesContent } from '../types/types';
import type { WidgetRenderer, WidgetPlugin } from '../types/base-widget';
import { stopAllDragPropagation, dispatchWidgetUpdate, escapeHtml } from '../utils/dom';
import { getPingServerUrl, getAuthHeaders } from '../utils/api';
import { WidgetPoller } from '../utils/polling';
import { renderConfigPrompt, renderError } from '../utils/widgetRendering';
import { formatBytes } from '../utils/formatting';
import { populateCredentialSelect } from '../utils/credentials';

interface GlancesData {
  cpu: { total: number; user: number; system: number; iowait: number; cpucore: number; ctx_switches_rate: number; interrupts_rate: number };
  percpu: { cpu_number: number; total: number; user: number; system: number; iowait: number }[];
  mem: { total: number; used: number; percent: number; available: number; buffers: number; cached: number; active: number; inactive: number };
  swap: { total: number; used: number; percent: number };
  load: { min1: number; min5: number; min15: number; cpucore: number };
  fs: { device_name: string; fs_type: string; mnt_point: string; size: number; used: number; free: number; percent: number }[];
  diskio: { disk_name: string; read_bytes_rate: number; write_bytes_rate: number; read_count_rate: number; write_count_rate: number }[];
  network: { interface_name: string; rx: number; tx: number; speed: number }[];
  system: { hostname: string; os_name: string; os_version: string };
  uptime: string;
  quicklook: { cpu_name: string; cpu_hz_current: number; cpu_hz: number } | null;
  processcount: { total: number; running: number; sleeping: number; thread: number } | null;
  containers: { name: string; status: string; cpu_percent: number; memory_usage: number; uptime: string; engine: string }[];
  sensors: { label: string; value: number; unit: string; type: string }[];
  gpu: { name: string; mem: number; proc: number; gpu_id: number; temperature: number }[];
}

// SVG sparkline from numeric history
function sparkline(points: number[], w = 120, h = 28): string {
  if (points.length < 2) return '';
  const max = Math.max(...points, 1);
  const step = w / (points.length - 1);
  const pts = points.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" class="sparkline" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width=".75"/></svg>`;
}

function barColor(pct: number): string {
  if (pct < 60) return 'var(--accent, #4ade80)';
  if (pct < 80) return '#fbbf24';
  if (pct < 90) return '#f97316';
  return '#ef4444';
}

function progressBar(pct: number): string {
  if(pct <= 0) return '';
  return `<div class="sr-bar"><div class="sr-bar-fill" style="width:${pct}%;background:${barColor(pct)}"></div></div>`;
}

/** Stat card using existing .card / .card-header / .card-body / .card-row patterns */
function statCard(icon: string, label: string, value: string, rows: [string, string][], pct: number, spark: string): string {
  return `<div class="card">
    <div class="card-header">${icon}<span class="card-title">${label}</span></div>
    <div class="card-body" style="font-size:1.5em;font-weight:700">${value}</div>
    ${progressBar(pct)}
    ${spark ? `<div style="margin-top:4px">${spark}</div>` : ''}
    ${rows.map(([l, v]) => `<div class="card-row"><span class="card-row-label">${l}</span><span class="card-row-value">${v}</span></div>`).join('')}
  </div>`;
}

class SystemResourcesRenderer implements WidgetRenderer {
  private poller = new WidgetPoller();
  private history = new Map<string, number[]>();
  private maxPoints = 30;

  destroy() { this.poller.stopAll(); }

  configure(widget: Widget) { this.showConfigDialog(widget); }

  render(container: HTMLElement, widget: Widget) {
    const c = widget.content as SystemResourcesContent;
    this.poller.stop(widget.id);

    if (!c.host) {
      const btn = renderConfigPrompt(container, '<i class="fa-solid fa-microchip"></i>', 'Configure System Monitor', 'Connect to a Glances instance to monitor system resources.');
      btn.addEventListener('click', () => this.showConfigDialog(widget));
      return;
    }

    container.innerHTML = 'Loading…';
    container.classList.add('widget-loading');

    const fetchData = async () => {
      try {
        const url = new URL('/api/glances', getPingServerUrl());
        url.searchParams.set('host', c.host!);
        if (c.credentialId) url.searchParams.set('credentialId', c.credentialId.toString());

        const res = await fetch(url.toString(), { headers: getAuthHeaders(false) });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || `HTTP ${res.status}`); }
        const data: GlancesData = await res.json();
        container.classList.remove('widget-loading');
        this.renderData(container, data, c);
      } catch (err) {
        container.classList.remove('widget-loading');
        renderError(container, 'System Monitor Error', err, `Check host: ${c.host}`);
      }
    };

    this.poller.start(widget.id, fetchData, (c.refreshInterval || 5) * 1000);
  }

  private push(key: string, val: number): number[] {
    let arr = this.history.get(key);
    if (!arr) { arr = []; this.history.set(key, arr); }
    arr.push(val);
    if (arr.length > this.maxPoints) arr.shift();
    return arr;
  }

  private renderData(root: HTMLElement, d: GlancesData, c: SystemResourcesContent) {
    const cpuHist = this.push('cpu', d.cpu.total);
    const memHist = this.push('mem', d.mem.percent);
    const compact = c.displayMode === 'compact';
    let html = '';

    // System info header
    const sysInfo = [d.system.os_name, d.system.os_version].filter(Boolean).join(' ');
    const cpuName = d.quicklook?.cpu_name || '';
    const cpuHz = d.quicklook?.cpu_hz_current ? `${(d.quicklook.cpu_hz_current / 1e9).toFixed(2)} GHz` : '';
    // let htmltitle = `<div>
    // <h5>    <i class="fas fa-server"></i> ${escapeHtml(d.system.hostname)}</h5>
    // <subtitle>${[sysInfo, d.uptime ? `up ${d.uptime}` : ''].filter(Boolean).join(' · ')}</subtitle>
    // </div>`;
    html += `<div class="card-list">`;

    // CPU
    const cpuRows: [string, string][] = [
      ['User / System', `${d.cpu.user.toFixed(0)}% / ${d.cpu.system.toFixed(0)}%`],
    ];
    if (d.cpu.iowait > 0) cpuRows.push(['I/O Wait', `${d.cpu.iowait.toFixed(1)}%`]);
    if (cpuName) cpuRows.push(['Model', `${cpuName}${cpuHz ? ` · ${cpuHz}` : ''}`]);
    if (d.cpu.cpucore) cpuRows.push(['Cores', `${d.cpu.cpucore}`]);
    html += statCard('<i class="fas fa-microchip"></i>', 'CPU', `${d.cpu.total.toFixed(1)}%`,
      cpuRows, d.cpu.total, sparkline(cpuHist));

    // Per-CPU bars
    if (c.showPerCpu && d.percpu.length > 0) {
      html += `<div class="card">
        <div class="card-header"><i class="fas fa-bars-staggered"></i><span class="card-title">Per-Core</span></div>
        ${d.percpu.map(core => {
        const pct = Math.min(core.total, 100);
        return `<div class="card-row"><span class="card-row-label">${core.cpu_number}</span><div class="flex-1">${progressBar(pct)}</div><span class="card-row-value">${pct.toFixed(0)}%</span></div>`;
      }).join('')}
      </div>`;
    }

    // Memory
    const memRows: [string, string][] = [
      ['Used / Total', `${formatBytes(d.mem.used)} / ${formatBytes(d.mem.total)}`],
    ];
    if (d.mem.available) memRows.push(['Available', formatBytes(d.mem.available)]);
    if (d.mem.cached) memRows.push(['Cached', formatBytes(d.mem.cached)]);
    if (d.mem.buffers) memRows.push(['Buffers', formatBytes(d.mem.buffers)]);
    html += statCard('<i class="fas fa-memory"></i>', 'Memory', `${d.mem.percent.toFixed(1)}%`,
      memRows, d.mem.percent, sparkline(memHist));

    // Load
    if (!compact) {
      const loadPct = (d.load.min1 / (d.load.cpucore || 1)) * 100;
      html += statCard('<i class="fas fa-tachometer-alt"></i>', 'Load', d.load.min1.toFixed(2),
        [['5m / 15m', `${d.load.min5.toFixed(2)} / ${d.load.min15.toFixed(2)}`]], loadPct, '');
    }

    // Processes
    if (d.processcount && !compact) {
      const p = d.processcount;
      html += statCard('<i class="fas fa-list-ol"></i>', 'Processes', `${p.total}`,
        [['Running', `${p.running}`], ['Sleeping', `${p.sleeping}`], ['Threads', `${p.thread}`]], 0, '');
    }

    // Filesystems
    const fsList = c.showAllFs ? d.fs : d.fs.slice(0, 1);
    for (const fs of fsList) {
      const fsLabel = fs.mnt_point === '/rootfs' ? '/' : fs.mnt_point;
      html += statCard('<i class="fas fa-hard-drive"></i>', fsLabel, `${fs.percent.toFixed(1)}%`,
        [['Used / Total', `${formatBytes(fs.used)} / ${formatBytes(fs.size)}`],
        ...(fs.fs_type ? [['Type', fs.fs_type] as [string, string]] : [])], fs.percent, '');
    }

    // Disk I/O
    if (c.showDiskIO && d.diskio.length > 0 && !compact) {
      html += `<div class="card">
        <div class="card-header"><i class="fas fa-arrow-right-arrow-left"></i><span class="card-title">Disk I/O</span></div>
        ${d.diskio.map(disk => {
        const rHist = this.push(`dio-r-${disk.disk_name}`, disk.read_bytes_rate);
        return `<div class="card-row"><span class="card-row-label">${escapeHtml(disk.disk_name)}</span><span class="card-row-value">R ${formatBytes(disk.read_bytes_rate)}/s · W ${formatBytes(disk.write_bytes_rate)}/s</span></div>
            <div style="margin-top:2px">${sparkline(rHist, 100, 20)}</div>`;
      }).join('')}
      </div>`;
    }

    // Network
    const netList = c.showAllNet ? d.network : d.network.slice(0, 1);
    for (const net of netList) {
      const rxHist = this.push(`net-rx-${net.interface_name}`, net.rx);
      const speedLabel = net.speed > 0 ? (net.speed >= 1e9 ? (net.speed / 1e9).toFixed(0) + ' Gbps' : (net.speed / 1e6).toFixed(0) + ' Mbps') : '';
      const netRows: [string, string][] = [
        ['Download', `${formatBytes(net.rx)}/s`],
        ['Upload', `${formatBytes(net.tx)}/s`],
      ];
      if (speedLabel) netRows.push(['Link Speed', speedLabel]);
      html += statCard('<i class="fas fa-network-wired"></i>', net.interface_name, `↓ ${formatBytes(net.rx)}/s`,
        netRows, 0, sparkline(rxHist));
    }

    // Swap
    if (d.swap.total > 0 && !compact) {
      html += statCard('<i class="fas fa-rotate"></i>', 'Swap', `${d.swap.percent.toFixed(1)}%`,
        [['Used / Total', `${formatBytes(d.swap.used)} / ${formatBytes(d.swap.total)}`]], d.swap.percent, '');
    }

    // Sensors
    if (d.sensors.length > 0 && !compact) {
      html += `<div class="card">
        <div class="card-header"><i class="fas fa-temperature-half"></i><span class="card-title">Sensors</span></div>
        ${d.sensors.map(s =>
        `<div class="card-row"><span class="card-row-label">${escapeHtml(s.label)}</span><span class="card-row-value">${s.value}${s.unit || '°C'}</span></div>`
      ).join('')}
      </div>`;
    }

    // GPU
    if (d.gpu.length > 0 && !compact) {
      for (const g of d.gpu) {
        const gpuHist = this.push(`gpu-${g.gpu_id}`, g.proc);
        html += statCard('<i class="fas fa-display"></i>', g.name || `GPU ${g.gpu_id}`, `${g.proc.toFixed(0)}%`,
          [['VRAM', `${g.mem.toFixed(0)}%`], ...(g.temperature ? [['Temp', `${g.temperature}°C`] as [string, string]] : [])], g.proc, sparkline(gpuHist));
      }
    }

    // Containers
    if (c.showContainers && d.containers.length > 0 && !compact) {
      html += `<div class="card">
        <div class="card-header"><i class="fab fa-docker"></i><span class="card-title">Containers (${d.containers.length})</span></div>
        <div class="card-items">${d.containers.slice(0, 20).map(ct => {
        const isUp = ct.status === 'running' || ct.status === 'healthy';
        const badgeCls = isUp ? 'badge-success' : 'badge-secondary';
        return `<div class="card-item">
            <span class="badge ${badgeCls}">${escapeHtml(ct.status)}</span>
            <span class="card-item-name">${escapeHtml(ct.name)}</span>
            <subtitle>${ct.cpu_percent.toFixed(1)}% · ${formatBytes(ct.memory_usage)} · ${escapeHtml(ct.uptime)}</subtitle>
          </div>`;
      }).join('')}</div>
      </div>`;
    }

    html += `</div>`;
    root.innerHTML = html;
  }

  private showConfigDialog(widget: Widget) {
    const c = widget.content as SystemResourcesContent;
    const overlay = document.createElement('div');
    overlay.className = 'widget-overlay dark';

    const dialog = document.createElement('div');
    dialog.className = 'widget-dialog large';

    dialog.innerHTML = `
      <h3 class="widget-dialog-title large">
        <i class="fa-solid fa-microchip"></i> System Monitor Configuration
      </h3>

      <div class="widget-dialog-field large-margin">
        <label class="widget-dialog-label medium">Glances API URL *</label>
        <input type="text" id="sr-host" value="${c.host || ''}" placeholder="http://192.168.1.10:61208" class="widget-dialog-input extended"/>
        <small class="widget-field-hint">Glances must be running with <code>glances -w</code></small>
      </div>

      <div class="widget-dialog-field large-margin">
        <label class="widget-dialog-label medium">Saved Credentials</label>
        <select id="sr-cred" class="widget-dialog-input extended"><option value="">None (no auth)</option></select>
        <small class="widget-field-hint">Only needed if Glances has password auth enabled</small>
      </div>

      <div class="widget-dialog-field large-margin">
        <label class="widget-dialog-label medium">Display Mode</label>
        <select id="sr-mode" class="widget-dialog-input extended">
          <option value="full" ${c.displayMode !== 'compact' ? 'selected' : ''}>Full</option>
          <option value="compact" ${c.displayMode === 'compact' ? 'selected' : ''}>Compact</option>
        </select>
      </div>

      <div class="widget-dialog-field large-margin">
        <label class="widget-dialog-label medium">Refresh Interval (seconds)</label>
        <input type="number" id="sr-interval" value="${c.refreshInterval || 5}" min="2" max="300" class="widget-dialog-input extended"/>
      </div>

      <div class="widget-dialog-field large-margin">
        <label class="widget-dialog-label medium">Display Options</label>
      </div>
      <div class="widget-dialog-field large-margin">
        <label class="widget-checkbox-label"><input type="checkbox" id="sr-percpu" class="widget-checkbox" ${c.showPerCpu ? 'checked' : ''}/><span>Show per-core CPU bars</span></label>
      </div>
      <div class="widget-dialog-field large-margin">
        <label class="widget-checkbox-label"><input type="checkbox" id="sr-containers" class="widget-checkbox" ${c.showContainers ? 'checked' : ''}/><span>Show Docker containers</span></label>
      </div>
      <div class="widget-dialog-field large-margin">
        <label class="widget-checkbox-label"><input type="checkbox" id="sr-diskio" class="widget-checkbox" ${c.showDiskIO ? 'checked' : ''}/><span>Show disk I/O rates</span></label>
      </div>
      <div class="widget-dialog-field large-margin">
        <label class="widget-checkbox-label"><input type="checkbox" id="sr-allfs" class="widget-checkbox" ${c.showAllFs ? 'checked' : ''}/><span>Show all filesystems</span></label>
      </div>
      <div class="widget-dialog-field large-margin">
        <label class="widget-checkbox-label"><input type="checkbox" id="sr-allnet" class="widget-checkbox" ${c.showAllNet ? 'checked' : ''}/><span>Show all network interfaces</span></label>
      </div>

      <div class="widget-dialog-buttons border-top">
        <div id="sr-cancel" class="btn btn-small btn-secondary">Cancel</div>
        <div id="sr-save" class="btn btn-small btn-primary">Save</div>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    populateCredentialSelect(dialog.querySelector('#sr-cred')!, 'glances', c.credentialId);
    stopAllDragPropagation(dialog);

    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    dialog.querySelector('#sr-cancel')!.addEventListener('click', close);

    dialog.querySelector('#sr-save')!.addEventListener('click', () => {
      const host = (dialog.querySelector('#sr-host') as HTMLInputElement).value.trim();
      if (!host) return;
      const credVal = (dialog.querySelector('#sr-cred') as HTMLSelectElement).value;
      dispatchWidgetUpdate(widget.id, {
        host,
        credentialId: credVal ? parseInt(credVal) : undefined,
        displayMode: (dialog.querySelector('#sr-mode') as HTMLSelectElement).value as 'full' | 'compact',
        refreshInterval: parseInt((dialog.querySelector('#sr-interval') as HTMLInputElement).value) || 5,
        showPerCpu: (dialog.querySelector('#sr-percpu') as HTMLInputElement).checked,
        showContainers: (dialog.querySelector('#sr-containers') as HTMLInputElement).checked,
        showDiskIO: (dialog.querySelector('#sr-diskio') as HTMLInputElement).checked,
        showAllFs: (dialog.querySelector('#sr-allfs') as HTMLInputElement).checked,
        showAllNet: (dialog.querySelector('#sr-allnet') as HTMLInputElement).checked,
      } as SystemResourcesContent);
      close();
    });
  }
}

export const widget: WidgetPlugin = {
  type: 'glances',
  name: 'System Resources',
  icon: '<i class="fa-solid fa-microchip"></i>',
  description: 'Monitor CPU, memory, disk, network, processes, containers and more via Glances',
  renderer: new SystemResourcesRenderer(),
  defaultSize: { w: 700, h: 550 },
  defaultContent: { refreshInterval: 5, showPerCpu: false, showContainers: true, showDiskIO: false, showAllFs: false, showAllNet: false },
  hasSettings: true
};
