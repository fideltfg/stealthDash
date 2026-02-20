import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';
import { stopWidgetDragPropagation, dispatchWidgetUpdate } from '../utils/dom';
import { getPingServerUrl } from '../utils/api';
import { WidgetPoller } from '../utils/polling';

interface PingResult {
  timestamp: number;
  responseTime: number | null; // null = timeout/failure
  success: boolean;
}

export class UptimeWidgetRenderer implements WidgetRenderer {
  private poller = new WidgetPoller();

  destroy(): void {
    this.poller.stopAll();
  }
  private pingHistory: Map<string, PingResult[]> = new Map();

  configure(widget: Widget): void {
    const content = widget.content as { target?: string; interval?: number; timeout?: number };

    const overlay = document.createElement('div');
    overlay.className = 'widget-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'widget-dialog';

    dialog.innerHTML = `
      <h3 class="widget-dialog-title">Configure Uptime Monitor</h3>
      <div class="widget-dialog-field">
        <label class="widget-dialog-label">Target (URL or IP)</label>
        <input type="text" id="uptime-target" class="widget-dialog-input" value="${content.target || ''}" placeholder="example.com or 192.168.1.1" />
      </div>
      <div class="widget-dialog-field">
        <label class="widget-dialog-label">Ping Interval (seconds)</label>
        <input type="number" id="uptime-interval" class="widget-dialog-input" value="${content.interval || 30}" min="5" max="300" />
      </div>
      <div class="widget-dialog-field large-margin">
        <label class="widget-dialog-label">Timeout (milliseconds)</label>
        <input type="number" id="uptime-timeout" class="widget-dialog-input" value="${content.timeout || 5000}" min="1000" max="30000" step="1000" />
      </div>
      <div class="widget-dialog-buttons">
        <div id="cancel-btn" class="btn btn-small btn-secondary">
          Cancel
        </div>
        <div id="save-btn" class="btn btn-small btn-primary">
          Save
        </div>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const targetInput = dialog.querySelector('#uptime-target') as HTMLInputElement;
    const intervalInput = dialog.querySelector('#uptime-interval') as HTMLInputElement;
    const timeoutInput = dialog.querySelector('#uptime-timeout') as HTMLInputElement;
    const saveBtn = dialog.querySelector('#save-btn') as HTMLButtonElement;
    const cancelBtn = dialog.querySelector('#cancel-btn') as HTMLButtonElement;

    const close = () => overlay.remove();

    cancelBtn.onclick = close;
    overlay.onclick = (e) => e.target === overlay && close();

    saveBtn.onclick = () => {
      const target = targetInput.value.trim();
      if (target) {
        dispatchWidgetUpdate(widget.id, {
          target,
          interval: parseInt(intervalInput.value) || 30,
          timeout: parseInt(timeoutInput.value) || 5000
        });
        close();
      }
    };
  }

  render(container: HTMLElement, widget: Widget): void {
    const content = widget.content as { target?: string; interval?: number; timeout?: number };
    const div = document.createElement('div');
    div.className = 'uptime-widget';

    if (!content.target) {
      this.renderConfigScreen(div, widget);
    } else {
      this.initializePingHistory(widget.id);
      this.renderUptimeDisplay(div, widget);

      // Start pinging
      const interval = (content.interval || 30) * 1000; // Default 30 seconds
      this.poller.start(widget.id, () => this.performPing(widget, div), interval);

      // Clean up interval when widget is removed from DOM
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.removedNodes.forEach((node) => {
            if (node === div || (node as HTMLElement).contains?.(div)) {
              this.poller.stop(widget.id);
              observer.disconnect();
            }
          });
        });
      });

      if (div.parentNode) {
        observer.observe(div.parentNode, { childList: true, subtree: true });
      }
    }

    container.appendChild(div);
  }

  private initializePingHistory(widgetId: string): void {
    if (!this.pingHistory.has(widgetId)) {
      this.pingHistory.set(widgetId, []);
    }
  }

  private renderConfigScreen(div: HTMLElement, widget: Widget): void {
    const inputContainer = document.createElement('div');
    inputContainer.className = 'widget-config-screen';

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

    const intervalLabel = document.createElement('div');
    intervalLabel.textContent = 'Ping interval (seconds)';
    intervalLabel.className = 'uptime-config-interval-label';

    const intervalInput = document.createElement('input');
    intervalInput.type = 'number';
    intervalInput.value = '30';
    intervalInput.min = '5';
    intervalInput.max = '300';
    intervalInput.className = 'uptime-config-interval-input';

    const timeoutLabel = document.createElement('div');
    timeoutLabel.textContent = 'Timeout (milliseconds)';
    timeoutLabel.className = 'uptime-config-timeout-label';

    const timeoutInput = document.createElement('input');
    timeoutInput.type = 'number';
    timeoutInput.value = '5000';
    timeoutInput.min = '1000';
    timeoutInput.max = '30000';
    timeoutInput.className = 'uptime-config-timeout-input';

    const button = document.createElement('button');
    button.textContent = 'Start Monitoring';
    button.className = 'uptime-config-button';
    button.disabled = true;

    const updateButtonState = () => {
      const target = targetInput.value.trim();
      button.disabled = target.length === 0;
    };

    const startMonitoring = () => {
      const target = targetInput.value.trim();
      const interval = parseInt(intervalInput.value) || 30;
      const timeout = parseInt(timeoutInput.value) || 5000;

      if (target) {
        dispatchWidgetUpdate(widget.id, { target, interval, timeout });
      }
    };

    button.addEventListener('click', startMonitoring);
    targetInput.addEventListener('input', updateButtonState);
    targetInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !button.disabled) {
        startMonitoring();
      }
    });

    stopWidgetDragPropagation(targetInput);
    stopWidgetDragPropagation(intervalInput);
    stopWidgetDragPropagation(timeoutInput);
    stopWidgetDragPropagation(button);

    inputContainer.appendChild(icon);
    inputContainer.appendChild(label);
    inputContainer.appendChild(targetInput);
    inputContainer.appendChild(intervalLabel);
    inputContainer.appendChild(intervalInput);
    inputContainer.appendChild(timeoutLabel);
    inputContainer.appendChild(timeoutInput);
    inputContainer.appendChild(button);
    div.appendChild(inputContainer);
  }

  private renderUptimeDisplay(container: HTMLElement, widget: Widget): void {
    const content = widget.content as { target: string; interval?: number; timeout?: number };

    container.innerHTML = '';

    // Main container with horizontal layout
    const mainContainer = document.createElement('div');
    mainContainer.className = 'list';


    const card = document.createElement('div');
    card.className = 'card';

    // Top row: target and bars side by side
    const cardHeader = document.createElement('div');
    cardHeader.className = 'card-header';

    // Left side: target
    const targetLabel = document.createElement('div');
    targetLabel.className = 'uptime-target-label';
    targetLabel.textContent = content.target;

    // Right side: chart bars
    const chartContainer = document.createElement('div');
    chartContainer.className = 'uptime-chart-container';

    const history = this.pingHistory.get(widget.id) || [];
    const timeout = content.timeout || 5000;
    this.renderChart(chartContainer, history, timeout);

    cardHeader.appendChild(targetLabel);


    // Stats row
    const statsContainer = document.createElement('div');
    statsContainer.appendChild(chartContainer);
    statsContainer.className = 'card-body';

    const successCount = history.filter(p => p.success).length;
    const uptime = history.length > 0 ? ((successCount / history.length) * 100).toFixed(1) : '0.0';

    const avgResponseTime = history.length > 0
      ? history.filter(p => p.responseTime !== null)
        .reduce((sum, p) => sum + (p.responseTime || 0), 0) / successCount || 0
      : 0;

    const uptimeDiv = document.createElement('div');
    uptimeDiv.innerHTML = `<strong>Uptime:</strong> ${uptime}%`;

    const avgDiv = document.createElement('div');
    avgDiv.innerHTML = `<strong>Avg:</strong> ${avgResponseTime.toFixed(0)}ms`;

    const countDiv = document.createElement('div');
    countDiv.innerHTML = `<strong>Samples:</strong> ${history.length}/20`;

    const cardFooter = document.createElement('div');
    cardFooter.className = 'card-footer button-group';
    cardFooter.style.marginTop = '0';

    cardFooter.appendChild(uptimeDiv);
    cardFooter.appendChild(avgDiv);
    cardFooter.appendChild(countDiv);

    card.appendChild(cardHeader);
    card.appendChild(statsContainer);
    card.appendChild(cardFooter);
    mainContainer.appendChild(card);
    container.appendChild(mainContainer);
  }

  private renderChart(container: HTMLElement, history: PingResult[], timeout: number): void {
    container.innerHTML = '';

    const totalBars = 20; // Total number of bars to display
    const displayHistory = history.slice(-totalBars);
    // Use timeout as the max height (100%)
    const maxResponseTime = timeout;

    // Calculate how many placeholder bars we need
    const placeholderCount = totalBars - displayHistory.length;

    // Add placeholder bars on the left (grayed out)
    for (let i = 0; i < placeholderCount; i++) {
      const barContainer = document.createElement('div');
      barContainer.className = 'uptime-bar-container';

      const bar = document.createElement('div');
      bar.className = 'uptime-bar-placeholder';

      barContainer.appendChild(bar);
      container.appendChild(barContainer);
    }

    // Add actual ping results (populate from left to right, newest on right)
    displayHistory.forEach((result) => {
      const barContainer = document.createElement('div');
      barContainer.className = 'uptime-bar-container';

      const bar = document.createElement('div');
      bar.className = 'uptime-bar';

      if (result.success && result.responseTime !== null) {
        // Calculate height as percentage of timeout, minimum 10% for visibility, capped at 100%
        const heightPercent = Math.min(Math.max((result.responseTime / maxResponseTime) * 100, 10), 100);
        bar.style.height = `${heightPercent}%`;

        // Color based on response time (like reference image)
        if (result.responseTime < 50) {
          bar.classList.add('uptime-bar-excellent');
        } else if (result.responseTime < 150) {
          bar.classList.add('uptime-bar-good');
        } else if (result.responseTime < 300) {
          bar.classList.add('uptime-bar-ok');
        } else if (result.responseTime < 1000) {
          bar.classList.add('uptime-bar-slow');
        } else {
          bar.classList.add('uptime-bar-very-slow');
        }
      } else {
        // Failed ping - show at 100% since it timed out
        bar.style.height = '100%';
        bar.classList.add('uptime-bar-failed');
      }

      // Tooltip
      const tooltip = document.createElement('div');
      tooltip.className = 'uptime-tooltip';

      const time = new Date(result.timestamp).toLocaleTimeString('en', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      if (result.success && result.responseTime !== null) {
        tooltip.textContent = `${time}\n${result.responseTime}ms`;
      } else {
        tooltip.textContent = `${time}\nTimeout`;
      }

      barContainer.appendChild(bar);
      barContainer.appendChild(tooltip);
      container.appendChild(barContainer);
    });
  }

  private async performPing(widget: Widget, container: HTMLElement): Promise<void> {
    const content = widget.content as { target: string; timeout?: number };
    const timeout = content.timeout || 5000;

    let success = false;
    let responseTime: number | null = null;

    try {
      // Use the ping server backend
      const timeoutSeconds = Math.floor(timeout / 1000);

      const response = await fetch(
        `${getPingServerUrl()}/ping/${encodeURIComponent(content.target)}?timeout=${timeoutSeconds}`,
        {
          signal: AbortSignal.timeout(timeout + 1000) // Add 1 second buffer
        }
      );

      if (!response.ok) {
        throw new Error(`Ping server error: ${response.status}`);
      }

      const data = await response.json();

      success = data.success;
      responseTime = data.success ? data.responseTime : null;

    } catch (error) {
      // Ping server not available or ping failed
      success = false;
      responseTime = null;

      // Log for debugging
      if (error instanceof Error && error.message.includes('Failed to fetch')) {
        console.error('Ping server not reachable at', getPingServerUrl());
        console.error('Make sure ping server is running: docker compose up -d ping-server');
      } else {
        console.warn('Ping failed:', content.target, error);
      }
    }

    // Add to history
    const history = this.pingHistory.get(widget.id) || [];
    history.push({
      timestamp: Date.now(),
      responseTime,
      success
    });

    // Keep only last 20
    if (history.length > 20) {
      history.shift();
    }

    this.pingHistory.set(widget.id, history);

    // Re-render
    this.renderUptimeDisplay(container, widget);
  }
}

export const widget = {
  type: 'uptime',
  name: 'Uptime Monitor',
  icon: '<i class="fas fa-chart-bar"></i>',
  description: 'Monitor uptime via ping',
  renderer: new UptimeWidgetRenderer(),
  defaultSize: { w: 500, h: 300 },
  defaultContent: { target: '', interval: 60, timeout: 5000 }
};
