import type { Widget } from '../../types';
import type { WidgetRenderer } from './base';

export class ImageWidgetRenderer implements WidgetRenderer {
  render(container: HTMLElement, widget: Widget): void {
    const content = widget.content as { src: string; objectFit: string; alt?: string };
    const div = document.createElement('div');
    div.className = 'image-widget';
    
    if (content.src) {
      const img = document.createElement('img');
      img.src = content.src;
      img.alt = content.alt || 'Widget image';
      img.style.objectFit = content.objectFit;
      div.appendChild(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.textContent = '🖼️ Click to add image URL';
      placeholder.style.color = 'var(--muted)';
      placeholder.style.cursor = 'pointer';
      placeholder.addEventListener('click', () => {
        const url = prompt('Enter image URL:');
        if (url) {
          const event = new CustomEvent('widget-update', {
            detail: { id: widget.id, content: { src: url, objectFit: 'contain' } }
          });
          document.dispatchEvent(event);
        }
      });
      div.appendChild(placeholder);
    }
    
    container.appendChild(div);
  }
}
