import type { Widget } from '../../types';
import type { WidgetRenderer } from './base';

export class TextWidgetRenderer implements WidgetRenderer {
  render(container: HTMLElement, widget: Widget): void {
    const content = widget.content as { markdown: string };
    const textarea = document.createElement('textarea');
    textarea.className = 'text-widget editable';
    textarea.setAttribute('role', 'textbox');
    textarea.setAttribute('aria-multiline', 'true');
    textarea.placeholder = 'Type here... (Markdown supported)';
    textarea.value = content.markdown || '';
    textarea.style.width = '100%';
    textarea.style.height = '100%';
    textarea.style.border = 'none';
    textarea.style.outline = 'none';
    textarea.style.resize = 'none';
    textarea.style.fontFamily = 'inherit';
    textarea.style.fontSize = '14px';
    textarea.style.lineHeight = '1.6';
    textarea.style.background = 'transparent';
    textarea.style.color = 'inherit';
    textarea.style.padding = '0';
    
    textarea.addEventListener('input', () => {
      const event = new CustomEvent('widget-update', {
        detail: { id: widget.id, content: { markdown: textarea.value } }
      });
      document.dispatchEvent(event);
    });
    
    textarea.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });
    
    container.appendChild(textarea);
  }
}
