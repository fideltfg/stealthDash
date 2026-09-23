import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';
import { credentialsService, type Credential } from '../services/credentials';
import { getPingServerUrl } from '../utils/api';
import {
  dispatchWidgetUpdate,
  escapeHtml,
  injectWidgetStyles,
  stopAllDragPropagation,
  stopWidgetDragPropagation,
} from '../utils/dom';
import { authService } from '../services/auth';
// @ts-ignore — noVNC 1.5 does not ship TypeScript declarations.
import RFB from '@novnc/novnc/core/rfb.js';

type ScaleMode = 'local' | 'remote' | 'none';
type ConnectionPhase = 'disconnected' | 'connecting' | 'connected' | 'error';
type VncCredentials = { username?: string; password?: string; target?: string };

interface VncContent {
  credentialId?: number;
  viewOnly: boolean;
  scaleMode: ScaleMode;
  clipToWindow: boolean;
  dragViewport: boolean;
  focusOnClick: boolean;
  shared: boolean;
  qualityLevel: number;
  compressionLevel: number;
  autoConnect: boolean;
  reconnectDelay: number;
  background: string;
}

interface RfbClient extends EventTarget {
  capabilities: { power?: boolean };
  clippingViewport: boolean;
  clipViewport: boolean;
  compressionLevel: number;
  dragViewport: boolean;
  focusOnClick: boolean;
  qualityLevel: number;
  resizeSession: boolean;
  scaleViewport: boolean;
  viewOnly: boolean;
  background: string;
  approveServer(): void;
  blur(): void;
  clipboardPasteFrom(text: string): void;
  disconnect(): void;
  focus(options?: FocusOptions): void;
  machineReboot(): void;
  machineReset(): void;
  machineShutdown(): void;
  sendCredentials(credentials: VncCredentials): void;
  sendCtrlAltDel(): void;
  sendKey(keysym: number, code: string | null, down?: boolean): void;
  toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number): void;
}

interface VncElements {
  wrapper: HTMLDivElement;
  display: HTMLDivElement;
  status: HTMLSpanElement;
  statusInfo: HTMLSpanElement;
  connect: HTMLButtonElement;
  controls: HTMLButtonElement[];
  power: HTMLSelectElement;
  clipboardBadge: HTMLSpanElement;
}

interface VncSession {
  generation: number;
  widget: Widget;
  content: VncContent;
  elements: VncElements;
  phase: ConnectionPhase;
  rfb?: RfbClient;
  reconnectTimer?: number;
  manualDisconnect: boolean;
  credentials?: Record<string, string>;
  remoteClipboard: string;
}

const DEFAULT_CONTENT: VncContent = {
  viewOnly: false,
  scaleMode: 'local',
  clipToWindow: true,
  dragViewport: false,
  focusOnClick: true,
  shared: true,
  qualityLevel: 6,
  compressionLevel: 2,
  autoConnect: true,
  reconnectDelay: 5,
  background: '#000000',
};

