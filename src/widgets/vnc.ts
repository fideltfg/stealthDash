import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';
import { credentialsService } from '../services/credentials';
import { getPingServerUrl } from '../utils/api';
import { dispatchWidgetUpdate, stopAllDragPropagation, stopWidgetDragPropagation, injectWidgetStyles } from '../utils/dom';
import { authService } from '../services/auth';
// @ts-ignore — noVNC doesn't ship type declarations
import RFB from '@novnc/novnc/core/rfb.js';

interface VncContent {
  credentialId?: number;   // Saved credential ID (contains host, port, password)
  viewOnly: boolean;       // View-only mode (no keyboard/mouse input)
  scaleMode: 'remote' | 'local' | 'none';  // Scaling mode
  clipToWindow: boolean;   // Clip remote resolution to widget
  showDotCursor: boolean;  // Show cursor as dot
  qualityLevel: number;    // JPEG quality (0-9)
  compressionLevel: number; // Compression level (0-9)
  autoConnect: boolean;    // Auto-connect when widget loads
  reconnectDelay: number;  // Seconds before auto-reconnect (0 = disabled)
}

const DEFAULT_CONTENT: VncContent = {
  viewOnly: false,
  scaleMode: 'local',
  clipToWindow: true,
  showDotCursor: false,
  qualityLevel: 6,
  compressionLevel: 2,
  autoConnect: true,
  reconnectDelay: 5,
};

const VNC_STYLES = `
.vnc-widget { display: flex; flex-direction: column; width: 100%; height: 100%; overflow: hidden; }
.vnc-status-bar { display: flex; align-items: center; gap: 8px; padding: 4px 8px; background: var(--widget-bg, rgba(0, 0, 0, 0.6)); border-bottom: 1px solid var(--border); flex-shrink: 0; font-size: 12px; }
.vnc-status-indicator { display: flex; align-items: center; gap: 4px; font-weight: 500; white-space: nowrap; }
.vnc-status-indicator::before { content: ''; display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.vnc-status-indicator.disconnected::before { background: #888; }
.vnc-status-indicator.connecting::before { background: #f0ad4e; animation: vnc-pulse 1s infinite; }
.vnc-status-indicator.connected::before { background: #4caf50; }
.vnc-status-indicator.error::before { background: #f44336; }
@keyframes vnc-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
.vnc-status-info { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.7; font-size: 11px; }
.vnc-connect-btn { padding: 2px 10px; border: 1px solid var(--border); border-radius: 4px; background: transparent; cursor: pointer; font-size: 11px; transition: background 0.2s; }
.vnc-connect-btn:hover { background: var(--hover); }
.vnc-display { flex: 1; overflow: hidden; position: relative; background: #000; }
.vnc-display canvas { width: 100% !important; height: 100% !important; }
.vnc-bell { box-shadow: inset 0 0 20px rgba(255, 255, 0, 0.3); transition: box-shadow 0.2s; }
.vnc-config-inputs { display: flex; gap: 8px; max-width: 360px; }
.vnc-config-port { width: 80px; }
.vnc-config-button:disabled { opacity: 0.4; cursor: not-allowed; }
.vnc-password-overlay { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.8); display: flex; align-items: center; justify-content: center; z-index: 10; }
.vnc-password-box { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 20px; min-width: 280px; display: flex; flex-direction: column; gap: 12px; }
`;

/** Get the WebSocket URL for the VNC proxy */
function getVncWsUrl(host: string, port: number, credentialId?: number): string {
  const base = getPingServerUrl();
  const token = authService.getToken() || '';
  // Convert http(s) to ws(s)
  const wsBase = base.replace(/^http/, 'ws');
  let wsUrl = `${wsBase}/api/vnc/connect?host=${encodeURIComponent(host)}&port=${port}&token=${encodeURIComponent(token)}`;
  if (credentialId) {
    wsUrl += `&credentialId=${credentialId}`;
  }
  return wsUrl;
}

