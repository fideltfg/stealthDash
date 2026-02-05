import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';
import '../css/uptime.css';

interface PingResult {
  timestamp: number;
  responseTime: number | null; // null = timeout/failure
  success: boolean;
}

export class UptimeWidgetRenderer implements WidgetRenderer {
  private pingIntervals: Map<string, number> = new Map();
  private pingHistory: Map<string, PingResult[]> = new Map();
  private readonly PING_SERVER_URL = window.location.protocol + '//' + window.location.hostname + ':3001';

  configure(widget: Widget): void {
    const content = widget.content as { target?: string; interval?: number; timeout?: number };
    
    const overlay = document.createElement('div');
    overlay.className = 'uptime-config-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'uptime-config-dialog';

    dialog.innerHTML = `
      <h3 class="uptime-config-title">Configure Uptime Monitor</h3>
      <div class="uptime-config-field">
        <label class="uptime-config-label">Target (URL or IP)</label>
        <input type="text" id="uptime-target" class="uptime-config-input" value="${content.target || ''}" placeholder="example.com or 192.168.1.1" />
      </div>
      <div class="uptime-config-field">
        <label class="uptime-config-label">Ping Interval (seconds)</label>
        <input type="number" id="uptime-interval" class="uptime-config-input" value="${content.interval || 30}" min="5" max="300" />
      </div>
      <div class="uptime-config-field-last">
        <label class="uptime-config-label">Timeout (milliseconds)</label>
        <input type="number" id="uptime-timeout" class="uptime-config-input" value="${content.timeout || 5000}" min="1000" max="30000" step="1000" />
      </div>
      <div class="uptime-config-buttons">
        <button id="cancel-btn" class="uptime-config-button-cancel">
          Cancel
        </button>
        <button id="save-btn" class="uptime-config-button-save">
          Save
        </button>
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
        const event = new CustomEvent('widget-update', {
          detail: {
            id: widget.id,
            content: {
              target,
              interval: parseInt(intervalInput.value) || 30,
              timeout: parseInt(timeoutInput.value) || 5000
            }
          }
        });
        document.dispatchEvent(event);
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
      this.clearPingInterval(widget.id);
      
      // Do initial ping
      this.performPing(widget, div);
      
      // Set up interval
      const intervalId = window.setInterval(() => {
        this.performPing(widget, div);
      }, interval);
      this.pingIntervals.set(widget.id, intervalId);
    }
    
    container.appendChild(div);
  }

  private clearPingInterval(widgetId: string): void {
    const intervalId = this.pingIntervals.get(widgetId);
    if (intervalId) {
      clearInterval(intervalId);
      this.pingIntervals.delete(widgetId);
    }
  }

  private initializePingHistory(widgetId: string): void {
    if (!this.pingHistory.has(widgetId)) {
      this.pingHistory.set(widgetId, []);
    }
  }

  private renderConfigScreen(div: HTMLElement, widget: Widget): void {
    const inputContainer = document.createElement('div');
    inputContainer.className = 'uptime-config-screen';
    
    const icon = document.createElement('div');
    icon.className = 'uptime-config-icon';
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
        const event = new CustomEvent('widget-update', {
          detail: { 
            id: widget.id, 
            content: { target, interval, timeout } 
          }
        });
        document.dispatchEvent(event);
      }
    };
    
    button.addEventListener('click', startMonitoring);
    targetInput.addEventListener('input', updateButtonState);
    targetInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !button.disabled) {
        startMonitoring();
      }
    });
    
    targetInput.addEventListener('pointerdown', (e) => e.stopPropagation());
    intervalInput.addEventListener('pointerdown', (e) => e.stopPropagation());
    timeoutInput.addEventListener('pointerdown', (e) => e.stopPropagation());
    button.addEventListener('pointerdown', (e) => e.stopPropagation());
    
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
    mainContainer.className = 'uptime-display-container';
    
    // Top row: target and bars side by side
    const topRow = document.createElement('div');
    topRow.className = 'uptime-top-row';
    
    // Left side: target
    const targetLabel = document.createElement('div');
    targetLabel.className = 'uptime-target-label';
    targetLabel.textContent = content.target;
    
    // Right side: chart bars
    const chartContainer = document.createElement('div');
    chartContainer.className = 'uptime-chart-container';
    
    const history = this.pingHistory.get(widget.id) || [];
    this.renderChart(chartContainer, history);
    
    topRow.appendChild(targetLabel);
    topRow.appendChild(chartContainer);
    
    // Stats row
    const statsContainer = document.createElement('div');
    statsContainer.className = 'uptime-stats-container';
    
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
    
    statsContainer.appendChild(uptimeDiv);
    statsContainer.appendChild(avgDiv);
    statsContainer.appendChild(countDiv);
    
    mainContainer.appendChild(topRow);
    mainContainer.appendChild(statsContainer);
    
    container.appendChild(mainContainer);
  }

  private renderChart(container: HTMLElement, history: PingResult[]): void {
    container.innerHTML = '';
    
    const totalBars = 20; // Total number of bars to display
    const displayHistory = history.slice(-totalBars);
    const maxResponseTime = Math.max(...displayHistory.filter(p => p.success && p.responseTime !== null).map(p => p.responseTime || 0), 100);
    
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
        // Calculate height as percentage of max, minimum 10% for visibility
        const heightPercent = Math.max((result.responseTime / maxResponseTime) * 100, 10);
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
        // Failed ping - small red bar at bottom
        bar.style.height = '8px';
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
        `${this.PING_SERVER_URL}/ping/${encodeURIComponent(content.target)}?timeout=${timeoutSeconds}`,
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
        console.error('Ping server not reachable at', this.PING_SERVER_URL);
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
  defaultContent: { target: '', interval: 60, timeout: 5 }
};