const VNC_STYLES = `
.vnc-widget { display:flex; flex-direction:column; width:100%; height:100%; overflow:hidden; background:#000; color:var(--text); }
.vnc-widget:fullscreen { width:100vw; height:100vh; background:#000; }
.vnc-status-bar,.vnc-toolbar { display:flex; align-items:center; gap:6px; padding:4px 7px; flex-shrink:0; background:var(--widget-bg,rgba(25,25,25,.96)); border-bottom:1px solid var(--border); font-size:11px; }
.vnc-status-indicator { display:flex; align-items:center; gap:5px; font-weight:600; white-space:nowrap; }
.vnc-status-indicator::before { content:''; width:8px; height:8px; border-radius:50%; background:#888; flex:none; }
.vnc-status-indicator.connecting::before { background:#f0ad4e; animation:vnc-pulse 1s infinite; }
.vnc-status-indicator.connected::before { background:#4caf50; }
.vnc-status-indicator.error::before { background:#f44336; }
@keyframes vnc-pulse { 50% { opacity:.3; } }
.vnc-status-info { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; opacity:.75; }
.vnc-button,.vnc-select { min-height:25px; border:1px solid var(--border); border-radius:4px; color:inherit; background:var(--surface,rgba(255,255,255,.06)); font:inherit; }
.vnc-button { padding:3px 8px; cursor:pointer; white-space:nowrap; }
.vnc-button:hover:not(:disabled),.vnc-select:hover:not(:disabled) { background:var(--hover,rgba(255,255,255,.12)); }
.vnc-button:disabled,.vnc-select:disabled { opacity:.35; cursor:not-allowed; }
.vnc-toolbar { overflow-x:auto; scrollbar-width:thin; }
.vnc-toolbar .vnc-spacer { flex:1; min-width:4px; }
.vnc-select { padding:2px 4px; max-width:125px; }
.vnc-clipboard-badge { display:none; color:#4caf50; font-size:10px; }
.vnc-clipboard-badge.visible { display:inline; }
.vnc-display { position:relative; flex:1; min-height:0; overflow:auto; background:#000; outline:none; }
.vnc-display > div { width:100%; height:100%; }
.vnc-display.vnc-bell { box-shadow:inset 0 0 28px rgba(255,220,0,.55); }
.vnc-overlay { position:absolute; inset:0; z-index:20; display:flex; align-items:center; justify-content:center; padding:16px; background:rgba(0,0,0,.82); }
.vnc-panel { width:min(420px,100%); max-height:100%; overflow:auto; display:flex; flex-direction:column; gap:10px; padding:16px; border:1px solid var(--border); border-radius:8px; background:var(--surface,#222); }
.vnc-panel h4 { margin:0; }
.vnc-panel-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; }
.vnc-panel textarea { min-height:120px; resize:vertical; }
.vnc-fingerprint { padding:8px; overflow-wrap:anywhere; border-radius:4px; background:rgba(0,0,0,.25); font-family:monospace; font-size:10px; }
.vnc-settings-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px 16px; }
.vnc-settings-grid .widget-dialog-field { margin:0; }
@media (max-width:600px) { .vnc-settings-grid { grid-template-columns:1fr; } }
`;

const KEY_ACTIONS: Record<string, () => Array<[number, string | null]>> = {
  escape: () => [[0xff1b, 'Escape']],
  tab: () => [[0xff09, 'Tab']],
  meta: () => [[0xffeb, 'MetaLeft']],
  altF4: () => [[0xffe9, 'AltLeft'], [0xffc1, 'F4']],
  ctrlEsc: () => [[0xffe3, 'ControlLeft'], [0xff1b, 'Escape']],
  ctrlAltBackspace: () => [[0xffe3, 'ControlLeft'], [0xffe9, 'AltLeft'], [0xff08, 'Backspace']],
};

function normalizeContent(content: Partial<VncContent>): VncContent {
  const merged = { ...DEFAULT_CONTENT, ...content };
  return {
    ...merged,
    qualityLevel: Math.max(0, Math.min(9, Number(merged.qualityLevel) || 0)),
    compressionLevel: Math.max(0, Math.min(9, Number(merged.compressionLevel) || 0)),
    reconnectDelay: Math.max(0, Math.min(300, Number(merged.reconnectDelay) || 0)),
  };
}

function getVncWsUrl(credentialId: number): string {
  const base = getPingServerUrl().replace(/^http/, 'ws');
  const params = new URLSearchParams({
    credentialId: String(credentialId),
    token: authService.getToken() || '',
  });
  return `${base}/api/vnc/connect?${params}`;
}

function createButton(label: string, title: string, icon?: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'vnc-button';
  button.title = title;
  button.innerHTML = icon ? `<i class="${icon}"></i><span class="sr-only">${escapeHtml(label)}</span>` : escapeHtml(label);
  stopWidgetDragPropagation(button);
  return button;
}

class VncWidgetRenderer implements WidgetRenderer {
  private sessions = new Map<string, VncSession>();
  private generation = 0;

  configure(widget: Widget): void {
    void this.showConfigDialog(widget);
  }

  render(container: HTMLElement, widget: Widget): void {
    injectWidgetStyles('vnc', VNC_STYLES);
    this.disposeSession(widget.id, true);
    const content = normalizeContent(widget.content as Partial<VncContent>);

    if (!content.credentialId) {
      void this.renderConfigScreen(container, widget);
      return;
    }

    const elements = this.createInterface(widget);
    container.replaceChildren(elements.wrapper);
    const session: VncSession = {
      generation: ++this.generation,
      widget,
      content,
      elements,
      phase: 'disconnected',
      manualDisconnect: false,
      remoteClipboard: '',
    };
    this.sessions.set(widget.id, session);
    this.bindControls(session);
    this.updateControls(session);

    if (content.autoConnect) {
      window.setTimeout(() => {
        if (this.isCurrent(session)) void this.connect(session);
      }, 250);
    }
  }

