import type { Widget } from '../types/types';
import type { WidgetRenderer, WidgetPlugin } from '../types/base-widget';

export class TextWidgetRenderer implements WidgetRenderer {
  render(container: HTMLElement, widget: Widget): void {
    const content = widget.content as { markdown: string };
    const textarea = document.createElement('textarea');
    textarea.className = 'text-widget editable';
    textarea.setAttribute('role', 'textbox');
    textarea.setAttribute('aria-multiline', 'true');
    textarea.placeholder = 'Type here... (Markdown supported)';
    textarea.value = content.markdown || '';
    
    textarea.addEventListener('input', () => {
      const event = new CustomEvent('widget-update', {
        detail: { id: widget.id, content: { markdown: textarea.value } }
      });
      document.dispatchEvent(event);
    });
    
    textarea.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });
    textarea.addEventListener('keydown', (e) => e.stopPropagation());
    textarea.addEventListener('keyup', (e) => e.stopPropagation());
    
    container.appendChild(textarea);
  }
}

// Plugin configuration
export const widget: WidgetPlugin = {
  type: 'text',
  name: 'Text',
  icon: '<i class="fas fa-file-alt"></i>',
  description: 'Simple text editor with markdown support',
  renderer: new TextWidgetRenderer(),
  defaultSize: { w: 400, h: 300 },
  defaultContent: { markdown: '' }
};