class VncWidgetRenderer implements WidgetRenderer {
  private connections: Map<string, {
    rfb: any; // noVNC RFB instance
    connected: boolean;
    reconnectTimer?: number;
  }> = new Map();

  configure(widget: Widget): void {
    this.showConfigDialog(widget);
  }

  render(container: HTMLElement, widget: Widget): void {
    injectWidgetStyles('vnc', VNC_STYLES);
    
    const content = { ...DEFAULT_CONTENT, ...(widget.content as Partial<VncContent>) };

    // If no credential selected, show config screen
    if (!content.credentialId) {
      this.renderConfigScreen(container, widget);
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'vnc-widget';

    // Status bar
    const statusBar = document.createElement('div');
    statusBar.className = 'vnc-status-bar';

    const statusIndicator = document.createElement('span');
    statusIndicator.className = 'vnc-status-indicator disconnected';
    statusIndicator.textContent = 'Disconnected';

    const statusInfo = document.createElement('span');
    statusInfo.className = 'vnc-status-info';
    statusInfo.textContent = 'Loading...';

    const connectBtn = document.createElement('button');
    connectBtn.className = 'vnc-connect-btn';
    connectBtn.textContent = 'Connect';
    stopWidgetDragPropagation(connectBtn);

    statusBar.appendChild(statusIndicator);
    statusBar.appendChild(statusInfo);
    statusBar.appendChild(connectBtn);

    // VNC display container
    const vncContainer = document.createElement('div');
    vncContainer.className = 'vnc-display';
    vncContainer.id = `vnc-display-${widget.id}`;

    // Prevent widget drag inside the VNC display
    stopWidgetDragPropagation(vncContainer);

    wrapper.appendChild(statusBar);
    wrapper.appendChild(vncContainer);
    container.appendChild(wrapper);

    const doConnect = () => this.connectVnc(widget, content, vncContainer, statusIndicator, connectBtn);
    const doDisconnect = () => this.disconnectVnc(widget.id, statusIndicator, connectBtn);

    connectBtn.onclick = () => {
      const conn = this.connections.get(widget.id);
      if (conn?.connected) {
        doDisconnect();
      } else {
        doConnect();
      }
    };

    // Auto-connect if configured
    if (content.autoConnect) {
      // Small delay to ensure DOM is ready
      setTimeout(() => doConnect(), 300);
    }
  }

  private async connectVnc(
    widget: Widget,
    content: VncContent,
    vncContainer: HTMLElement,
    statusIndicator: HTMLElement,
    connectBtn: HTMLElement,
  ): Promise<void> {
    const widgetId = widget.id;

    // Disconnect any existing connection
    this.disconnectVnc(widgetId, statusIndicator, connectBtn);

    statusIndicator.className = 'vnc-status-indicator connecting';
    statusIndicator.textContent = 'Connecting...';
    connectBtn.textContent = 'Cancel';

    try {
      // Fetch connection info from credential
      let host: string;
      let port: number;
      let vncPassword: string | undefined;

      if (!content.credentialId) {
        throw new Error('No VNC credential configured');
      }

      try {
        const cred = await credentialsService.getById(content.credentialId);
        host = cred.data?.host;
        port = parseInt(cred.data?.port) || 5900;
        vncPassword = cred.data?.password;
        if (!host) {
          throw new Error('Credential is missing host');
        }
      } catch (e: any) {
        throw new Error(`Could not load credential: ${e.message}`);
      }

      // Update status bar with connection info
      const statusInfo = vncContainer.parentElement?.querySelector('.vnc-status-info');
      if (statusInfo) statusInfo.textContent = `${host}:${port}`;

      const wsUrl = getVncWsUrl(host, port, content.credentialId);

      // Create RFB connection
      // noVNC RFB takes: target (DOM element), url (WebSocket URL), options

      // Monkey-patch getContext to add willReadFrequently hint for noVNC's canvas.
      // This suppresses the "Multiple readback operations using getImageData are
      // faster with the willReadFrequently attribute" console warning.
      const _origGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type: string, attrs?: any) {
        if (type === '2d') {
          attrs = { ...attrs, willReadFrequently: true };
        }
        return _origGetContext.call(this, type, attrs);
      } as typeof HTMLCanvasElement.prototype.getContext;

      // Suppress the "noVNC requires a secure context (TLS)" warning during
      // construction. Standard VNC password auth (DES) works fine without TLS;
      // only RSA-AES auth needs SubtleCrypto / secure context.
      // noVNC's Log functions are bound at module load time, so patching
      // console.error/warn won't help. Instead, temporarily override
      // window.isSecureContext so the check in RFB's constructor passes.
      const secureContextDesc = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
      Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });

      const rfb = new RFB(vncContainer, wsUrl, {
        credentials: vncPassword ? { password: vncPassword } : undefined,
        wsProtocols: ['binary'],
      });

      // Restore original getContext and isSecureContext immediately after construction
      HTMLCanvasElement.prototype.getContext = _origGetContext;
      if (secureContextDesc) {
        Object.defineProperty(window, 'isSecureContext', secureContextDesc);
      } else {
        delete (window as any).isSecureContext;
      }

      // Configure RFB
      rfb.viewOnly = content.viewOnly;
      rfb.scaleViewport = content.scaleMode === 'local';
      rfb.resizeSession = content.scaleMode === 'remote';
      rfb.clipViewport = content.clipToWindow;
      rfb.showDotCursor = content.showDotCursor;
      rfb.qualityLevel = content.qualityLevel;
      rfb.compressionLevel = content.compressionLevel;

      // Event handlers
      rfb.addEventListener('connect', () => {
        statusIndicator.className = 'vnc-status-indicator connected';
        statusIndicator.textContent = 'Connected';
        connectBtn.textContent = 'Disconnect';
        const conn = this.connections.get(widgetId);
        if (conn) conn.connected = true;
      });

      rfb.addEventListener('disconnect', (e: any) => {
        const clean = e.detail?.clean;
        statusIndicator.className = 'vnc-status-indicator disconnected';
        statusIndicator.textContent = clean ? 'Disconnected' : 'Connection lost';
        connectBtn.textContent = 'Connect';
        const conn = this.connections.get(widgetId);
        if (conn) conn.connected = false;

        // Auto-reconnect if enabled and not a clean disconnect
        if (!clean && content.reconnectDelay > 0) {
          statusIndicator.textContent = `Reconnecting in ${content.reconnectDelay}s...`;
          const timer = window.setTimeout(() => {
            this.connectVnc(widget, content, vncContainer, statusIndicator, connectBtn);
          }, content.reconnectDelay * 1000);
          if (conn) conn.reconnectTimer = timer;
        }
      });

      rfb.addEventListener('credentialsrequired', () => {
        // Show inline password dialog instead of browser prompt()
        this.showPasswordPrompt(vncContainer, (password) => {
          if (password !== null) {
            rfb.sendCredentials({ password });
          } else {
            rfb.disconnect();
          }
        });
      });

      rfb.addEventListener('desktopname', (e: any) => {
        const name = e.detail?.name;
        if (name) {
          const statusInfoEl = vncContainer.parentElement?.querySelector('.vnc-status-info');
          if (statusInfoEl) {
            statusInfoEl.textContent = `${name} (${host}:${port})`;
          }
        }
      });

      rfb.addEventListener('bell', () => {
        // Visual bell — briefly flash the border
        vncContainer.classList.add('vnc-bell');
        setTimeout(() => vncContainer.classList.remove('vnc-bell'), 200);
      });