  private createInterface(widget: Widget): VncElements {
    const wrapper = document.createElement('div');
    wrapper.className = 'vnc-widget';
    wrapper.id = `vnc-widget-${widget.id}`;

    const statusBar = document.createElement('div');
    statusBar.className = 'vnc-status-bar';
    const status = document.createElement('span');
    status.className = 'vnc-status-indicator disconnected';
    status.textContent = 'Disconnected';
    const statusInfo = document.createElement('span');
    statusInfo.className = 'vnc-status-info';
    statusInfo.textContent = 'Ready';
    const clipboardBadge = document.createElement('span');
    clipboardBadge.className = 'vnc-clipboard-badge';
    clipboardBadge.textContent = 'Clipboard received';
    const connect = createButton('Connect', 'Connect or disconnect');
    statusBar.append(status, statusInfo, clipboardBadge, connect);

    const toolbar = document.createElement('div');
    toolbar.className = 'vnc-toolbar';
    const focus = createButton('Focus', 'Focus remote keyboard', 'fas fa-keyboard');
    const cad = createButton('Ctrl+Alt+Del', 'Send Ctrl+Alt+Delete', 'fas fa-shield-halved');
    const clipboard = createButton('Clipboard', 'Open clipboard transfer', 'fas fa-clipboard');
    const screenshot = createButton('Screenshot', 'Download screenshot', 'fas fa-camera');
    const viewOnly = createButton('View only', 'Toggle view-only mode', 'fas fa-eye');
    const fullscreen = createButton('Fullscreen', 'Toggle fullscreen', 'fas fa-expand');

    const keySelect = document.createElement('select');
    keySelect.className = 'vnc-select';
    keySelect.title = 'Send a special key sequence';
    keySelect.innerHTML = '<option value="">Send key…</option><option value="escape">Escape</option><option value="tab">Tab</option><option value="meta">Windows / Meta</option><option value="altF4">Alt+F4</option><option value="ctrlEsc">Ctrl+Escape</option><option value="ctrlAltBackspace">Ctrl+Alt+Backspace</option>';
    stopWidgetDragPropagation(keySelect);

    const power = document.createElement('select');
    power.className = 'vnc-select';
    power.title = 'Remote power controls (server support required)';
    power.innerHTML = '<option value="">Power…</option><option value="shutdown">Shutdown</option><option value="reboot">Reboot</option><option value="reset">Force reset</option>';
    stopWidgetDragPropagation(power);

    const spacer = document.createElement('span');
    spacer.className = 'vnc-spacer';
    toolbar.append(focus, cad, keySelect, clipboard, screenshot, viewOnly, spacer, power, fullscreen);

    const display = document.createElement('div');
    display.className = 'vnc-display';
    display.id = `vnc-display-${widget.id}`;
    display.tabIndex = 0;
    stopWidgetDragPropagation(display);

    wrapper.append(statusBar, toolbar, display);
    return { wrapper, display, status, statusInfo, connect, controls: [focus, cad, clipboard, screenshot, viewOnly], power, clipboardBadge };
  }

  private bindControls(session: VncSession): void {
    const { elements } = session;
    const [focus, cad, clipboard, screenshot, viewOnly] = elements.controls;

    elements.connect.onclick = () => {
      if (session.phase === 'connecting' || session.phase === 'connected') {
        this.disconnectCurrent(session);
      } else {
        void this.connect(session);
      }
    };
    focus.onclick = () => session.rfb?.focus({ preventScroll: true });
    cad.onclick = () => session.rfb?.sendCtrlAltDel();
    clipboard.onclick = () => this.showClipboardPanel(session);
    screenshot.onclick = () => this.downloadScreenshot(session);
    viewOnly.onclick = () => {
      if (!session.rfb) return;
      session.content.viewOnly = !session.content.viewOnly;
      session.rfb.viewOnly = session.content.viewOnly;
      this.updateControls(session);
    };

    const keySelect = elements.wrapper.querySelector('.vnc-toolbar .vnc-select') as HTMLSelectElement;
    keySelect.onchange = () => {
      if (keySelect.value) this.sendKeyChord(session, keySelect.value);
      keySelect.value = '';
    };

    elements.power.onchange = () => {
      const action = elements.power.value as 'shutdown' | 'reboot' | 'reset' | '';
      elements.power.value = '';
      if (action) this.runPowerAction(session, action);
    };

    const fullscreen = elements.wrapper.querySelector('[title="Toggle fullscreen"]') as HTMLButtonElement;
    fullscreen.onclick = async () => {
      if (document.fullscreenElement === elements.wrapper) await document.exitFullscreen();
      else await elements.wrapper.requestFullscreen();
    };
  }

