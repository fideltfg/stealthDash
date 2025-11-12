import type { Widget } from '../types';
import type { WidgetRenderer } from './base';

export class DataWidgetRenderer implements WidgetRenderer {
  render(container: HTMLElement, widget: Widget): void {
    const content = widget.content as { json: unknown };
    const div = document.createElement('div');
    div.className = 'data-widget';
    div.style.height = '100%';
    div.style.display = 'flex';
    div.style.flexDirection = 'column';
    
    const textarea = document.createElement('textarea');
    textarea.className = 'data-input';
    textarea.placeholder = 'Paste JSON data here...';
    textarea.style.width = '100%';
    textarea.style.flex = '1';
    textarea.style.border = 'none';
    textarea.style.outline = 'none';
    textarea.style.resize = 'none';
    textarea.style.fontFamily = "'Courier New', monospace";
    textarea.style.fontSize = '12px';
    textarea.style.background = 'transparent';
    textarea.style.color = 'inherit';
    textarea.style.padding = '0';
    
    try {
      textarea.value = JSON.stringify(content.json || { example: 'data', info: 'Edit this JSON' }, null, 2);
    } catch (e) {
      textarea.value = '{\n  "example": "data"\n}';
    }
    
    let updateTimeout: number;
    textarea.addEventListener('input', () => {
      clearTimeout(updateTimeout);
      updateTimeout = window.setTimeout(() => {
        try {
          const parsed = JSON.parse(textarea.value);
          textarea.style.borderLeft = '3px solid var(--accent)';
          const event = new CustomEvent('widget-update', {
            detail: { id: widget.id, content: { json: parsed } }
          });
          document.dispatchEvent(event);
        } catch (e) {
          textarea.style.borderLeft = '3px solid #ff4444';
        }
      }, 500);
    });
    
    textarea.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });
    
    div.appendChild(textarea);
    container.appendChild(div);
  }
}

export const widget = {
  type: 'data',
  name: 'Data',
  icon: '📊',
  description: 'Display JSON data',
  renderer: new DataWidgetRenderer(),
  defaultSize: { w: 400, h: 300 },
  defaultContent: { json: {} }
};
