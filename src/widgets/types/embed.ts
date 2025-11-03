import type { Widget } from '../../types';
import type { WidgetRenderer } from './base';

export class EmbedWidgetRenderer implements WidgetRenderer {
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
