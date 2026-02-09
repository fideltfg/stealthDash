import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';

export class EmbedWidgetRenderer implements WidgetRenderer {
  configure(widget: Widget): void {
    const content = widget.content as { url: string; sandbox?: string[] };
    
    const overlay = document.createElement('div');
    overlay.className = 'widget-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'widget-dialog';

    dialog.innerHTML = `
      <h3 class="mb-4"><i class="fas fa-code me-2"></i>Configure Embed</h3>
      <div class="mb-4">
        <label class="form-label">URL to Embed</label>
        <input type="text" id="embed-url" value="${content.url || ''}" placeholder="https://example.com" class="form-control" />
      </div>
      <div class="d-flex gap-2 justify-content-end">
        <button id="cancel-btn" class="btn btn-secondary">Cancel</button>
        <button id="save-btn" class="btn btn-success">Save</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const urlInput = dialog.querySelector('#embed-url') as HTMLInputElement;
    const saveBtn = dialog.querySelector('#save-btn') as HTMLButtonElement;
    const cancelBtn = dialog.querySelector('#cancel-btn') as HTMLButtonElement;

    const close = () => overlay.remove();

    cancelBtn.onclick = close;
    overlay.onclick = (e) => e.target === overlay && close();

    saveBtn.onclick = () => {
      const url = urlInput.value.trim();
      if (url) {
        const event = new CustomEvent('widget-update', {
          detail: {
            id: widget.id,
            content: { url, sandbox: [] }
          }
        });
        document.dispatchEvent(event);
        close();
      }
    };
  }

  render(container: HTMLElement, widget: Widget): void {
    const content = widget.content as { url: string; sandbox?: string[] };
    const div = document.createElement('div');
    div.className = 'embed-widget';
    
    if (content.url) {
      const iframe = document.createElement('iframe');
      iframe.src = content.url;
      iframe.sandbox.add('allow-same-origin');
      iframe.sandbox.add('allow-scripts');
      if (content.sandbox) {
        content.sandbox.forEach(perm => iframe.sandbox.add(perm));
      }
      div.appendChild(iframe);
    } else {
      this.renderConfigScreen(div, widget);
    }
    
    container.appendChild(div);
  }

  private renderConfigScreen(div: HTMLElement, widget: Widget): void {
    const inputContainer = document.createElement('div');
    inputContainer.className = 'widget-config-screen padded';
    
    const icon = document.createElement('div');
    icon.innerHTML = '<i class="fas fa-globe"></i>';
    icon.className = 'widget-config-icon';
    
    const label = document.createElement('div');
    label.textContent = 'Enter URL to embed';
    label.className = 'embed-config-label';
    
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.placeholder = 'https://example.com';
    urlInput.className = 'embed-config-input';
    
    const button = document.createElement('button');
    button.textContent = 'Load URL';
    button.className = 'embed-config-button';
    button.disabled = true;
    
    const isValidUrl = (url: string): boolean => {
      try {
        const urlObj = new URL(url);
        return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
      } catch {
        return false;
      }
    };
    
    const updateButtonState = () => {
      const url = urlInput.value.trim();
      if (isValidUrl(url)) {
        button.disabled = false;
      } else {
        button.disabled = true;
      }
    };
    
    const loadUrl = () => {
      const url = urlInput.value.trim();
      if (isValidUrl(url)) {
        const event = new CustomEvent('widget-update', {
          detail: { id: widget.id, content: { url: url, sandbox: [] } }
        });
        document.dispatchEvent(event);
      }
    };
    
    button.addEventListener('click', loadUrl);
    urlInput.addEventListener('input', updateButtonState);
    urlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !button.disabled) {
        loadUrl();
      }
    });
    
    urlInput.addEventListener('pointerdown', (e) => e.stopPropagation());
    urlInput.addEventListener('keydown', (e) => e.stopPropagation());
    urlInput.addEventListener('keyup', (e) => e.stopPropagation());
    button.addEventListener('pointerdown', (e) => e.stopPropagation());
    
    inputContainer.appendChild(icon);
    inputContainer.appendChild(label);
    inputContainer.appendChild(urlInput);
    inputContainer.appendChild(button);
    div.appendChild(inputContainer);
  }
}

export const widget = {
  type: 'embed',
  title: 'Embed',
  name: 'Embed',
  icon: '<i class="fas fa-globe"></i>',
  description: 'Embed websites via iframe',
  renderer: new EmbedWidgetRenderer(),
  defaultSize: { w: 600, h: 400 },
  defaultContent: { url: '' }
};
