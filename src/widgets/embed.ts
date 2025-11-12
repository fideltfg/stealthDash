import type { Widget } from '../types';
import type { WidgetRenderer } from './base';

export class EmbedWidgetRenderer implements WidgetRenderer {
  configure(widget: Widget): void {
    const content = widget.content as { url: string; sandbox?: string[] };
    
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
      <h3 style="margin: 0 0 20px 0; color: var(--text);">Configure Embed</h3>
      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 8px; color: var(--text); font-size: 14px;">URL to Embed</label>
        <input type="text" id="embed-url" value="${content.url || ''}" placeholder="https://example.com"
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
    div.style.height = '100%';
    div.style.display = 'flex';
    div.style.flexDirection = 'column';
    
    if (content.url) {
      const iframe = document.createElement('iframe');
      iframe.src = content.url;
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = 'none';
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
    inputContainer.style.display = 'flex';
    inputContainer.style.flexDirection = 'column';
    inputContainer.style.alignItems = 'center';
    inputContainer.style.justifyContent = 'center';
    inputContainer.style.height = '100%';
    inputContainer.style.gap = '12px';
    
    const icon = document.createElement('div');
    icon.textContent = '🌐';
    icon.style.fontSize = '48px';
    
    const label = document.createElement('div');
    label.textContent = 'Enter URL to embed';
    label.style.color = 'var(--muted)';
    label.style.marginBottom = '8px';
    
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.placeholder = 'https://example.com';
    urlInput.style.width = '80%';
    urlInput.style.padding = '8px 12px';
    urlInput.style.border = '2px solid var(--border)';
    urlInput.style.borderRadius = '6px';
    urlInput.style.fontFamily = 'inherit';
    urlInput.style.fontSize = '14px';
    urlInput.style.background = 'var(--bg)';
    urlInput.style.color = 'var(--text)';
    
    const button = document.createElement('button');
    button.textContent = 'Load URL';
    button.style.padding = '8px 20px';
    button.style.background = 'var(--accent)';
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.borderRadius = '6px';
    button.style.cursor = 'pointer';
    button.style.fontSize = '14px';
    button.style.fontWeight = '500';
    button.disabled = true;
    button.style.opacity = '0.5';
    button.style.cursor = 'not-allowed';
    
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
        button.style.opacity = '1';
        button.style.cursor = 'pointer';
      } else {
        button.disabled = true;
        button.style.opacity = '0.5';
        button.style.cursor = 'not-allowed';
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
  name: 'Embed',
  icon: '🌐',
  description: 'Embed websites via iframe',
  renderer: new EmbedWidgetRenderer(),
  defaultSize: { w: 600, h: 400 },
  defaultContent: { url: '' }
};
