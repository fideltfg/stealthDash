import type { Widget } from '../types';
import type { WidgetRenderer } from './base';

export class ImageWidgetRenderer implements WidgetRenderer {
  configure(widget: Widget): void {
    const content = widget.content as { src: string; objectFit: string; alt?: string };
    
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
      <h3 style="margin: 0 0 20px 0; color: var(--text);">Configure Image</h3>
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; color: var(--text); font-size: 14px;">Image URL</label>
        <input type="text" id="image-url" value="${content.src || ''}" placeholder="https://example.com/image.jpg"
          style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text);" />
      </div>
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; color: var(--text); font-size: 14px;">Alt Text (optional)</label>
        <input type="text" id="image-alt" value="${content.alt || ''}" placeholder="Description of image"
          style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text);" />
      </div>
      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 8px; color: var(--text); font-size: 14px;">Object Fit</label>
        <select id="image-fit" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text);">
          <option value="contain" ${content.objectFit === 'contain' ? 'selected' : ''}>Contain (fit inside)</option>
          <option value="cover" ${content.objectFit === 'cover' ? 'selected' : ''}>Cover (fill space)</option>
          <option value="fill" ${content.objectFit === 'fill' ? 'selected' : ''}>Fill (stretch)</option>
          <option value="none" ${content.objectFit === 'none' ? 'selected' : ''}>None (original size)</option>
        </select>
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

    const urlInput = dialog.querySelector('#image-url') as HTMLInputElement;
    const altInput = dialog.querySelector('#image-alt') as HTMLInputElement;
    const fitSelect = dialog.querySelector('#image-fit') as HTMLSelectElement;
    const saveBtn = dialog.querySelector('#save-btn') as HTMLButtonElement;
    const cancelBtn = dialog.querySelector('#cancel-btn') as HTMLButtonElement;

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
      placeholder.textContent = '🖼️ Click to configure image';
      placeholder.style.color = 'var(--muted)';
      placeholder.style.cursor = 'pointer';
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
  name: 'Image',
  icon: '🖼️',
  description: 'Display images from URLs',
  renderer: new ImageWidgetRenderer(),
  defaultSize: { w: 400, h: 400 },
  defaultContent: { src: '', objectFit: 'contain' }
};
