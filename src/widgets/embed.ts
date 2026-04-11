import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';
import { renderConfigPrompt } from '../utils/widgetRendering';
import { getPingServerUrl } from '../utils/api';
import { dispatchWidgetUpdate } from '../utils/dom';

export class EmbedWidgetRenderer implements WidgetRenderer {
  configure(widget: Widget): void {
    const content = widget.content as { url: string; sandbox?: string[]; useProxy?: boolean };
    
    const overlay = document.createElement('div');
    overlay.className = 'widget-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'widget-dialog';

    dialog.innerHTML = `
      <h3 class="widget-dialog-title">Configure Embed</h3>
      <div class="widget-dialog-field">
        <label class="widget-dialog-label">URL to Embed</label>
        <input type="text" id="embed-url" value="${content.url || ''}" placeholder="https://example.com" class="widget-dialog-input" />
      </div>
      <div id="embed-proxy-row"></div>
      <div class="widget-dialog-buttons">
        <button id="cancel-btn" class="btn btn-small btn-secondary">Cancel</button>
        <button id="save-btn" class="btn btn-small btn-primary">Save</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Build checkbox row programmatically so click events work reliably
    const proxyRow = dialog.querySelector('#embed-proxy-row') as HTMLDivElement;

    const proxyLabel = document.createElement('label');
    proxyLabel.className = 'widget-checkbox-label';
    proxyLabel.htmlFor = 'embed-proxy';

    const proxyCheckbox = document.createElement('input');
    proxyCheckbox.type = 'checkbox';
    proxyCheckbox.id = 'embed-proxy';
    proxyCheckbox.checked = !!content.useProxy;

    const labelText = document.createTextNode('Use proxy (bypass X-Frame-Options)');

    proxyLabel.appendChild(proxyCheckbox);
    proxyLabel.appendChild(labelText);
    proxyRow.appendChild(proxyLabel);

    const urlInput = dialog.querySelector('#embed-url') as HTMLInputElement;
    const saveBtn = dialog.querySelector('#save-btn') as HTMLButtonElement;
    const cancelBtn = dialog.querySelector('#cancel-btn') as HTMLButtonElement;

    const close = () => overlay.remove();

    cancelBtn.onclick = close;
    overlay.onclick = (e) => e.target === overlay && close();

    saveBtn.onclick = () => {
      const url = urlInput.value.trim();
      if (url) {
        dispatchWidgetUpdate(widget.id, { url, sandbox: [], useProxy: proxyCheckbox.checked });
        close();
      }
    };
  }

  getHeaderButtons(widget: Widget): HTMLElement[] {
    const content = widget.content as { url: string; sandbox?: string[]; useProxy?: boolean };
    if (!content.url) return [];

    const refreshBtn = document.createElement('button');
    refreshBtn.innerHTML = '<i class="fas fa-rotate-right"></i>';
    refreshBtn.title = 'Reload';
    refreshBtn.onclick = () => {
      const iframe = document.querySelector(`#widget-${widget.id} iframe`) as HTMLIFrameElement | null;
      if (iframe) {
        iframe.src = iframe.src;
      }
    };
    return [refreshBtn];
  }

  render(container: HTMLElement, widget: Widget): void {
    const content = widget.content as { url: string; sandbox?: string[]; useProxy?: boolean };
    const div = document.createElement('div');
    div.className = 'embed-widget';
    
    if (content.url) {
      const iframe = document.createElement('iframe');
      if (content.useProxy) {
        iframe.src = `${getPingServerUrl()}/embed-proxy?url=${encodeURIComponent(content.url)}`;
      } else {
        iframe.src = content.url;
      }
      iframe.sandbox.add('allow-same-origin');
      iframe.sandbox.add('allow-scripts');
      if (content.sandbox) {
        content.sandbox.forEach(perm => iframe.sandbox.add(perm));
      }
      div.appendChild(iframe);
    } else {
      this.showEmptyState(container, widget);
    }
    
    container.appendChild(div);
  }

  private showEmptyState(container: HTMLElement, widget: Widget): void {
    const btn = renderConfigPrompt(container, '<i class="fas fa-globe"></i>', 'Embed', 'Configure URL to embed');
    btn.addEventListener('click', () => this.configure(widget));
  }

}

export const widget = {
  type: 'embed',
  name: 'Embed',
  icon: '<i class="fas fa-globe"></i>',
  description: 'Embed websites via iframe',
  renderer: new EmbedWidgetRenderer(),
  defaultSize: { w: 400, h: 300 },
  defaultContent: { url: '' },
  allowedFields: ['url', 'sandbox']
};