  private async connect(session: VncSession): Promise<void> {
    if (!session.content.credentialId || !this.isCurrent(session)) return;
    this.clearReconnectTimer(session);
    session.manualDisconnect = false;
    session.phase = 'connecting';
    session.elements.display.replaceChildren();
    this.setStatus(session, 'connecting', 'Connecting…');
    this.updateControls(session);

    try {
      const credential = await credentialsService.getById(session.content.credentialId);
      if (!this.isCurrent(session)) return;
      const data = credential.data || {};
      if (!data.host) throw new Error('The selected credential has no VNC host');
      session.credentials = data;
      session.elements.statusInfo.textContent = `${data.host}:${Number(data.port) || 5900}`;

      const credentials: VncCredentials = {};
      if (data.username) credentials.username = data.username;
      if (data.password !== undefined) credentials.password = data.password;
      if (data.target) credentials.target = data.target;

      const rfb = new RFB(session.elements.display, getVncWsUrl(session.content.credentialId), {
        shared: session.content.shared,
        credentials,
        repeaterID: data.repeaterID || data.repeaterId,
        wsProtocols: ['binary'],
      }) as RfbClient;
      session.rfb = rfb;
      this.applyRfbSettings(session);
      this.bindRfbEvents(session, rfb, credential);
    } catch (error) {
      if (!this.isCurrent(session)) return;
      session.phase = 'error';
      this.setStatus(session, 'error', error instanceof Error ? error.message : 'Connection failed');
      this.updateControls(session);
    }
  }

  private applyRfbSettings(session: VncSession): void {
    const rfb = session.rfb;
    if (!rfb) return;
    const c = session.content;
    rfb.viewOnly = c.viewOnly;
    rfb.scaleViewport = c.scaleMode === 'local';
    rfb.resizeSession = c.scaleMode === 'remote';
    rfb.clipViewport = c.clipToWindow;
    rfb.dragViewport = c.dragViewport;
    rfb.focusOnClick = c.focusOnClick;
    rfb.qualityLevel = c.qualityLevel;
    rfb.compressionLevel = c.compressionLevel;
    rfb.background = c.background;
  }

  private bindRfbEvents(session: VncSession, rfb: RfbClient, credential: Credential): void {
    rfb.addEventListener('connect', () => {
      if (!this.isActiveRfb(session, rfb)) return;
      session.phase = 'connected';
      this.setStatus(session, 'connected', 'Connected');
      session.elements.statusInfo.textContent = credential.name;
      this.updateControls(session);
      rfb.focus({ preventScroll: true });
    });

    rfb.addEventListener('disconnect', ((event: CustomEvent<{ clean: boolean }>) => {
      if (!this.isActiveRfb(session, rfb)) return;
      session.rfb = undefined;
      session.phase = 'disconnected';
      const clean = Boolean(event.detail?.clean);
      this.setStatus(session, clean ? 'disconnected' : 'error', clean ? 'Disconnected' : 'Connection lost');
      this.updateControls(session);
      if (!clean && !session.manualDisconnect) this.scheduleReconnect(session);
    }) as EventListener);

    rfb.addEventListener('credentialsrequired', ((event: CustomEvent<{ types: string[] }>) => {
      if (!this.isActiveRfb(session, rfb)) return;
      this.requestCredentials(session, event.detail?.types || ['password']);
    }) as EventListener);

    rfb.addEventListener('securityfailure', ((event: CustomEvent<{ status: number; reason?: string }>) => {
      if (!this.isActiveRfb(session, rfb)) return;
      const reason = event.detail?.reason || `Security negotiation failed (${event.detail?.status ?? 'unknown'})`;
      this.setStatus(session, 'error', reason);
    }) as EventListener);

    rfb.addEventListener('serververification', ((event: CustomEvent<{ type: string; publickey?: Uint8Array }>) => {
      if (this.isActiveRfb(session, rfb)) this.requestServerApproval(session, event.detail);
    }) as EventListener);

    rfb.addEventListener('desktopname', ((event: CustomEvent<{ name: string }>) => {
      if (this.isActiveRfb(session, rfb) && event.detail?.name) session.elements.statusInfo.textContent = event.detail.name;
    }) as EventListener);

    rfb.addEventListener('clipboard', ((event: CustomEvent<{ text: string }>) => {
      if (!this.isActiveRfb(session, rfb)) return;
      session.remoteClipboard = event.detail?.text || '';
      session.elements.clipboardBadge.classList.add('visible');
    }) as EventListener);

    rfb.addEventListener('capabilities', () => this.updateControls(session));
    rfb.addEventListener('clippingviewport', () => {
      session.elements.display.title = rfb.clippingViewport ? 'Remote desktop is clipped; drag to pan' : '';
    });
    rfb.addEventListener('bell', () => {
      session.elements.display.classList.add('vnc-bell');
      window.setTimeout(() => session.elements.display.classList.remove('vnc-bell'), 250);
    });
  }

