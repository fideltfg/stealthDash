import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';
import { stopWidgetDragPropagation, stopAllDragPropagation, dispatchWidgetUpdate, injectWidgetStyles } from '../utils/dom';
import { getPingServerUrl } from '../utils/api';
import { WidgetPoller } from '../utils/polling';

interface PingResult {
  timestamp: number;
  responseTime: number | null; // null = timeout/failure
  success: boolean;
}

interface UptimeTarget {
  host: string;
  label?: string;
}

const MAX_HISTORY = 60;
const DISPLAY_BARS = 30;

const UPTIME_STYLES = `
.uptime-widget { display: flex; flex-direction: column; width: 100%; height: 100%; overflow-x: hidden; overflow-y: auto; gap: 8px; padding: 2px; box-sizing: border-box; }
.uptime-target-card { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; min-width: 0; overflow: hidden; }
.uptime-card-header { display: flex; align-items: center; gap: 8px; min-width: 0; overflow: hidden; }
.uptime-status-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; transition: background 300ms, box-shadow 300ms; margin-right: 6px; }
.uptime-status-dot.up { background: #22c55e; box-shadow: 0 0 6px #22c55e88; }
.uptime-status-dot.down { background: #ef4444; box-shadow: 0 0 6px #ef444488; }
.uptime-status-dot.unknown { background: var(--text-muted, #888); }
.uptime-target-name {flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.uptime-current-rtt { font-size: 11px; color: var(--text-muted); white-space: nowrap; flex-shrink: 0; }
.uptime-current-rtt.timeout { color: #ef4444; }
.uptime-chart-row { display: flex; align-items: flex-end; gap: 2px; height: 25px; min-width: 0; overflow: hidden; padding: 2px 0; }
.uptime-bar-wrap { flex: 1; display: flex; align-items: flex-end; position: relative; height: 100%; cursor: default; }
.uptime-bar { width: 100%; border-radius: 3px; transition: height 120ms; }
.uptime-bar-placeholder { width: 100%; height: 100%; background: rgba(128,128,128,0.12); border-radius: 3px; }
.uptime-bar-wrap:hover .uptime-bar-tooltip { opacity: 1; visibility: visible; }
.uptime-bar-tooltip { position: absolute; bottom: calc(100% + 4px); left: 50%; transform: translateX(-50%); background: var(--surface); border: 1px solid var(--border); padding: 3px 8px; border-radius: 4px; font-size: 10px; line-height: 1.5; opacity: 0; visibility: hidden; transition: opacity 120ms; pointer-events: none; z-index: 1000; white-space: nowrap; text-align: center; }
.uptime-bar-excellent { background: #22c55e; }
.uptime-bar-good { background: #84cc16; }
.uptime-bar-ok { background: #eab308; }
.uptime-bar-slow { background: #f97316; }
.uptime-bar-very-slow { background: #ef4444; }
.uptime-bar-failed { background: #ef4444; }
.uptime-stats-row { display: flex; gap: 0; }
.uptime-stat { display: flex; flex-direction: column; align-items: center; flex: 1; }
.uptime-stat-value { color: var(--text); }
.uptime-stat-value.good { color: #22c55e; }
.uptime-stat-value.warn { color: #eab308; }
.uptime-stat-value.bad { color: #ef4444; }
.uptime-card-actions { display: flex; justify-content: flex-end; gap: 6px; }
.uptime-action-btn { font-size: 8px; padding: 1px 1px; border: 1px solid var(--border); border-radius: 4px; background: transparent; color: var(--text-muted); cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: border-color 120ms, color 120ms, background 120ms; white-space: nowrap; }
.uptime-action-btn:hover { border-color: var(--accent, #6366f1); color: var(--accent, #6366f1); background: rgba(99,102,241,0.08); }
.uptime-popup-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 9999; display: flex; align-items: center; justify-content: center; }
.uptime-popup { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 20px; width: 580px; max-width: 94vw; max-height: 82vh; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
.uptime-popup-header { display: flex; align-items: center; gap: 8px; }
.uptime-popup-title { font-size: 15px; font-weight: 700; flex: 1; }
.uptime-popup-title-sub { font-size: 11px; font-weight: 400; color: var(--text-muted); display: block; margin-top: 1px; }
.uptime-popup-close { cursor: pointer; color: var(--text-muted); font-size: 18px; line-height: 1; padding: 2px 6px; border-radius: 4px; background: transparent; border: none; }
.uptime-popup-close:hover { color: var(--text); background: var(--bg-secondary); }
.uptime-popup-stats { display: flex; background: var(--bg-secondary); border-radius: 6px; padding: 10px; }
.uptime-popup-stat { display: flex; flex-direction: column; align-items: center; flex: 1; }
.uptime-popup-stat-value { font-size: 18px; font-weight: 700; }
.uptime-popup-stat-label { font-size: 9px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.uptime-section-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 4px; }
.uptime-history-chart { height: 70px; display: flex; align-items: flex-end; gap: 2px; }
.uptime-history-log { display: flex; flex-direction: column; gap: 1px; max-height: 240px; overflow-y: auto; }
.uptime-history-row { display: grid; grid-template-columns: 110px 54px 1fr; gap: 8px; font-size: 11px; padding: 4px 6px; border-radius: 4px; }
.uptime-history-row:nth-child(odd) { background: var(--bg-secondary); }
.uptime-history-row-header { font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--text-muted); }
.uptime-history-status.success { color: #22c55e; font-weight: 600; }
.uptime-history-status.fail { color: #ef4444; font-weight: 600; }
.uptime-trace-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.uptime-trace-table th { text-align: left; border-bottom: 1px solid var(--border); padding: 6px 8px; color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
.uptime-trace-table td { padding: 5px 8px; border-bottom: 1px solid rgba(128,128,128,0.1); font-size: 11px; }
.uptime-trace-table tr:last-child td { border-bottom: none; }
.uptime-trace-hop { color: var(--text-muted); text-align: center; width: 32px; }
.uptime-trace-addr { font-family: monospace; color: var(--text); }
.uptime-trace-timeout { color: var(--text-muted); font-family: monospace; }
.uptime-trace-rtt { color: #22c55e; font-family: monospace; }
.uptime-popup-loading { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 32px; color: var(--text-muted); }
.uptime-popup-error { color: #ef4444; padding: 10px; font-size: 12px; background: rgba(239,68,68,0.1); border-radius: 6px; font-family: monospace; }
.uptime-config-targets { display: flex; flex-direction: column; gap: 6px; }
.uptime-config-target-row { display: flex; gap: 6px; align-items: center; }
.uptime-config-target-host { flex: 2; }
.uptime-config-target-label-input { flex: 1; }
.uptime-config-remove-btn { flex-shrink: 0; padding: 5px 8px; background: transparent; border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text-muted); font-size: 12px; line-height: 1; }
.uptime-config-remove-btn:hover { border-color: #ef4444; color: #ef4444; }
.uptime-config-section-title { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 2px; }
.uptime-config-col-header { font-size: 10px; color: var(--text-muted); margin-bottom: 4px; display: grid; grid-template-columns: 20px 2fr 1fr 24px; gap: 6px; }
.uptime-config-global { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 4px; }
.uptime-config-drag-handle { cursor: grab; color: var(--text-muted); flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 20px; padding: 0 2px; border-radius: 3px; transition: color 120ms; user-select: none; }
.uptime-config-drag-handle:hover { color: var(--text); }
.uptime-config-drag-handle:active { cursor: grabbing; }
.uptime-config-target-row.dragging { opacity: 0.35; }
.uptime-config-target-row.drag-over { outline: 2px solid var(--accent, #6366f1); outline-offset: 1px; border-radius: 4px; }
`;

