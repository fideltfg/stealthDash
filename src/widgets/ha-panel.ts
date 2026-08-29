import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';
import { renderConfigPrompt } from '../utils/widgetRendering';
import { dispatchWidgetUpdate } from '../utils/dom';

interface HaPanelContent {
  url: string;
  scale?: number; // percentage, e.g. 75 = 75%
}

const SCALE_STEP = 5;
const SCALE_MIN  = 25;
const SCALE_MAX  = 150;

/** Returns the URL of the nginx HA proxy (port 3003, same host as the Dashboard). */
function getHaProxyUrl(): string {
  return `${window.location.protocol}//${window.location.hostname}:3003`;
}

/** Apply scale to the iframe inside a widget element. */
function applyScale(widgetId: string, scale: number): void {
  const wrapper = document.querySelector(`#widget-${widgetId} .ha-panel-widget`) as HTMLElement | null;
  const iframe  = wrapper?.querySelector('iframe') as HTMLIFrameElement | null;
  if (!wrapper || !iframe) return;
  const s = scale / 100;
  // Expand iframe beyond 100% then scale it back down so it fills the container.
  iframe.style.width          = `${100 / s}%`;
  iframe.style.height         = `${100 / s}%`;
  iframe.style.transform      = `scale(${s})`;
  iframe.style.transformOrigin = 'top left';
}

export class HaPanelRenderer implements WidgetRenderer {
  configure(widget: Widget): void {
    const content  = widget.content as HaPanelContent;
    const proxyUrl = getHaProxyUrl();
    const scale    = content.scale ?? 100;

    const overlay = document.createElement('div');
    overlay.className = 'widget-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'widget-dialog';

    dialog.innerHTML = `
      <h3 class="widget-dialog-title">Configure Home Assistant Panel</h3>
      <div class="widget-dialog-field">
        <label class="widget-dialog-label">Home Assistant URL</label>
        <input type="text" id="ha-panel-url" value="${content.url || ''}"
               placeholder="http://homeassistant.local:8123" class="widget-dialog-input" />
        <small style="color:var(--muted);font-size:11px;margin-top:4px;display:block">
          Set <code>HA_PANEL_URL</code> to this URL in your <code>.env</code> file,
          then restart the stack. The widget embeds via the proxy at
          <strong>${proxyUrl}</strong>.
        </small>
      </div>
      <div class="widget-dialog-field">
        <label class="widget-dialog-label">
          Zoom &nbsp;<span id="ha-scale-display">${scale}%</span>
        </label>
        <input type="range" id="ha-scale" min="${SCALE_MIN}" max="${SCALE_MAX}"
               step="${SCALE_STEP}" value="${scale}"
               style="width:100%;accent-color:var(--accent);" />
      </div>
      <div class="widget-dialog-buttons">
        <button type="button" id="cancel-btn" class="btn btn-small btn-secondary">Cancel</button>
        <button type="button" id="save-btn"   class="btn btn-small btn-primary">Save</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const urlInput     = dialog.querySelector('#ha-panel-url')     as HTMLInputElement;
    const scaleSlider  = dialog.querySelector('#ha-scale')         as HTMLInputElement;
    const scaleDisplay = dialog.querySelector('#ha-scale-display') as HTMLSpanElement;
    const saveBtn      = dialog.querySelector('#save-btn')         as HTMLButtonElement;
    const cancelBtn    = dialog.querySelector('#cancel-btn')       as HTMLButtonElement;

    scaleSlider.oninput = () => {
      scaleDisplay.textContent = `${scaleSlider.value}%`;
      // Live-preview the scale while dragging
      applyScale(widget.id, Number(scaleSlider.value));
    };

    const close = () => overlay.remove();
    cancelBtn.onclick = close;
    overlay.onclick = (e) => e.target === overlay && close();

    saveBtn.onclick = () => {
      const url = urlInput.value.trim();
      if (url) {
        dispatchWidgetUpdate(widget.id, { url, scale: Number(scaleSlider.value) });
        close();
      }
    };
  }

  getHeaderButtons(widget: Widget): HTMLElement[] {
    const content = widget.content as HaPanelContent;
    if (!content.url) return [];

    const refreshBtn = document.createElement('button');
    refreshBtn.innerHTML = '<i class="fas fa-rotate-right"></i>';
    refreshBtn.title = 'Reload';
    refreshBtn.onclick = () => {
      const iframe = document.querySelector(`#widget-${widget.id} iframe`) as HTMLIFrameElement | null;
      if (iframe) iframe.src = iframe.src;
    };

    return [refreshBtn];
  }

  render(container: HTMLElement, widget: Widget): void {
    const content = widget.content as HaPanelContent;
    const div = document.createElement('div');
    div.className = 'ha-panel-widget';
    div.style.cssText = 'width:100%;height:100%;overflow:hidden;position:relative;';

    if (content.url) {
      const scale = (content.scale ?? 100) / 100;
      const iframe = document.createElement('iframe');
      iframe.style.cssText = `width:${100/scale}%;height:${100/scale}%;border:none;transform:scale(${scale});transform-origin:top left;`;
      iframe.title = 'Home Assistant';
      iframe.src   = getHaProxyUrl();

      iframe.sandbox.add('allow-same-origin');
      iframe.sandbox.add('allow-scripts');
      iframe.sandbox.add('allow-forms');
      iframe.sandbox.add('allow-popups');

      div.appendChild(iframe);
    } else {
      this.showEmptyState(container, widget);
      return;
    }

    container.appendChild(div);
  }

  private showEmptyState(container: HTMLElement, widget: Widget): void {
    const btn = renderConfigPrompt(container, '<i class="fas fa-home"></i>',
      'Home Assistant Panel', 'Configure your Home Assistant URL');
    btn.addEventListener('click', () => this.configure(widget));
  }
}

export const widget = {
  type: 'ha-panel',
  name: 'Home Assistant Panel',
  icon: '<i class="fas fa-home"></i>',
  description: 'Embed the Home Assistant web interface',
  renderer: new HaPanelRenderer(),
  defaultSize: { w: 600, h: 500 },
  defaultContent: { url: '', scale: 100 },
  allowedFields: ['url', 'scale']
};