      this.connections.set(widgetId, { rfb, connected: false });

    } catch (err: any) {
      console.error('VNC connection error:', err);
      statusIndicator.className = 'vnc-status-indicator error';
      statusIndicator.textContent = `Error: ${err.message}`;
      connectBtn.textContent = 'Retry';
    }
  }

  private disconnectVnc(widgetId: string, statusIndicator: HTMLElement, connectBtn: HTMLElement): void {
    const conn = this.connections.get(widgetId);
    if (conn) {
      if (conn.reconnectTimer) {
        clearTimeout(conn.reconnectTimer);
      }
      try {
        // Only disconnect if the RFB object is still in a connected/connecting state
        if (conn.rfb && conn.rfb._rfbConnectionState !== 'disconnected') {
          conn.rfb.disconnect();
        }
      } catch (e) {
        // Ignore errors during disconnect
      }
      this.connections.delete(widgetId);
    }
    statusIndicator.className = 'vnc-status-indicator disconnected';
    statusIndicator.textContent = 'Disconnected';
    connectBtn.textContent = 'Connect';
  }

  /** Show an inline password prompt overlay inside the VNC display container */
  private showPasswordPrompt(vncContainer: HTMLElement, callback: (password: string | null) => void): void {
    // Remove any existing prompt
    const existing = vncContainer.querySelector('.vnc-password-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'vnc-password-overlay';

    const box = document.createElement('div');
    box.className = 'vnc-password-box';

    const title = document.createElement('div');
    title.className = 'vnc-password-title';
    title.innerHTML = '<i class="fas fa-lock"></i> VNC Authentication Required';

    const input = document.createElement('input');
    input.type = 'password';
    input.placeholder = 'Enter VNC password (or leave blank)';
    input.className = 'vnc-password-input';
    stopWidgetDragPropagation(input);

    const btnRow = document.createElement('div');
    btnRow.className = 'vnc-password-buttons';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'vnc-password-cancel';
    stopWidgetDragPropagation(cancelBtn);

    const connectBtn = document.createElement('button');
    connectBtn.textContent = 'Connect';
    connectBtn.className = 'vnc-password-connect';
    stopWidgetDragPropagation(connectBtn);

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(connectBtn);

    box.appendChild(title);
    box.appendChild(input);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    vncContainer.appendChild(overlay);

    input.focus();

    const cleanup = () => overlay.remove();

    connectBtn.onclick = () => {
      cleanup();
      callback(input.value); // Allow empty password
    };

    cancelBtn.onclick = () => {
      cleanup();
      callback(null);
    };

    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        cleanup();
        callback(input.value);
      }
    });
  }

  private async renderConfigScreen(container: HTMLElement, widget: Widget): Promise<void> {
    const div = document.createElement('div');
    div.className = 'widget-config-screen padded';

    const icon = document.createElement('div');
    icon.innerHTML = '<i class="fas fa-desktop"></i>';
    icon.className = 'widget-config-icon';

    const label = document.createElement('div');
    label.textContent = 'Configure VNC Connection';
    label.className = 'vnc-config-label';

    const inputGroup = document.createElement('div');
    inputGroup.className = 'vnc-config-inputs';

    // Credential selector
    const credSelect = document.createElement('select');
    credSelect.className = 'vnc-config-input';
    credSelect.innerHTML = '<option value="">Select VNC credential...</option>';

    let credentials: any[] = [];
    try {
      const allCreds = await credentialsService.getAll();
      credentials = allCreds.filter(c => ['vnc', 'custom'].includes(c.service_type));
      credentials.forEach(c => {
        const opt = document.createElement('option');
        opt.value = String(c.id);
        opt.textContent = `${c.name} (${c.service_type})`;
        credSelect.appendChild(opt);
      });
    } catch (e) {
      console.warn('Could not load credentials:', e);
    }

    const button = document.createElement('button');
    button.textContent = 'Connect';
    button.className = 'vnc-config-button';
    button.disabled = true;

    credSelect.addEventListener('change', () => {
      button.disabled = !credSelect.value;
    });

    button.addEventListener('click', () => {
      const credentialId = parseInt(credSelect.value);
      if (credentialId) {
        dispatchWidgetUpdate(widget.id, {
          ...DEFAULT_CONTENT,
          credentialId,
        });
      }
    });

    stopWidgetDragPropagation(credSelect);
    stopWidgetDragPropagation(button);

    inputGroup.appendChild(credSelect);

    div.appendChild(icon);
    div.appendChild(label);
    div.appendChild(inputGroup);
    div.appendChild(button);
    container.appendChild(div);
  }

  private async showConfigDialog(widget: Widget): Promise<void> {
    const content = { ...DEFAULT_CONTENT, ...(widget.content as Partial<VncContent>) };

    const overlay = document.createElement('div');
    overlay.className = 'widget-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'widget-dialog vnc-config-dialog';

    // Load credentials for dropdown
    let credentials: any[] = [];
    try {
      const allCreds = await credentialsService.getAll();
      credentials = allCreds.filter(c =>
        ['vnc', 'custom', 'basic'].includes(c.service_type)
      );
    } catch (e) {
      console.warn('Could not load credentials:', e);
    }

    dialog.innerHTML = `
      <h3 class="widget-dialog-title">Configure VNC</h3>
      
      <div class="widget-dialog-field">
        <label class="widget-dialog-label">VNC Credential</label>
        <select id="vnc-credential" class="widget-dialog-input">
          <option value="">Select credential...</option>
          ${credentials.map(c => `
            <option value="${c.id}" ${c.id === content.credentialId ? 'selected' : ''}>
              ${c.name} (${c.service_type})
            </option>
          `).join('')}
        </select>
      </div>

      <div class="widget-dialog-field">
        <label class="widget-dialog-label">
          <input type="checkbox" id="vnc-view-only" ${content.viewOnly ? 'checked' : ''} />
          View Only (no keyboard/mouse input)
        </label>
      </div>

      <div class="widget-dialog-field">
        <label class="widget-dialog-label">Scaling Mode</label>
        <select id="vnc-scale-mode" class="widget-dialog-input">
          <option value="local" ${content.scaleMode === 'local' ? 'selected' : ''}>Scale to Fit (local)</option>
          <option value="remote" ${content.scaleMode === 'remote' ? 'selected' : ''}>Resize Remote Desktop</option>
          <option value="none" ${content.scaleMode === 'none' ? 'selected' : ''}>No Scaling (1:1)</option>
        </select>
      </div>

      <div class="widget-dialog-field">
        <label class="widget-dialog-label">Quality Level (0-9)</label>
        <input type="range" id="vnc-quality" min="0" max="9" value="${content.qualityLevel}" 
               class="widget-dialog-input" />
        <span id="vnc-quality-value">${content.qualityLevel}</span>
      </div>

      <div class="widget-dialog-field">
        <label class="widget-dialog-label">Compression Level (0-9)</label>
        <input type="range" id="vnc-compression" min="0" max="9" value="${content.compressionLevel}" 
               class="widget-dialog-input" />
        <span id="vnc-compression-value">${content.compressionLevel}</span>
      </div>

      <div class="widget-dialog-field">
        <label class="widget-dialog-label">
          <input type="checkbox" id="vnc-auto-connect" ${content.autoConnect ? 'checked' : ''} />
          Auto-connect on load
        </label>
      </div>

      <div class="widget-dialog-field">
        <label class="widget-dialog-label">Reconnect Delay (seconds, 0 = disabled)</label>
        <input type="number" id="vnc-reconnect" value="${content.reconnectDelay}" 
               min="0" max="300" class="widget-dialog-input" />
      </div>

      <div class="widget-dialog-buttons">
        <button id="cancel-btn" class="widget-dialog-button-cancel">Cancel</button>
        <button id="save-btn" class="widget-dialog-button-save">Save</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    stopAllDragPropagation(dialog);

    // Quality/compression display update
    const qualitySlider = dialog.querySelector('#vnc-quality') as HTMLInputElement;
    const qualityValue = dialog.querySelector('#vnc-quality-value') as HTMLElement;
    qualitySlider.oninput = () => { qualityValue.textContent = qualitySlider.value; };

    const compSlider = dialog.querySelector('#vnc-compression') as HTMLInputElement;
    const compValue = dialog.querySelector('#vnc-compression-value') as HTMLElement;
    compSlider.oninput = () => { compValue.textContent = compSlider.value; };

    const close = () => overlay.remove();

    (dialog.querySelector('#cancel-btn') as HTMLElement).onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    (dialog.querySelector('#save-btn') as HTMLElement).onclick = () => {
      const credentialSelect = dialog.querySelector('#vnc-credential') as HTMLSelectElement;
      const credentialId = credentialSelect.value ? parseInt(credentialSelect.value) : undefined;
      const viewOnly = (dialog.querySelector('#vnc-view-only') as HTMLInputElement).checked;
      const scaleMode = (dialog.querySelector('#vnc-scale-mode') as HTMLSelectElement).value as VncContent['scaleMode'];
      const qualityLevel = parseInt(qualitySlider.value);
      const compressionLevel = parseInt(compSlider.value);
      const autoConnect = (dialog.querySelector('#vnc-auto-connect') as HTMLInputElement).checked;
      const reconnectDelay = parseInt((dialog.querySelector('#vnc-reconnect') as HTMLInputElement).value) || 0;

      if (credentialId) {
        dispatchWidgetUpdate(widget.id, {
          credentialId,
          viewOnly,
          scaleMode,
          clipToWindow: true,
          showDotCursor: false,
          qualityLevel,
          compressionLevel,
          autoConnect,
          reconnectDelay,
        });

        // Disconnect existing connection so it reconnects with new settings
        const conn = this.connections.get(widget.id);
        if (conn) {
          try { conn.rfb?.disconnect(); } catch (e) { /* ignore */ }
          this.connections.delete(widget.id);
        }
      }

      close();
    };
  }

  getHeaderButtons(widget: Widget): HTMLElement[] {
    const buttons: HTMLElement[] = [];
    const content = widget.content as Partial<VncContent>;

    if (content.credentialId) {
      // Fullscreen button
      const fullscreenBtn = document.createElement('button');
      fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
      fullscreenBtn.title = 'Fullscreen';
      fullscreenBtn.onclick = () => {
        const container = document.querySelector(`#vnc-display-${widget.id}`);
        if (container) {
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            container.requestFullscreen();
          }
        }
      };
      buttons.push(fullscreenBtn);

      // Ctrl+Alt+Del button
      const cadBtn = document.createElement('button');
      cadBtn.innerHTML = '<i class="fas fa-keyboard"></i>';
      cadBtn.title = 'Send Ctrl+Alt+Del';
      cadBtn.onclick = () => {
        const conn = this.connections.get(widget.id);
        if (conn?.rfb && conn.connected) {
          conn.rfb.sendCtrlAltDel();
        }
      };
      buttons.push(cadBtn);

      // Clipboard sync button
      const clipBtn = document.createElement('button');
      clipBtn.innerHTML = '<i class="fas fa-clipboard"></i>';
      clipBtn.title = 'Paste Clipboard';
      clipBtn.onclick = async () => {
        const conn = this.connections.get(widget.id);
        if (conn?.rfb && conn.connected) {
          try {
            const text = await navigator.clipboard.readText();
            conn.rfb.clipboardPasteFrom(text);
          } catch (e) {
            console.warn('Clipboard read not available:', e);
          }
        }
      };
      buttons.push(clipBtn);
    }

    return buttons;
  }

  destroy(): void {
    // Clean up all VNC connections
    this.connections.forEach((conn, _widgetId) => {
      if (conn.reconnectTimer) {
        clearTimeout(conn.reconnectTimer);
      }
      try {
        conn.rfb?.disconnect();
      } catch (e) {
        // Ignore
      }
    });
    this.connections.clear();
  }
}

export const widget = {
  type: 'vnc',
  name: 'VNC Remote Desktop',
  icon: '<i class="fas fa-desktop"></i>',
  description: 'Connect to remote VNC servers and display their desktops',
  renderer: new VncWidgetRenderer(),
  defaultSize: { w: 800, h: 600 },
  defaultContent: { ...DEFAULT_CONTENT },
  hasSettings: true,
};
