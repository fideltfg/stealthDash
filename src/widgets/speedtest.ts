import type { Widget, SpeedtestContent } from '../types/types';
import type { WidgetRenderer, WidgetPlugin } from '../types/base-widget';
import { stopAllDragPropagation, dispatchWidgetUpdate, escapeHtml, injectWidgetStyles } from '../utils/dom';
import { getPingServerUrl, getAuthHeaders } from '../utils/api';
import { WidgetPoller } from '../utils/polling';
import { renderConfigPrompt, renderError } from '../utils/widgetRendering';
import { formatTimeAgo } from '../utils/formatting';
import { populateCredentialSelect } from '../utils/credentials';

interface SpeedResult {
  download: number; upload: number; ping: number; jitter?: number;
  server_name?: string; timestamp: string;
}

const SPEEDTEST_STYLES = `
.speed-card { text-align: center; }
.speed-val { font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums; }
.speed-unit { font-size: 12px; color: var(--muted); text-transform: uppercase; }
.speed-chart { width: 100%; height: 140px; display: block; }
`;

// SVG line chart for speed history
function chart(dl: number[], ul: number[], w = 500, h = 140): string {
  if (dl.length < 2) return '';
  const all = [...dl, ...ul];
  const max = Math.max(...all, 1) * 1.1;
  const step = w / (dl.length - 1);
  const y = (v: number) => (h - (v / max) * h).toFixed(1);
  const line = (pts: number[], color: string) => {
    const d = pts.map((v, i) => `${(i * step).toFixed(1)},${y(v)}`).join(' ');
    return `<polyline points="${d}" fill="none" stroke="${color}" stroke-width="1.5"/>`;
  };
  // Grid lines
  const gridLines = [0.25, 0.5, 0.75].map(f => {
    const gy = (h - h * f).toFixed(1);
    return `<line x1="0" y1="${gy}" x2="${w}" y2="${gy}" stroke="var(--border)" stroke-width="0.5" stroke-dasharray="4"/>`;
  }).join('');
  // Axis labels
  const maxLabel = `<text x="2" y="12" fill="var(--muted)" font-size="10">${Math.round(max)} Mbps</text>`;
  return `<svg viewBox="0 0 ${w} ${h + 16}" class="speed-chart" preserveAspectRatio="none">
    ${gridLines}${line(dl, '#4ade80')}${line(ul, '#60a5fa')}${maxLabel}
    <text x="${w - 60}" y="${h + 14}" fill="#4ade80" font-size="10">↓ Download</text>
    <text x="${w - 180}" y="${h + 14}" fill="#60a5fa" font-size="10">↑ Upload</text>
  </svg>`;
}

function speedCard(icon: string, _label: string, value: string, unit: string, sub: string, color: string): string {
  return `<div class="card speed-card">
    <div style="color:${color}">${icon}</div>
    <div class="speed-val" style="color:${color}">${value}</div>
    <div class="speed-unit">${unit}</div>
    <subtitle>${escapeHtml(sub)}</subtitle>
  </div>`;
}

class SpeedtestRenderer implements WidgetRenderer {
  private poller = new WidgetPoller();

  destroy() { this.poller.stopAll(); }
  configure(widget: Widget) { this.showConfigDialog(widget); }