export class UptimeWidgetRenderer implements WidgetRenderer {
  private poller = new WidgetPoller();
  // In-memory cache; localStorage is the source of truth across reloads
  private pingHistory: Map<string, Map<string, PingResult[]>> = new Map();

  destroy(): void {
    this.poller.stopAll();
  }

  private storageKey(widgetId: string, host: string): string {
    return `uptime-history:${widgetId}:${host}`;
  }

  private saveHistory(widgetId: string, host: string, hist: PingResult[]): void {
    try {
      localStorage.setItem(this.storageKey(widgetId, host), JSON.stringify(hist));
    } catch {
      // localStorage full or unavailable — continue with in-memory only
    }
  }

  private loadHistory(widgetId: string, host: string): PingResult[] {
    try {
      const raw = localStorage.getItem(this.storageKey(widgetId, host));
      if (raw) return JSON.parse(raw) as PingResult[];
    } catch {
      // Corrupted entry — start fresh
      localStorage.removeItem(this.storageKey(widgetId, host));
    }
    return [];
  }

  /** Remove localStorage entries for hosts that are no longer assigned to this widget */
  private pruneStaleHistory(widgetId: string, activeHosts: Set<string>): void {
    const prefix = `uptime-history:${widgetId}:`;
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const host = key.slice(prefix.length);
        if (!activeHosts.has(host)) toRemove.push(key);
      }
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  }

  /** Resolve targets from widget content, supporting new multi-target and legacy single-target formats */
  private getTargets(widget: Widget): UptimeTarget[] {
    const content = widget.content as any;
    if (content.targets && Array.isArray(content.targets) && content.targets.length > 0) {
      return content.targets.filter((t: any) => t && typeof t.host === 'string' && t.host.trim());
    }
    if (content.target && typeof content.target === 'string' && content.target.trim()) {
      return [{ host: content.target.trim() }];
    }
    return [];
  }

  private getTargetHistory(widgetId: string, host: string): PingResult[] {
    // Serve from in-memory cache; populate from localStorage on first access
    if (!this.pingHistory.get(widgetId)?.has(host)) {
      const fromStorage = this.loadHistory(widgetId, host);
      if (!this.pingHistory.has(widgetId)) this.pingHistory.set(widgetId, new Map());
      this.pingHistory.get(widgetId)!.set(host, fromStorage);
    }
    return this.pingHistory.get(widgetId)!.get(host)!;
  }

  private addToTargetHistory(widgetId: string, host: string, result: PingResult): void {
    const hist = this.getTargetHistory(widgetId, host); // ensures cache is warm
    hist.push(result);
    if (hist.length > MAX_HISTORY) hist.shift();
    this.saveHistory(widgetId, host, hist);
  }

  configure(widget: Widget): void {
    const content = widget.content as any;
    const existingTargets = this.getTargets(widget);

    let dialogTargets: UptimeTarget[] = existingTargets.length > 0
      ? existingTargets.map(t => ({ ...t }))
      : [{ host: '' }];

    const overlay = document.createElement('div');
    overlay.className = 'widget-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'widget-dialog';

    dialog.innerHTML = `
      <h3 class="widget-dialog-title">Configure Uptime Monitor</h3>
      <div class="widget-dialog-field" id="targets-section">
        <div class="uptime-config-section-title">Targets</div>
        <div class="uptime-config-col-header">
          <span></span><span>Host / IP Address</span><span>Label (optional)</span><span></span>
        </div>
        <div id="uptime-target-rows" class="uptime-config-targets"></div>
        <button id="add-target-btn" class="btn btn-small btn-secondary" style="align-self:flex-start;margin-top:4px;">
          <i class="fas fa-plus"></i> Add Target
        </button>
      </div>
      <div class="uptime-config-global widget-dialog-field">
        <div class="widget-dialog-field">
          <label class="widget-dialog-label">Ping Interval (seconds)</label>
          <input type="number" id="uptime-interval" class="widget-dialog-input" value="${content.interval || 30}" min="5" max="300" />
        </div>
        <div class="widget-dialog-field">
          <label class="widget-dialog-label">Timeout (ms)</label>
          <input type="number" id="uptime-timeout" class="widget-dialog-input" value="${content.timeout || 5000}" min="500" max="30000" step="500" />
        </div>
      </div>
      <div class="widget-dialog-buttons">
        <div id="cancel-btn" class="btn btn-small btn-secondary">Cancel</div>
        <div id="save-btn" class="btn btn-small btn-primary">Save</div>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const rowsContainer = dialog.querySelector('#uptime-target-rows') as HTMLElement;

    let dragSourceIndex: number | null = null;

    const renderRows = () => {
      rowsContainer.innerHTML = '';
      dialogTargets.forEach((t, i) => {
        const row = document.createElement('div');
        row.className = 'uptime-config-target-row';

        const dragHandle = document.createElement('span');
        dragHandle.className = 'uptime-config-drag-handle';
        dragHandle.innerHTML = '<i class="fas fa-grip-vertical"></i>';
        dragHandle.title = 'Drag to reorder';
        // Only allow drag to start from the handle
        dragHandle.addEventListener('mousedown', () => { row.draggable = true; });

        row.addEventListener('dragstart', (e) => {
          dragSourceIndex = i;
          e.dataTransfer!.effectAllowed = 'move';
          e.dataTransfer!.setData('text/plain', String(i));
          setTimeout(() => row.classList.add('dragging'), 0);
        });
        row.addEventListener('dragend', () => {
          row.draggable = false;
          row.classList.remove('dragging');
          dragSourceIndex = null;
          rowsContainer.querySelectorAll('.uptime-config-target-row').forEach(r => r.classList.remove('drag-over'));
        });
        row.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (dragSourceIndex === null || dragSourceIndex === i) return;
          e.dataTransfer!.dropEffect = 'move';
          rowsContainer.querySelectorAll('.uptime-config-target-row').forEach(r => r.classList.remove('drag-over'));
          row.classList.add('drag-over');
        });
        row.addEventListener('dragleave', () => {
          row.classList.remove('drag-over');
        });
        row.addEventListener('drop', (e) => {
          e.preventDefault();
          row.classList.remove('drag-over');
          if (dragSourceIndex !== null && dragSourceIndex !== i) {
            const [moved] = dialogTargets.splice(dragSourceIndex, 1);
            dialogTargets.splice(i, 0, moved);
            renderRows();
          }
        });

        const hostInput = document.createElement('input');
        hostInput.type = 'text';
        hostInput.className = 'widget-dialog-input uptime-config-target-host';
        hostInput.placeholder = 'e.g. google.com or 192.168.1.1';
        hostInput.value = t.host;
        hostInput.addEventListener('input', () => { dialogTargets[i] = { ...dialogTargets[i], host: hostInput.value.trim() }; });
        stopWidgetDragPropagation(hostInput);

        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.className = 'widget-dialog-input uptime-config-target-label-input';
        labelInput.placeholder = 'Label (optional)';
        labelInput.value = t.label || '';
        labelInput.addEventListener('input', () => {
          const lbl = labelInput.value.trim();
          dialogTargets[i] = { ...dialogTargets[i], label: lbl || undefined };
        });
        stopWidgetDragPropagation(labelInput);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'uptime-config-remove-btn';
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';
        removeBtn.title = 'Remove this target';
        removeBtn.addEventListener('click', () => {
          dialogTargets.splice(i, 1);
          if (dialogTargets.length === 0) dialogTargets.push({ host: '' });
          renderRows();
        });
        stopWidgetDragPropagation(removeBtn);

        row.appendChild(dragHandle);
        row.appendChild(hostInput);
        row.appendChild(labelInput);
        row.appendChild(removeBtn);
        rowsContainer.appendChild(row);
      });
    };

    renderRows();

    const addBtn = dialog.querySelector('#add-target-btn')!;
    addBtn.addEventListener('click', () => {
      dialogTargets.push({ host: '' });
      renderRows();
    });
    stopWidgetDragPropagation(addBtn as HTMLElement);

    const close = () => overlay.remove();
    dialog.querySelector('#cancel-btn')!.addEventListener('click', close);
    overlay.addEventListener('click', (e) => e.target === overlay && close());

    dialog.querySelector('#save-btn')!.addEventListener('click', () => {
      const validTargets = dialogTargets
        .map(t => ({ ...t, host: (t.host || '').trim() }))
        .filter(t => t.host.length > 0);
      if (validTargets.length === 0) return;

      const interval = parseInt((dialog.querySelector('#uptime-interval') as HTMLInputElement).value) || 30;
      const timeout = parseInt((dialog.querySelector('#uptime-timeout') as HTMLInputElement).value) || 5000;

      dispatchWidgetUpdate(widget.id, { targets: validTargets, interval, timeout });
      close();
    });

    stopAllDragPropagation(dialog);
  }

  render(container: HTMLElement, widget: Widget): void {
    injectWidgetStyles('uptime', UPTIME_STYLES);

    const div = document.createElement('div');
    div.className = 'card-list';

    const targets = this.getTargets(widget);
    if (targets.length === 0) {
      this.renderConfigScreen(div, widget);
    } else {
      this.renderUptimeDisplay(div, widget);

      const content = widget.content as { interval?: number };
      const intervalMs = (content.interval || 30) * 1000;
      this.poller.start(widget.id, () => this.performAllPings(widget, div), intervalMs);

      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          m.removedNodes.forEach((node) => {
            if (node === div || (node as HTMLElement).contains?.(div)) {
              this.poller.stop(widget.id);
              observer.disconnect();
            }
          });
        }
      });
      observer.observe(container, { childList: true, subtree: true });
    }

    container.appendChild(div);
  }

  private renderConfigScreen(div: HTMLElement, widget: Widget): void {
    const screen = document.createElement('div');
    screen.className = 'widget-config-screen';

    const icon = document.createElement('div');
    icon.className = 'widget-config-icon';
    icon.innerHTML = '<i class="fas fa-chart-bar"></i>';

    const label = document.createElement('div');
    label.className = 'uptime-config-description';
    label.textContent = 'Monitor Target Uptime';

    const targetInput = document.createElement('input');
    targetInput.type = 'text';
    targetInput.placeholder = 'e.g., google.com or 192.168.1.1';
    targetInput.className = 'uptime-config-target-input';

    const button = document.createElement('button');
    button.textContent = 'Start Monitoring';
    button.className = 'btn btn-small btn-primary';
    button.disabled = true;

    const updateBtn = () => { button.disabled = targetInput.value.trim().length === 0; };
    const start = () => {
      const host = targetInput.value.trim();
      if (host) dispatchWidgetUpdate(widget.id, { targets: [{ host }], interval: 30, timeout: 5000 });
    };

    button.addEventListener('click', start);
    targetInput.addEventListener('input', updateBtn);
    targetInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !button.disabled) start(); });
    stopWidgetDragPropagation(targetInput);
    stopWidgetDragPropagation(button);

    screen.appendChild(icon);
    screen.appendChild(label);
    screen.appendChild(targetInput);
    screen.appendChild(button);
    div.appendChild(screen);
  }

  private renderUptimeDisplay(container: HTMLElement, widget: Widget): void {
    container.innerHTML = '';
    const targets = this.getTargets(widget);
    const content = widget.content as { timeout?: number };
    const timeout = content.timeout || 5000;
    // Remove history for any targets that are no longer in the widget config
    const activeHosts = new Set(targets.map(t => t.host));
    this.pruneStaleHistory(widget.id, activeHosts);
    for (const target of targets) {
      container.appendChild(this.buildTargetCard(widget, target, timeout));
    }
  }

  private buildTargetCard(widget: Widget, target: UptimeTarget, timeout: number): HTMLElement {
    const history = this.getTargetHistory(widget.id, target.host);
    const lastPing = history.length > 0 ? history[history.length - 1] : null;
    const successCount = history.filter(p => p.success).length;
    const rtts = history.filter(p => p.responseTime !== null).map(p => p.responseTime!);
    const uptimePct = history.length > 0 ? (successCount / history.length) * 100 : NaN;
    const avgRtt = rtts.length > 0 ? rtts.reduce((a, b) => a + b, 0) / rtts.length : NaN;
    const minRtt = rtts.length > 0 ? Math.min(...rtts) : NaN;

    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.host = target.host;

    // Header: status dot | name | current RTT
    const header = document.createElement('div');
    header.className = 'card-header';

    const dot = document.createElement('div');
    dot.className = 'uptime-status-dot ' + (history.length === 0 ? 'unknown' : lastPing?.success ? 'up' : 'down');

    const nameEl = document.createElement('h5');
    nameEl.className = 'uptime-target-name';
    nameEl.textContent = target.label || target.host;
    nameEl.title = target.label ? `${target.label} (${target.host})` : target.host;

    const rttEl = document.createElement('div');
    rttEl.className = 'uptime-current-rtt';
    if (!lastPing) {
      rttEl.textContent = '—';
    } else if (lastPing.success && lastPing.responseTime !== null) {
      rttEl.textContent = `${lastPing.responseTime.toFixed(1)} ms`;
    } else {
      rttEl.textContent = 'Timeout';
      rttEl.classList.add('timeout');
    }

    header.appendChild(dot);
    header.appendChild(nameEl);
    header.appendChild(rttEl);

    // Bar chart
    const chartRow = document.createElement('div');
    chartRow.className = 'card-body uptime-chart-row';
    this.renderBars(chartRow, history, timeout, DISPLAY_BARS);

    // Stats row
    const statsRow = document.createElement('div');
    statsRow.className = 'uptime-stats-row';

    const statDefs: { label: string; value: string; colorClass?: string }[] = [
      {
        label: 'Uptime',
        value: isNaN(uptimePct) ? '—' : `${uptimePct.toFixed(1)}%`,
        colorClass: isNaN(uptimePct) ? '' : uptimePct >= 99 ? 'good' : uptimePct >= 90 ? 'warn' : 'bad'
      },
      { label: 'Avg RTT', value: isNaN(avgRtt) ? '—' : `${avgRtt.toFixed(0)}ms` },
      { label: 'Min RTT', value: isNaN(minRtt) ? '—' : `${minRtt.toFixed(0)}ms` },
    ];

    for (const s of statDefs) {
      const el = document.createElement('div');
      el.className = 'uptime-stat';

      const valEl = document.createElement('h6');
      valEl.className = 'uptime-stat-value' + (s.colorClass ? ' ' + s.colorClass : '');
      valEl.textContent = s.value;

      const lblEl = document.createElement('subtitle');
      lblEl.textContent = s.label;

      el.appendChild(lblEl);
      el.appendChild(valEl);
      statsRow.appendChild(el);
    }




    // Action buttons
    const actionsRow = document.createElement('div');
    actionsRow.className = 'uptime-card-actions';

    const histBtn = document.createElement('button');
    histBtn.className = 'uptime-action-btn';
    histBtn.innerHTML = '<i class="fas fa-history"></i>';
    histBtn.title = 'View ping history';
    histBtn.addEventListener('click', () =>
      this.showHistoryPopup(target, this.getTargetHistory(widget.id, target.host), timeout)
    );
    stopWidgetDragPropagation(histBtn);

    const traceBtn = document.createElement('button');
    traceBtn.className = 'uptime-action-btn';
    traceBtn.innerHTML = '<i class="fas fa-route"></i>';
    traceBtn.title = 'Run traceroute to this host';
    traceBtn.addEventListener('click', () => this.showTraceroutePopup(target));
    stopWidgetDragPropagation(traceBtn);

    const histBtn2 = histBtn.cloneNode(true) as HTMLElement;

    histBtn2.addEventListener('click', () =>
      this.showHistoryPopup(target, this.getTargetHistory(widget.id, target.host), timeout)
    );
    const bel = document.createElement('div');
    bel.className = 'uptime-stat';
    stopWidgetDragPropagation(bel);
    bel.appendChild(histBtn2);

    const traceBtn2 = traceBtn.cloneNode(true) as HTMLElement;
    traceBtn2.addEventListener('click', () => this.showTraceroutePopup(target));
    
    statsRow.appendChild(bel);
    bel.appendChild(traceBtn2);


    statsRow.appendChild(bel);




    //actionsRow.appendChild(histBtn);
  //  actionsRow.appendChild(traceBtn);

    card.appendChild(header); 
  // card.appendChild(actionsRow);
    card.appendChild(chartRow);
    card.appendChild(statsRow);

    return card;
  }

  // Shared bar-chart renderer used by cards and history popup
  private renderBars(container: HTMLElement, history: PingResult[], timeout: number, numBars: number): void {
    container.innerHTML = '';
    const display = history.slice(-numBars);
    const placeholders = numBars - display.length;

    for (let i = 0; i < placeholders; i++) {
      const wrap = document.createElement('div');
      wrap.className = 'uptime-bar-wrap';
      const bar = document.createElement('div');
      bar.className = 'uptime-bar-placeholder';
      wrap.appendChild(bar);
      container.appendChild(wrap);
    }

    for (const result of display) {
      const wrap = document.createElement('div');
      wrap.className = 'uptime-bar-wrap';

      const bar = document.createElement('div');
      bar.className = 'uptime-bar';

      if (result.success && result.responseTime !== null) {
        const h = Math.min(Math.max((result.responseTime / timeout) * 100, 8), 100);
        bar.style.height = `100%`;
        const rt = result.responseTime;
        if (rt < 50) bar.classList.add('uptime-bar-excellent');
        else if (rt < 150) bar.classList.add('uptime-bar-good');
        else if (rt < 300) bar.classList.add('uptime-bar-ok');
        else if (rt < 1000) bar.classList.add('uptime-bar-slow');
        else bar.classList.add('uptime-bar-very-slow');
        bar.title = `${new Date(result.timestamp).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} — ${result.responseTime.toFixed(1)} ms`;
      } else {
        bar.style.height = '100%';
        bar.classList.add('uptime-bar-failed');
        bar.title = 'Ping failed or timed out';
      }

      const tooltip = document.createElement('div');
      tooltip.className = 'uptime-bar-tooltip';
      const time = new Date(result.timestamp).toLocaleTimeString('en', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      tooltip.innerHTML = result.success && result.responseTime !== null
        ? `${time}<br>${result.responseTime.toFixed(1)} ms`
        : `${time}<br>Timeout`;

      wrap.appendChild(bar);
      wrap.appendChild(tooltip);
      container.appendChild(wrap);
    }
  }

  private showHistoryPopup(target: UptimeTarget, history: PingResult[], timeout: number): void {
    const overlay = document.createElement('div');
    overlay.className = 'uptime-popup-overlay';

    const popup = document.createElement('div');
    popup.className = 'uptime-popup';

    const header = document.createElement('div');
    header.className = 'uptime-popup-header';

    const title = document.createElement('div');
    title.className = 'uptime-popup-title';
    title.innerHTML = '<i class="fas fa-history"></i>  Ping History';
    const sub = document.createElement('span');
    sub.className = 'uptime-popup-title-sub';
    sub.textContent = target.label ? `${target.label} — ${target.host}` : target.host;
    title.appendChild(sub);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'uptime-popup-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => overlay.remove();

    header.appendChild(title);
    header.appendChild(closeBtn);

    const successCount = history.filter(p => p.success).length;
    const rtts = history.filter(p => p.responseTime !== null).map(p => p.responseTime!);
    const uptimePct = history.length > 0 ? (successCount / history.length * 100).toFixed(1) + '%' : '—';
    const avgRtt = rtts.length > 0 ? (rtts.reduce((a, b) => a + b, 0) / rtts.length).toFixed(0) + ' ms' : '—';
    const minRtt = rtts.length > 0 ? Math.min(...rtts).toFixed(0) + ' ms' : '—';
    const maxRtt = rtts.length > 0 ? Math.max(...rtts).toFixed(0) + ' ms' : '—';

    const summaryEl = document.createElement('div');
    summaryEl.className = 'uptime-popup-stats';
    for (const [val, lbl] of [[uptimePct, 'Uptime'], [avgRtt, 'Avg RTT'], [minRtt, 'Min RTT'], [maxRtt, 'Max RTT']]) {
      const statEl = document.createElement('div');
      statEl.className = 'uptime-popup-stat';
      statEl.innerHTML = `<div class="uptime-popup-stat-value">${val}</div><div class="uptime-popup-stat-label">${lbl}</div>`;
      summaryEl.appendChild(statEl);
    }

    const chartLabel = document.createElement('div');
    chartLabel.className = 'uptime-section-label';
    chartLabel.textContent = `Last ${MAX_HISTORY} samples`;

    const histChart = document.createElement('div');
    histChart.className = 'uptime-history-chart';
    this.renderBars(histChart, history, timeout, MAX_HISTORY);

    const logLabel = document.createElement('div');
    logLabel.className = 'uptime-section-label';
    logLabel.textContent = 'Ping log (newest first)';

    const logContainer = document.createElement('div');
    logContainer.className = 'uptime-history-log';

    const headerRow = document.createElement('div');
    headerRow.className = 'uptime-history-row uptime-history-row-header';
    headerRow.innerHTML = '<span>Time</span><span>Status</span><span>RTT</span>';
    logContainer.appendChild(headerRow);

    if (history.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No data yet — waiting for first ping…';
      empty.style.cssText = 'color:var(--text-muted);font-size:12px;padding:14px;text-align:center;';
      logContainer.appendChild(empty);
    } else {
      for (const result of [...history].reverse()) {
        const row = document.createElement('div');
        row.className = 'uptime-history-row';
        const time = new Date(result.timestamp).toLocaleTimeString('en', {
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
        const timeEl = document.createElement('span');
        timeEl.textContent = time;
        const statusEl = document.createElement('span');
        statusEl.className = `uptime-history-status ${result.success ? 'success' : 'fail'}`;
        statusEl.textContent = result.success ? 'UP' : 'DOWN';
        const rttEl = document.createElement('span');
        rttEl.textContent = result.success && result.responseTime !== null
          ? `${result.responseTime.toFixed(1)} ms`
          : 'Timeout';
        row.appendChild(timeEl);
        row.appendChild(statusEl);
        row.appendChild(rttEl);
        logContainer.appendChild(row);
      }
    }

    popup.appendChild(header);
    popup.appendChild(summaryEl);
    popup.appendChild(chartLabel);
    popup.appendChild(histChart);
    popup.appendChild(logLabel);
    popup.appendChild(logContainer);

    overlay.appendChild(popup);
    overlay.addEventListener('click', (e) => e.target === overlay && overlay.remove());
    document.body.appendChild(overlay);
  }

  private showTraceroutePopup(target: UptimeTarget): void {
    const overlay = document.createElement('div');
    overlay.className = 'uptime-popup-overlay';

    const popup = document.createElement('div');
    popup.className = 'uptime-popup';

    const header = document.createElement('div');
    header.className = 'uptime-popup-header';

    const title = document.createElement('div');
    title.className = 'uptime-popup-title';
    title.innerHTML = '<i class="fas fa-route"></i>  Traceroute';
    const sub = document.createElement('span');
    sub.className = 'uptime-popup-title-sub';
    sub.textContent = target.label ? `${target.label} — ${target.host}` : target.host;
    title.appendChild(sub);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'uptime-popup-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => overlay.remove();

    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    const loading = document.createElement('div');
    loading.className = 'uptime-popup-loading';
    loading.innerHTML = '<i class="fas fa-spinner fa-spin"></i>  Running traceroute…';
    body.appendChild(loading);

    popup.appendChild(header);
    popup.appendChild(body);
    overlay.appendChild(popup);
    overlay.addEventListener('click', (e) => e.target === overlay && overlay.remove());
    document.body.appendChild(overlay);

    fetch(`${getPingServerUrl()}/traceroute/${encodeURIComponent(target.host)}`, {
      signal: AbortSignal.timeout(65000)
    })
      .then(r => r.json())
      .then(data => {
        body.innerHTML = '';

        if (data.error) {
          const errEl = document.createElement('div');
          errEl.className = 'uptime-popup-error';
          errEl.textContent = `Error: ${data.error}`;
          body.appendChild(errEl);
          return;
        }

        const hops = data.hops as Array<{ hop: number; address: string; rtts: string[] }>;
        if (!hops || hops.length === 0) {
          body.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px;">No hops returned.</div>';
          return;
        }

        const table = document.createElement('table');
        table.className = 'uptime-trace-table';
        table.innerHTML = `
          <thead>
            <tr><th>#</th><th>Address</th><th>RTT 1</th><th>RTT 2</th><th>RTT 3</th></tr>
          </thead>
        `;

        const tbody = document.createElement('tbody');
        for (const hop of hops) {
          const tr = document.createElement('tr');
          const rttCells = [hop.rtts?.[0] ?? '*', hop.rtts?.[1] ?? '*', hop.rtts?.[2] ?? '*']
            .map(r => `<td class="${r === '*' ? 'uptime-trace-timeout' : 'uptime-trace-rtt'}">${r}</td>`)
            .join('');
          tr.innerHTML = `
            <td class="uptime-trace-hop">${hop.hop}</td>
            <td class="uptime-trace-addr">${hop.address === '*' ? '<span class="uptime-trace-timeout">* * *</span>' : hop.address}</td>
            ${rttCells}
          `;
          tbody.appendChild(tr);
        }

        table.appendChild(tbody);
        body.appendChild(table);
      })
      .catch(err => {
        body.innerHTML = '';
        const errEl = document.createElement('div');
        errEl.className = 'uptime-popup-error';
        errEl.textContent = `Failed to reach ping server: ${err instanceof Error ? err.message : String(err)}`;
        body.appendChild(errEl);
      });
  }

  private async performAllPings(widget: Widget, container: HTMLElement): Promise<void> {
    const targets = this.getTargets(widget);
    const content = widget.content as { timeout?: number };
    const timeout = content.timeout || 5000;

    await Promise.all(targets.map(t => this.performSinglePing(widget.id, t.host, timeout)));
    this.renderUptimeDisplay(container, widget);
  }

  private async performSinglePing(widgetId: string, host: string, timeout: number): Promise<void> {
    let success = false;
    let responseTime: number | null = null;

    try {
      const timeoutSeconds = Math.max(1, Math.floor(timeout / 1000));
      const response = await fetch(
        `${getPingServerUrl()}/ping/${encodeURIComponent(host)}?timeout=${timeoutSeconds}`,
        { signal: AbortSignal.timeout(timeout + 2000) }
      );
      if (!response.ok) throw new Error(`Ping server error: ${response.status}`);
      const data = await response.json();
      success = data.success;
      responseTime = data.success ? data.responseTime : null;
    } catch (error) {
      success = false;
      responseTime = null;
      if (error instanceof Error && error.message.includes('Failed to fetch')) {
        console.error('Ping server not reachable at', getPingServerUrl());
      } else {
        console.warn('Ping failed:', host, error);
      }
    }

    this.addToTargetHistory(widgetId, host, { timestamp: Date.now(), responseTime, success });
  }
}

export const widget = {
  type: 'uptime',
  name: 'Uptime Monitor',
  icon: '<i class="fas fa-chart-bar"></i>',
  description: 'Monitor uptime via ping — multiple targets, history & traceroute',
  renderer: new UptimeWidgetRenderer(),
  defaultSize: { w: 500, h: 300 },
  defaultContent: { targets: [], interval: 30, timeout: 5000 },
  allowedFields: ['targets', 'target', 'interval', 'timeout']
};