  private requestCredentials(session: VncSession, types: string[]): void {
    const initial = session.credentials || {};
    const fields = types.filter(type => ['username', 'password', 'target'].includes(type));
    this.showFormOverlay(session, 'VNC authentication required', fields, initial, values => {
      if (values && session.rfb) session.rfb.sendCredentials(values);
      else this.disconnectCurrent(session);
    });
  }

  private requestServerApproval(session: VncSession, detail: { type: string; publickey?: Uint8Array }): void {
    const fingerprint = detail.publickey
      ? Array.from(detail.publickey, byte => byte.toString(16).padStart(2, '0')).join(':')
      : 'No fingerprint supplied';
    const overlay = this.createOverlay(session, 'Verify VNC server');
    const message = document.createElement('p');
    message.textContent = `The server requests ${detail.type || 'identity'} verification. Confirm this fingerprint before continuing.`;
    const key = document.createElement('div');
    key.className = 'vnc-fingerprint';
    key.textContent = fingerprint;
    const actions = document.createElement('div');
    actions.className = 'vnc-panel-actions';
    const reject = createButton('Reject', 'Reject server identity');
    const approve = createButton('Approve', 'Approve server identity');
    reject.onclick = () => { overlay.remove(); this.disconnectCurrent(session); };
    approve.onclick = () => { overlay.remove(); session.rfb?.approveServer(); };
    actions.append(reject, approve);
    overlay.firstElementChild?.append(message, key, actions);
  }

  private showClipboardPanel(session: VncSession): void {
    const overlay = this.createOverlay(session, 'Clipboard');
    const textarea = document.createElement('textarea');
    textarea.className = 'widget-dialog-input';
    textarea.value = session.remoteClipboard;
    textarea.placeholder = 'Text received from the server or text to send';
    stopWidgetDragPropagation(textarea);
    const actions = document.createElement('div');
    actions.className = 'vnc-panel-actions';
    const readLocal = createButton('Read local', 'Read browser clipboard');
    const copyLocal = createButton('Copy local', 'Copy text to browser clipboard');
    const send = createButton('Send remote', 'Send text to remote clipboard');
    const close = createButton('Close', 'Close clipboard');
    const reportClipboardError = (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Clipboard access was denied';
      this.setStatus(session, 'error', message);
    };
    readLocal.onclick = async () => {
      try { textarea.value = await navigator.clipboard.readText(); }
      catch (error) { reportClipboardError(error); }
    };
    copyLocal.onclick = async () => {
      try { await navigator.clipboard.writeText(textarea.value); }
      catch (error) { reportClipboardError(error); }
    };
    send.onclick = () => { session.rfb?.clipboardPasteFrom(textarea.value); session.remoteClipboard = textarea.value; };
    close.onclick = () => overlay.remove();
    actions.append(readLocal, copyLocal, send, close);
    overlay.firstElementChild?.append(textarea, actions);
    session.elements.clipboardBadge.classList.remove('visible');
  }