  render(container: HTMLElement, widget: Widget) {
    injectWidgetStyles('speedtest', SPEEDTEST_STYLES);
    const c = widget.content as SpeedtestContent;
    this.poller.stop(widget.id);

    if (!c.host) {
      const btn = renderConfigPrompt(container, '<i class="fa-solid fa-gauge-high"></i>', 'Configure Speedtest', 'Connect to a Speedtest Tracker instance.');
      btn.addEventListener('click', () => this.showConfigDialog(widget));
      return;
    }

    container.innerHTML = '<div class="speed-root widget-loading centered">Loading…</div>';
    const root = container.querySelector('.speed-root') as HTMLElement;

    const fetchData = async () => {
      try {
        const url = new URL('/api/speedtest', getPingServerUrl());
        url.searchParams.set('host', c.host!);
        if (c.credentialId) url.searchParams.set('credentialId', c.credentialId.toString());
        url.searchParams.set('days', (c.historyDays || 7).toString());

        const res = await fetch(url.toString(), { headers: getAuthHeaders(false) });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || `HTTP ${res.status}`); }
        const data = await res.json();
        this.renderData(root, data, c);
      } catch (err) {
        renderError(root, 'Speedtest Error', err, `Check host: ${c.host}`);
      }
    };

    this.poller.start(widget.id, fetchData, (c.refreshInterval || 300) * 1000);
  }

  private renderData(root: HTMLElement, data: { latest: SpeedResult; history: SpeedResult[]; averages: { download: number; upload: number; ping: number } }, c: SpeedtestContent) {
    const { latest, history, averages } = data;
    let html = '<div class="grid grid-3 gap-8">';
    html += speedCard('<i class="fas fa-arrow-down"></i>', 'Download',
      latest.download.toFixed(1), 'Mbps', `avg: ${averages.download.toFixed(1)}`, '#4ade80');
    html += speedCard('<i class="fas fa-arrow-up"></i>', 'Upload',
      latest.upload.toFixed(1), 'Mbps', `avg: ${averages.upload.toFixed(1)}`, '#60a5fa');
    html += speedCard('<i class="fas fa-circle-dot"></i>', 'Ping',
      latest.ping.toFixed(1), 'ms', latest.jitter != null ? `jitter: ${latest.jitter.toFixed(1)} ms` : `avg: ${averages.ping.toFixed(1)} ms`, 'var(--accent)');
    html += '</div>';

    if (c.showChart !== false && history.length >= 2) {
      const dl = history.map(h => h.download);
      const ul = history.map(h => h.upload);
      html += `<div class="speed-chart-wrap mt-12">${chart(dl, ul)}</div>`;
    }

    const ago = formatTimeAgo(new Date(latest.timestamp).getTime());
    html += `<subtitle class="mt-12">Last test: ${ago}${latest.server_name ? ` · ${escapeHtml(latest.server_name)}` : ''}</subtitle>`;
    root.innerHTML = html;
  }

  private showConfigDialog(widget: Widget) {
    const c = widget.content as SpeedtestContent;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay widget-overlay';
    const modal = document.createElement('div');
    modal.className = 'modal widget-dialog';
    modal.innerHTML = `
      <h2 class="widget-dialog-title">Speedtest Configuration</h2>
      <form id="speed-form" class="flex flex-column gap-16">
        <div>
          <label class="widget-dialog-label">Speedtest Tracker URL *</label>
          <input type="text" id="speed-host" value="${c.host || ''}" placeholder="http://speedtest.local:8765" required class="widget-dialog-input"/>
          <small class="widget-dialog-hint">Your self-hosted Speedtest Tracker instance</small>
        </div>
        <div>
          <label class="widget-dialog-label">Saved Credentials</label>
          <select id="speed-cred" class="widget-dialog-input"><option value="">None</option></select>
          <small class="widget-dialog-hint">API token for authenticated instances</small>
        </div>
        <div>
          <label class="widget-dialog-label">Show History Chart</label>
          <select id="speed-chart" class="widget-dialog-input">
            <option value="true" ${c.showChart !== false ? 'selected' : ''}>Yes</option>
            <option value="false" ${c.showChart === false ? 'selected' : ''}>No</option>
          </select>
        </div>
        <div>
          <label class="widget-dialog-label">History Range (days)</label>
          <input type="number" id="speed-days" value="${c.historyDays || 7}" min="1" max="90" class="widget-dialog-input"/>
        </div>
        <div>
          <label class="widget-dialog-label">Refresh Interval (seconds)</label>
          <input type="number" id="speed-interval" value="${c.refreshInterval || 300}" min="30" max="3600" class="widget-dialog-input"/>
        </div>
        <div class="widget-dialog-buttons">
          <button type="submit" class="btn btn-small btn-primary">Save</button>
          <button type="button" id="speed-cancel" class="btn btn-small btn-secondary">Cancel</button>
        </div>
      </form>`;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    populateCredentialSelect(modal.querySelector('#speed-cred')!, 'speedtest_tracker', c.credentialId);
    stopAllDragPropagation(modal);

    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    modal.querySelector('#speed-cancel')!.addEventListener('click', close);
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });

    modal.querySelector('#speed-form')!.addEventListener('submit', e => {
      e.preventDefault();
      const host = (modal.querySelector('#speed-host') as HTMLInputElement).value.trim();
      const credVal = (modal.querySelector('#speed-cred') as HTMLSelectElement).value;
      dispatchWidgetUpdate(widget.id, {
        host,
        credentialId: credVal ? parseInt(credVal) : undefined,
        showChart: (modal.querySelector('#speed-chart') as HTMLSelectElement).value === 'true',
        historyDays: parseInt((modal.querySelector('#speed-days') as HTMLInputElement).value) || 7,
        refreshInterval: parseInt((modal.querySelector('#speed-interval') as HTMLInputElement).value) || 300
      } as SpeedtestContent);
      close();
    });
  }
}

export const widget: WidgetPlugin = {
  type: 'speedtest',
  name: 'Speedtest',
  icon: '<i class="fa-solid fa-gauge-high"></i>',
  description: 'Display internet speed results from Speedtest Tracker',
  renderer: new SpeedtestRenderer(),
  defaultSize: { w: 650, h: 450 },
  defaultContent: { refreshInterval: 300, showChart: true, historyDays: 7 },
  hasSettings: true
};
