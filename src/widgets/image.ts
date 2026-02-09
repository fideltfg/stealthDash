import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';

export class ImageWidgetRenderer implements WidgetRenderer {
  configure(widget: Widget): void {
    const content = widget.content as { src: string; objectFit: string; alt?: string };
    
    const overlay = document.createElement('div');
    overlay.className = 'widget-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'widget-dialog';

    dialog.innerHTML = `
      <h3 class="mb-4"><i class="fas fa-image me-2"></i>Configure Image</h3>
      <div class="mb-3">
        <label class="form-label">Image URL</label>
        <input type="text" id="image-url" value="${content.src || ''}" placeholder="https://example.com/image.jpg"
          class="form-control" />
      </div>
      <div class="mb-3">
        <label class="form-label">Alt Text (optional)</label>
        <input type="text" id="image-alt" value="${content.alt || ''}" placeholder="Description of image"
          class="form-control" />
      </div>
      <div class="mb-4">
        <label class="form-label">Object Fit</label>
        <select id="image-fit" class="form-select">
          <option value="contain" ${content.objectFit === 'contain' ? 'selected' : ''}>Contain (fit inside)</option>
          <option value="cover" ${content.objectFit === 'cover' ? 'selected' : ''}>Cover (fill space)</option>
          <option value="fill" ${content.objectFit === 'fill' ? 'selected' : ''}>Fill (stretch)</option>
          <option value="none" ${content.objectFit === 'none' ? 'selected' : ''}>None (original size)</option>
        </select>
      </div>
      <div class="d-flex gap-2 justify-content-end">
        <button id="cancel-btn" class="btn btn-secondary">Cancel</button>
        <button id="save-btn" class="btn btn-success">Save</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const urlInput = dialog.querySelector('#image-url') as HTMLInputElement;
    const altInput = dialog.querySelector('#image-alt') as HTMLInputElement;
    const fitSelect = dialog.querySelector('#image-fit') as HTMLSelectElement;
    const saveBtn = dialog.querySelector('#save-btn') as HTMLButtonElement;
    const cancelBtn = dialog.querySelector('#cancel-btn') as HTMLButtonElement;

    // Prevent arrow keys from moving the widget
    urlInput.addEventListener('keydown', (e) => e.stopPropagation());
    urlInput.addEventListener('keyup', (e) => e.stopPropagation());
    altInput.addEventListener('keydown', (e) => e.stopPropagation());
    altInput.addEventListener('keyup', (e) => e.stopPropagation());
    fitSelect.addEventListener('keydown', (e) => e.stopPropagation());
    fitSelect.addEventListener('keyup', (e) => e.stopPropagation());

    const close = () => overlay.remove();

    cancelBtn.onclick = close;
    overlay.onclick = (e) => e.target === overlay && close();

    saveBtn.onclick = () => {
      const event = new CustomEvent('widget-update', {
        detail: {
          id: widget.id,
          content: {
            src: urlInput.value,
            alt: altInput.value,
            objectFit: fitSelect.value
          }
        }
      });
      document.dispatchEvent(event);
      close();
    };
  }

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
      placeholder.className = 'image-placeholder';
      placeholder.innerHTML = '<i class="fas fa-image"></i> Click to configure image';
      placeholder.addEventListener('click', () => {
        this.configure(widget);
      });
      div.appendChild(placeholder);
    }
    
    container.appendChild(div);
  }
}

export const widget = {
  type: 'image',
  title: 'Image',
  name: 'Image',
  icon: '<i class="fas fa-image"></i>',
  description: 'Display images from URLs',
  renderer: new ImageWidgetRenderer(),
  defaultSize: { w: 400, h: 400 },
  defaultContent: { src: '', objectFit: 'contain' }
};