  private showFormOverlay(
    session: VncSession,
    title: string,
    fields: string[],
    initial: Record<string, string>,
    callback: (values: VncCredentials | null) => void,
  ): void {
    const overlay = this.createOverlay(session, title);
    const panel = overlay.firstElementChild as HTMLElement;
    const inputs = new Map<string, HTMLInputElement>();
    for (const field of fields) {
      const label = document.createElement('label');
      label.textContent = field[0].toUpperCase() + field.slice(1);
      const input = document.createElement('input');
      input.className = 'widget-dialog-input';
      input.type = field === 'password' ? 'password' : 'text';
      input.value = initial[field] || '';
      stopWidgetDragPropagation(input);
      label.append(input);
      panel.append(label);
      inputs.set(field, input);
    }
    const actions = document.createElement('div');
    actions.className = 'vnc-panel-actions';
    const cancel = createButton('Cancel', 'Cancel authentication');
    const submit = createButton('Continue', 'Submit credentials');
    const finish = (result: VncCredentials | null) => { overlay.remove(); callback(result); };
    cancel.onclick = () => finish(null);
    submit.onclick = () => finish(Object.fromEntries(Array.from(inputs, ([name, input]) => [name, input.value])));
    actions.append(cancel, submit);
    panel.append(actions);
    inputs.values().next().value?.focus();
  }

