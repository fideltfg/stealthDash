import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';

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
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: var(--surface);
      border-radius: 8px;
      padding: 24px;
      max-width: 500px;
      width: 90%;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `;

    dialog.innerHTML = `
      <h3 style="margin: 0 0 20px 0; color: var(--text);">Configure Uptime Monitor</h3>
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; color: var(--text); font-size: 14px;">Target (URL or IP)</label>
        <input type="text" id="uptime-target" value="${content.target || ''}" placeholder="example.com or 192.168.1.1"
          style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text);" />
      </div>
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; color: var(--text); font-size: 14px;">Ping Interval (seconds)</label>
        <input type="number" id="uptime-interval" value="${content.interval || 30}" min="5" max="300"
          style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text);" />
      </div>
      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 8px; color: var(--text); font-size: 14px;">Timeout (milliseconds)</label>
        <input type="number" id="uptime-timeout" value="${content.timeout || 5000}" min="1000" max="30000" step="1000"
          style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text);" />
      </div>
      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        <button id="cancel-btn" style="padding: 8px 16px; border: 1px solid var(--border); border-radius: 4px; background: transparent; color: var(--text); cursor: pointer;">
          Cancel
        </button>
        <button id="save-btn" style="padding: 8px 16px; border: none; border-radius: 4px; background: var(--accent); color: white; cursor: pointer;">
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
    div.style.height = '100%';
    div.style.display = 'flex';
    div.style.flexDirection = 'column';
    div.style.padding = '16px';
    div.style.overflow = 'hidden';
    
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
    inputContainer.style.display = 'flex';
    inputContainer.style.flexDirection = 'column';
    inputContainer.style.alignItems = 'center';
    inputContainer.style.justifyContent = 'center';
    inputContainer.style.height = '100%';
    inputContainer.style.gap = '12px';
    
    const icon = document.createElement('div');
    icon.textContent = '📊';
    icon.style.fontSize = '48px';
    
    const label = document.createElement('div');
    label.textContent = 'Monitor Target Uptime';
    label.style.color = 'var(--muted)';
    label.style.marginBottom = '8px';
    label.style.textAlign = 'center';
    
    const targetInput = document.createElement('input');
    targetInput.type = 'text';
    targetInput.placeholder = 'e.g., google.com or 192.168.1.1';
    targetInput.style.width = '100%';
    targetInput.style.padding = '8px 12px';
    targetInput.style.border = '2px solid var(--border)';
    targetInput.style.borderRadius = '6px';
    targetInput.style.fontFamily = 'inherit';
    targetInput.style.fontSize = '14px';
    targetInput.style.background = 'var(--bg)';
    targetInput.style.color = 'var(--text)';
    
    const intervalLabel = document.createElement('div');
    intervalLabel.textContent = 'Ping interval (seconds)';
    intervalLabel.style.fontSize = '12px';
    intervalLabel.style.color = 'var(--muted)';
    intervalLabel.style.marginTop = '8px';
    
    const intervalInput = document.createElement('input');
    intervalInput.type = 'number';
    intervalInput.value = '30';
    intervalInput.min = '5';
    intervalInput.max = '300';
    intervalInput.style.width = '100px';
    intervalInput.style.padding = '8px 12px';
    intervalInput.style.border = '2px solid var(--border)';
    intervalInput.style.borderRadius = '6px';
    intervalInput.style.fontFamily = 'inherit';
    intervalInput.style.fontSize = '14px';
    intervalInput.style.background = 'var(--bg)';
    intervalInput.style.color = 'var(--text)';
    
    const timeoutLabel = document.createElement('div');
    timeoutLabel.textContent = 'Timeout (milliseconds)';
    timeoutLabel.style.fontSize = '12px';
    timeoutLabel.style.color = 'var(--muted)';
    timeoutLabel.style.marginTop = '8px';
    
    const timeoutInput = document.createElement('input');
    timeoutInput.type = 'number';
    timeoutInput.value = '5000';
    timeoutInput.min = '1000';
    timeoutInput.max = '30000';
    timeoutInput.style.width = '100px';
    timeoutInput.style.padding = '8px 12px';
    timeoutInput.style.border = '2px solid var(--border)';
    timeoutInput.style.borderRadius = '6px';
    timeoutInput.style.fontFamily = 'inherit';
    timeoutInput.style.fontSize = '14px';
    timeoutInput.style.background = 'var(--bg)';
    timeoutInput.style.color = 'var(--text)';
    
    const button = document.createElement('button');
    button.textContent = 'Start Monitoring';
    button.style.padding = '8px 20px';
    button.style.background = 'var(--accent)';
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.borderRadius = '6px';
    button.style.cursor = 'pointer';
    button.style.fontSize = '14px';
    button.style.fontWeight = '500';
    button.style.marginTop = '8px';
    button.disabled = true;
    button.style.opacity = '0.5';
    button.style.cursor = 'not-allowed';
    
    const updateButtonState = () => {
      const target = targetInput.value.trim();
      if (target.length > 0) {
        button.disabled = false;
        button.style.opacity = '1';
        button.style.cursor = 'pointer';
      } else {
        button.disabled = true;
        button.style.opacity = '0.5';
        button.style.cursor = 'not-allowed';
      }
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
    mainContainer.style.display = 'flex';
    mainContainer.style.flexDirection = 'column';
    mainContainer.style.gap = '16px';
    mainContainer.style.height = '100%';
    
    // Top row: target and bars side by side
    const topRow = document.createElement('div');
    topRow.style.display = 'flex';
    topRow.style.alignItems = 'center';
    topRow.style.gap = '16px';
    topRow.style.justifyContent = 'space-between';
    
    // Left side: target
    const targetLabel = document.createElement('div');
    targetLabel.style.fontSize = '16px';
    targetLabel.style.fontWeight = '600';
    targetLabel.style.flexShrink = '0';
    targetLabel.textContent = content.target;
    
    // Right side: chart bars
    const chartContainer = document.createElement('div');
    chartContainer.style.flex = '1';
    chartContainer.style.display = 'flex';
    chartContainer.style.alignItems = 'flex-end';
    chartContainer.style.gap = '3px';
    chartContainer.style.height = '40px';
    chartContainer.style.minHeight = '40px';
    chartContainer.style.maxHeight = '40px';
    
    const history = this.pingHistory.get(widget.id) || [];
    this.renderChart(chartContainer, history);
    
    topRow.appendChild(targetLabel);
    topRow.appendChild(chartContainer);
    
    // Stats row
    const statsContainer = document.createElement('div');
    statsContainer.style.display = 'flex';
    statsContainer.style.gap = '16px';
    statsContainer.style.fontSize = '12px';
    statsContainer.style.color = 'var(--muted)';
    statsContainer.style.paddingTop = '8px';
    statsContainer.style.borderTop = '1px solid var(--border)';
    
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
      barContainer.style.flex = '1';
      barContainer.style.display = 'flex';
      barContainer.style.flexDirection = 'column';
      barContainer.style.alignItems = 'center';
      barContainer.style.justifyContent = 'flex-end';
      barContainer.style.minWidth = '8px';
      barContainer.style.height = '100%';
      barContainer.style.position = 'relative';
      
      const bar = document.createElement('div');
      bar.style.width = '100%';
      bar.style.height = '4px';
      bar.style.borderRadius = '2px 2px 0 0';
      bar.style.background = 'rgba(255, 255, 255, 0.1)'; // Grayed placeholder
      bar.style.opacity = '0.3';
      
      barContainer.appendChild(bar);
      container.appendChild(barContainer);
    }
    
    // Add actual ping results (populate from left to right, newest on right)
    displayHistory.forEach((result) => {
      const barContainer = document.createElement('div');
      barContainer.style.flex = '1';
      barContainer.style.display = 'flex';
      barContainer.style.flexDirection = 'column';
      barContainer.style.alignItems = 'center';
      barContainer.style.justifyContent = 'flex-end';
      barContainer.style.minWidth = '8px';
      barContainer.style.height = '100%';
      barContainer.style.position = 'relative';
      barContainer.style.cursor = 'pointer';
      
      const bar = document.createElement('div');
      bar.style.width = '100%';
      bar.style.borderRadius = '2px 2px 0 0';
      bar.style.transition = 'all 150ms';
      
      if (result.success && result.responseTime !== null) {
        // Calculate height as percentage of max, minimum 10% for visibility
        const heightPercent = Math.max((result.responseTime / maxResponseTime) * 100, 10);
        bar.style.height = `${heightPercent}%`;
        
        // Color based on response time (like reference image)
        if (result.responseTime < 50) {
          bar.style.background = '#22c55e'; // green - excellent
        } else if (result.responseTime < 150) {
          bar.style.background = '#84cc16'; // light green - good
        } else if (result.responseTime < 300) {
          bar.style.background = '#eab308'; // yellow - ok
        } else if (result.responseTime < 1000) {
          bar.style.background = '#f97316'; // orange - slow
        } else {
          bar.style.background = '#ef4444'; // red - very slow
        }
      } else {
        // Failed ping - small red bar at bottom
        bar.style.height = '8px';
        bar.style.background = '#ef4444'; // red
        bar.style.opacity = '1';
      }
      
      // Tooltip
      const tooltip = document.createElement('div');
      tooltip.style.position = 'absolute';
      tooltip.style.bottom = '110%';
      tooltip.style.left = '50%';
      tooltip.style.transform = 'translateX(-50%)';
      tooltip.style.background = 'var(--surface)';
      tooltip.style.border = '1px solid var(--border)';
      tooltip.style.borderRadius = '4px';
      tooltip.style.padding = '6px 8px';
      tooltip.style.fontSize = '11px';
      tooltip.style.whiteSpace = 'nowrap';
      tooltip.style.pointerEvents = 'none';
      tooltip.style.opacity = '0';
      tooltip.style.transition = 'opacity 150ms';
      tooltip.style.zIndex = '1000';
      tooltip.style.boxShadow = '0 2px 8px var(--shadow)';
      
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
      
      barContainer.addEventListener('mouseenter', () => {
        tooltip.style.opacity = '1';
        bar.style.opacity = '0.8';
      });
      
      barContainer.addEventListener('mouseleave', () => {
        tooltip.style.opacity = '0';
        bar.style.opacity = result.success ? '1' : '0.5';
      });
      
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
  icon: '📊',
  description: 'Monitor uptime via ping',
  renderer: new UptimeWidgetRenderer(),
  defaultSize: { w: 500, h: 300 },
  defaultContent: { target: '', interval: 60, timeout: 5 }
};