  private createOverlay(session: VncSession, title: string): HTMLDivElement {
    session.elements.display.querySelector('.vnc-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'vnc-overlay';
    const panel = document.createElement('div');
    panel.className = 'vnc-panel';
    const heading = document.createElement('h4');
    heading.textContent = title;
    panel.append(heading);
    overlay.append(panel);
    session.elements.display.append(overlay);
    return overlay;
  }

  private sendKeyChord(session: VncSession, action: string): void {
    const rfb = session.rfb;
    const keys = KEY_ACTIONS[action]?.();
    if (!rfb || !keys) return;
    if (keys.length === 1) {
      rfb.sendKey(keys[0][0], keys[0][1]);
      return;
    }
    keys.forEach(([keysym, code]) => rfb.sendKey(keysym, code, true));
    [...keys].reverse().forEach(([keysym, code]) => rfb.sendKey(keysym, code, false));
  }

  private runPowerAction(session: VncSession, action: 'shutdown' | 'reboot' | 'reset'): void {
    if (!session.rfb?.capabilities.power) return;
    const label = action === 'reset' ? 'force reset' : action;
    if (!window.confirm(`Send ${label} to the remote machine?`)) return;
    if (action === 'shutdown') session.rfb.machineShutdown();
    if (action === 'reboot') session.rfb.machineReboot();
    if (action === 'reset') session.rfb.machineReset();
  }

  private downloadScreenshot(session: VncSession): void {
    session.rfb?.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `vnc-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }

  private scheduleReconnect(session: VncSession): void {
    if (!session.content.reconnectDelay || !this.isCurrent(session)) return;
    const delay = session.content.reconnectDelay;
    session.elements.status.textContent = `Reconnect in ${delay}s`;
    session.reconnectTimer = window.setTimeout(() => {
      if (this.isCurrent(session) && !session.manualDisconnect) void this.connect(session);
    }, delay * 1000);
  }

  private updateControls(session: VncSession): void {
    const connected = session.phase === 'connected';
    session.elements.connect.textContent = connected || session.phase === 'connecting' ? 'Disconnect' : 'Connect';
    session.elements.controls.forEach(button => { button.disabled = !connected; });
    const keySelect = session.elements.wrapper.querySelector('.vnc-toolbar .vnc-select') as HTMLSelectElement;
    keySelect.disabled = !connected || session.content.viewOnly;
    session.elements.power.disabled = !connected || !session.rfb?.capabilities.power;
    const viewOnly = session.elements.controls[4];
    viewOnly.disabled = !connected;
    viewOnly.title = session.content.viewOnly ? 'Enable remote input' : 'Enable view-only mode';
    viewOnly.classList.toggle('active', session.content.viewOnly);
  }

  private setStatus(session: VncSession, phase: ConnectionPhase, text: string): void {
    session.phase = phase;
    session.elements.status.className = `vnc-status-indicator ${phase}`;
    session.elements.status.textContent = text;
  }

  private clearReconnectTimer(session: VncSession): void {
    if (session.reconnectTimer !== undefined) window.clearTimeout(session.reconnectTimer);
    session.reconnectTimer = undefined;
  }

  private disconnectCurrent(session: VncSession): void {
    if (!this.isCurrent(session)) return;
    session.manualDisconnect = true;
    this.clearReconnectTimer(session);
    const rfb = session.rfb;
    session.rfb = undefined;
    try { rfb?.disconnect(); } catch { /* connection is already closed */ }
    session.elements.display.replaceChildren();
    session.elements.statusInfo.textContent = 'Ready';
    session.elements.clipboardBadge.classList.remove('visible');
    this.setStatus(session, 'disconnected', 'Disconnected');
    this.updateControls(session);
  }

  private disposeSession(widgetId: string, manual: boolean): void {
    const session = this.sessions.get(widgetId);
    if (session) {
      session.manualDisconnect = manual;
      this.clearReconnectTimer(session);
      this.sessions.delete(widgetId);
      try { session.rfb?.disconnect(); } catch { /* connection is already closed */ }
    }
  }

  private isCurrent(session: VncSession): boolean {
    return this.sessions.get(session.widget.id) === session;
  }

  private isActiveRfb(session: VncSession, rfb: RfbClient): boolean {
    return this.isCurrent(session) && session.rfb === rfb;
  }

  private async renderConfigScreen(container: HTMLElement, widget: Widget): Promise<void> {
    const screen = document.createElement('div');
    screen.className = 'widget-config-screen padded';
    screen.innerHTML = '<div class="widget-config-icon"><i class="fas fa-desktop"></i></div><div class="widget-config-description">Configure VNC Connection</div>';
    const select = document.createElement('select');
    select.className = 'widget-dialog-input';
    select.append(new Option('Select VNC credential…', ''));
    for (const credential of await this.loadCredentials()) select.append(new Option(`${credential.name} (${credential.service_type})`, String(credential.id)));
    const button = createButton('Use credential', 'Configure VNC');
    button.classList.add('btn', 'btn-primary', 'btn-full');
    button.disabled = true;
    select.onchange = () => { button.disabled = !select.value; };
    button.onclick = () => dispatchWidgetUpdate(widget.id, { ...DEFAULT_CONTENT, credentialId: Number(select.value) });
    stopWidgetDragPropagation(select);
    screen.append(select, button);
    container.replaceChildren(screen);
  }

  private async showConfigDialog(widget: Widget): Promise<void> {
    const content = normalizeContent(widget.content as Partial<VncContent>);
    const credentials = await this.loadCredentials();
    const overlay = document.createElement('div');
    overlay.className = 'widget-overlay';
    const dialog = document.createElement('div');
    dialog.className = 'widget-dialog vnc-config-dialog';
    dialog.innerHTML = `
      <h3 class="widget-dialog-title">Configure VNC</h3>
      <div class="vnc-settings-grid">
        <div class="widget-dialog-field"><label class="widget-dialog-label">VNC credential</label><select data-field="credentialId" class="widget-dialog-input"><option value="">Select credential…</option>${credentials.map(c => `<option value="${c.id}" ${c.id === content.credentialId ? 'selected' : ''}>${escapeHtml(c.name)} (${escapeHtml(c.service_type)})</option>`).join('')}</select></div>
        <div class="widget-dialog-field"><label class="widget-dialog-label">Scaling</label><select data-field="scaleMode" class="widget-dialog-input"><option value="local" ${content.scaleMode === 'local' ? 'selected' : ''}>Scale locally</option><option value="remote" ${content.scaleMode === 'remote' ? 'selected' : ''}>Resize remote session</option><option value="none" ${content.scaleMode === 'none' ? 'selected' : ''}>1:1</option></select></div>
        <label><input type="checkbox" data-field="viewOnly" ${content.viewOnly ? 'checked' : ''}> View only</label>
        <label><input type="checkbox" data-field="shared" ${content.shared ? 'checked' : ''}> Shared session</label>
        <label><input type="checkbox" data-field="clipToWindow" ${content.clipToWindow ? 'checked' : ''}> Clip to widget</label>
        <label><input type="checkbox" data-field="dragViewport" ${content.dragViewport ? 'checked' : ''}> Drag clipped viewport</label>
        <label><input type="checkbox" data-field="focusOnClick" ${content.focusOnClick ? 'checked' : ''}> Focus keyboard on click</label>
        <label><input type="checkbox" data-field="autoConnect" ${content.autoConnect ? 'checked' : ''}> Auto-connect</label>
        <div class="widget-dialog-field"><label class="widget-dialog-label">Quality: <span data-value="quality">${content.qualityLevel}</span></label><input type="range" min="0" max="9" value="${content.qualityLevel}" data-field="qualityLevel"></div>
        <div class="widget-dialog-field"><label class="widget-dialog-label">Compression: <span data-value="compression">${content.compressionLevel}</span></label><input type="range" min="0" max="9" value="${content.compressionLevel}" data-field="compressionLevel"></div>
        <div class="widget-dialog-field"><label class="widget-dialog-label">Reconnect delay (seconds)</label><input type="number" min="0" max="300" value="${content.reconnectDelay}" data-field="reconnectDelay" class="widget-dialog-input"></div>
        <div class="widget-dialog-field"><label class="widget-dialog-label">Display background</label><input type="color" value="${/^#[0-9a-f]{6}$/i.test(content.background) ? content.background : '#000000'}" data-field="background" class="widget-dialog-input"></div>
      </div>
      <div class="widget-dialog-buttons"><button data-action="cancel" class="btn btn-small btn-secondary">Cancel</button><button data-action="save" class="btn btn-small btn-primary">Save</button></div>`;
    overlay.append(dialog);
    document.body.append(overlay);
    stopAllDragPropagation(dialog);

    const quality = dialog.querySelector('[data-field="qualityLevel"]') as HTMLInputElement;
    const compression = dialog.querySelector('[data-field="compressionLevel"]') as HTMLInputElement;
    quality.oninput = () => { (dialog.querySelector('[data-value="quality"]') as HTMLElement).textContent = quality.value; };
    compression.oninput = () => { (dialog.querySelector('[data-value="compression"]') as HTMLElement).textContent = compression.value; };
    const close = () => overlay.remove();
    (dialog.querySelector('[data-action="cancel"]') as HTMLButtonElement).onclick = close;
    overlay.onclick = event => { if (event.target === overlay) close(); };
    (dialog.querySelector('[data-action="save"]') as HTMLButtonElement).onclick = () => {
      const get = <T extends HTMLElement>(field: string) => dialog.querySelector(`[data-field="${field}"]`) as T;
      const credentialId = Number(get<HTMLSelectElement>('credentialId').value) || undefined;
      if (!credentialId) return;
      dispatchWidgetUpdate(widget.id, {
        credentialId,
        scaleMode: get<HTMLSelectElement>('scaleMode').value as ScaleMode,
        viewOnly: get<HTMLInputElement>('viewOnly').checked,
        shared: get<HTMLInputElement>('shared').checked,
        clipToWindow: get<HTMLInputElement>('clipToWindow').checked,
        dragViewport: get<HTMLInputElement>('dragViewport').checked,
        focusOnClick: get<HTMLInputElement>('focusOnClick').checked,
        autoConnect: get<HTMLInputElement>('autoConnect').checked,
        qualityLevel: Number(quality.value),
        compressionLevel: Number(compression.value),
        reconnectDelay: Number(get<HTMLInputElement>('reconnectDelay').value),
        background: get<HTMLInputElement>('background').value,
      });
      close();
    };
  }

  private async loadCredentials(): Promise<Credential[]> {
    try {
      return (await credentialsService.getAll()).filter(credential => ['vnc', 'custom', 'basic'].includes(credential.service_type));
    } catch (error) {
      console.warn('Could not load VNC credentials:', error);
      return [];
    }
  }

  getHeaderButtons(): HTMLElement[] {
    return [];
  }

  destroy(): void {
    for (const widgetId of [...this.sessions.keys()]) this.disposeSession(widgetId, true);
  }
}

export const widget = {
  type: 'vnc',
  name: 'VNC Remote Desktop',
  icon: '<i class="fas fa-desktop"></i>',
  description: 'Full noVNC remote desktop client with clipboard, keys, screenshots, power controls, and reconnect',
  renderer: new VncWidgetRenderer(),
  defaultSize: { w: 560, h: 420 },
  defaultContent: { ...DEFAULT_CONTENT },
  hasSettings: true,
  allowedFields: [
    'credentialId', 'viewOnly', 'scaleMode', 'clipToWindow', 'dragViewport',
    'focusOnClick', 'shared', 'qualityLevel', 'compressionLevel', 'autoConnect',
    'reconnectDelay', 'background',
  ],
};
