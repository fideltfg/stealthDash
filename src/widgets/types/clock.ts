import type { Widget } from '../../types';
import type { WidgetRenderer } from './base';
import { TIMEZONES } from './timezones';

export class ClockWidgetRenderer implements WidgetRenderer {
  configure(widget: Widget): void {
    const content = widget.content as { timezone: string; format24h?: boolean; showTimezone?: boolean };
    
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
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `;

    dialog.innerHTML = `
      <h3 style="margin: 0 0 20px 0; color: var(--text);">Configure Clock</h3>
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; color: var(--text); font-size: 14px;">Timezone</label>
        <select id="clock-timezone" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text);">
          <option value="">-- Select Timezone --</option>
          ${TIMEZONES.map(tz => `<option value="${tz}" ${content.timezone === tz ? 'selected' : ''}>${tz.replace(/_/g, ' ')}</option>`).join('')}
        </select>
      </div>
      <div style="margin-bottom: 16px;">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
          <input type="checkbox" id="clock-24h" ${content.format24h ? 'checked' : ''}
            style="width: 18px; height: 18px; cursor: pointer;" />
          <span style="color: var(--text); font-size: 14px;">Use 24-hour format</span>
        </label>
      </div>
      <div style="margin-bottom: 20px;">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
          <input type="checkbox" id="clock-show-tz" ${content.showTimezone !== false ? 'checked' : ''}
            style="width: 18px; height: 18px; cursor: pointer;" />
          <span style="color: var(--text); font-size: 14px;">Show timezone</span>
        </label>
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

    const tzSelect = dialog.querySelector('#clock-timezone') as HTMLSelectElement;
    const format24Input = dialog.querySelector('#clock-24h') as HTMLInputElement;
    const showTzInput = dialog.querySelector('#clock-show-tz') as HTMLInputElement;
    const saveBtn = dialog.querySelector('#save-btn') as HTMLButtonElement;
    const cancelBtn = dialog.querySelector('#cancel-btn') as HTMLButtonElement;

    const close = () => overlay.remove();

    cancelBtn.onclick = close;
    overlay.onclick = (e) => e.target === overlay && close();

    saveBtn.onclick = () => {
      const timezone = tzSelect.value;
      if (timezone) {
        const event = new CustomEvent('widget-update', {
          detail: {
            id: widget.id,
            content: {
              timezone,
              format24h: format24Input.checked,
              showTimezone: showTzInput.checked
            }
          }
        });
        document.dispatchEvent(event);
        close();
      }
    };
  }

  render(container: HTMLElement, widget: Widget): void {
    const content = widget.content as { timezone: string; format24h?: boolean; showTimezone?: boolean };
    const div = document.createElement('div');
    div.className = 'clock-widget';
    div.style.height = '100%';
    div.style.display = 'flex';
    div.style.flexDirection = 'column';
    div.style.alignItems = 'center';
    div.style.justifyContent = 'center';
    div.style.padding = '20px';
    div.style.gap = '16px';
    
    if (!content.timezone) {
      this.renderConfigScreen(div, widget);
    } else {
      this.renderClock(div, widget, content);
    }
    
    container.appendChild(div);
  }

  private renderConfigScreen(div: HTMLElement, widget: Widget): void {
    const icon = document.createElement('div');
    icon.textContent = '🕐';
    icon.style.fontSize = '48px';
    
    const label = document.createElement('div');
    label.textContent = 'Configure Clock';
    label.style.color = 'var(--text)';
    label.style.marginBottom = '16px';
    label.style.fontSize = '18px';
    label.style.fontWeight = '600';
    
    const tzLabel = document.createElement('div');
    tzLabel.textContent = 'Timezone:';
    tzLabel.style.fontSize = '14px';
    tzLabel.style.fontWeight = '500';
    tzLabel.style.marginBottom = '4px';
    tzLabel.style.alignSelf = 'flex-start';
    
    const timezoneSelect = document.createElement('select');
    timezoneSelect.style.padding = '8px 12px';
    timezoneSelect.style.border = '2px solid var(--border)';
    timezoneSelect.style.borderRadius = '6px';
    timezoneSelect.style.fontFamily = 'inherit';
    timezoneSelect.style.fontSize = '14px';
    timezoneSelect.style.background = 'var(--bg)';
    timezoneSelect.style.color = 'var(--text)';
    timezoneSelect.style.cursor = 'pointer';
    timezoneSelect.style.width = '100%';
    timezoneSelect.style.maxWidth = '300px';
    timezoneSelect.style.marginBottom = '12px';
    
    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = '-- Select Timezone --';
    placeholderOption.disabled = true;
    placeholderOption.selected = true;
    timezoneSelect.appendChild(placeholderOption);
    
    TIMEZONES.forEach(tz => {
      const option = document.createElement('option');
      option.value = tz;
      option.textContent = tz.replace(/_/g, ' ');
      timezoneSelect.appendChild(option);
    });
    
    const formatLabel = document.createElement('div');
    formatLabel.textContent = 'Time Format:';
    formatLabel.style.fontSize = '14px';
    formatLabel.style.fontWeight = '500';
    formatLabel.style.marginBottom = '4px';
    formatLabel.style.alignSelf = 'flex-start';
    
    const formatContainer = document.createElement('div');
    formatContainer.style.display = 'flex';
    formatContainer.style.gap = '8px';
    formatContainer.style.marginBottom = '12px';
    
    const format24h = document.createElement('button');
    format24h.textContent = '24-hour';
    format24h.style.padding = '8px 16px';
    format24h.style.border = '2px solid var(--accent)';
    format24h.style.borderRadius = '6px';
    format24h.style.background = 'var(--accent)';
    format24h.style.color = 'white';
    format24h.style.cursor = 'pointer';
    format24h.style.fontSize = '14px';
    format24h.dataset.selected = 'true';
    
    const format12h = document.createElement('button');
    format12h.textContent = '12-hour';
    format12h.style.padding = '8px 16px';
    format12h.style.border = '2px solid var(--border)';
    format12h.style.borderRadius = '6px';
    format12h.style.background = 'var(--surface)';
    format12h.style.color = 'var(--text)';
    format12h.style.cursor = 'pointer';
    format12h.style.fontSize = '14px';
    format12h.dataset.selected = 'false';
    
    format24h.addEventListener('click', () => {
      format24h.dataset.selected = 'true';
      format12h.dataset.selected = 'false';
      format24h.style.background = 'var(--accent)';
      format24h.style.borderColor = 'var(--accent)';
      format24h.style.color = 'white';
      format12h.style.background = 'var(--surface)';
      format12h.style.borderColor = 'var(--border)';
      format12h.style.color = 'var(--text)';
    });
    
    format12h.addEventListener('click', () => {
      format12h.dataset.selected = 'true';
      format24h.dataset.selected = 'false';
      format12h.style.background = 'var(--accent)';
      format12h.style.borderColor = 'var(--accent)';
      format12h.style.color = 'white';
      format24h.style.background = 'var(--surface)';
      format24h.style.borderColor = 'var(--border)';
      format24h.style.color = 'var(--text)';
    });
    
    formatContainer.appendChild(format24h);
    formatContainer.appendChild(format12h);
    
    const showTzLabel = document.createElement('label');
    showTzLabel.style.display = 'flex';
    showTzLabel.style.alignItems = 'center';
    showTzLabel.style.gap = '8px';
    showTzLabel.style.fontSize = '14px';
    showTzLabel.style.cursor = 'pointer';
    showTzLabel.style.marginBottom = '16px';
    
    const showTzCheckbox = document.createElement('input');
    showTzCheckbox.type = 'checkbox';
    showTzCheckbox.checked = true;
    showTzCheckbox.style.cursor = 'pointer';
    showTzCheckbox.style.width = '18px';
    showTzCheckbox.style.height = '18px';
    
    const showTzText = document.createElement('span');
    showTzText.textContent = 'Show timezone name';
    
    showTzLabel.appendChild(showTzCheckbox);
    showTzLabel.appendChild(showTzText);
    
    const button = document.createElement('button');
    button.textContent = 'Create Clock';
    button.style.padding = '10px 24px';
    button.style.background = 'var(--accent)';
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.borderRadius = '6px';
    button.style.cursor = 'pointer';
    button.style.fontSize = '14px';
    button.style.fontWeight = '500';
    button.style.marginTop = '16px';
    button.disabled = true;
    button.style.opacity = '0.5';
    button.style.cursor = 'not-allowed';
    
    timezoneSelect.addEventListener('change', () => {
      if (timezoneSelect.value) {
        button.disabled = false;
        button.style.opacity = '1';
        button.style.cursor = 'pointer';
      }
    });
    
    button.addEventListener('click', () => {
      if (timezoneSelect.value) {
        const is24h = format24h.dataset.selected === 'true';
        const showTz = showTzCheckbox.checked;
        const event = new CustomEvent('widget-update', {
          detail: { id: widget.id, content: { timezone: timezoneSelect.value, format24h: is24h, showTimezone: showTz } }
        });
        document.dispatchEvent(event);
      }
    });
    
    timezoneSelect.addEventListener('pointerdown', (e) => e.stopPropagation());
    format24h.addEventListener('pointerdown', (e) => e.stopPropagation());
    format12h.addEventListener('pointerdown', (e) => e.stopPropagation());
    showTzCheckbox.addEventListener('pointerdown', (e) => e.stopPropagation());
    button.addEventListener('pointerdown', (e) => e.stopPropagation());
    
    div.appendChild(icon);
    div.appendChild(label);
    div.appendChild(tzLabel);
    div.appendChild(timezoneSelect);
    div.appendChild(formatLabel);
    div.appendChild(formatContainer);
    div.appendChild(showTzLabel);
    div.appendChild(button);
  }

  private renderClock(div: HTMLElement, _widget: Widget, content: { timezone: string; format24h?: boolean; showTimezone?: boolean }): void {
    const timeDisplay = document.createElement('div');
    timeDisplay.style.fontSize = '48px';
    timeDisplay.style.fontWeight = '700';
    timeDisplay.style.fontFamily = 'monospace';
    timeDisplay.style.letterSpacing = '2px';
    timeDisplay.style.color = 'var(--text)';
    
    const dateDisplay = document.createElement('div');
    dateDisplay.style.fontSize = '18px';
    dateDisplay.style.color = 'var(--muted)';
    dateDisplay.style.fontWeight = '500';
    
    const timezoneDisplay = document.createElement('div');
    timezoneDisplay.style.fontSize = '14px';
    timezoneDisplay.style.color = 'var(--muted)';
    timezoneDisplay.style.display = content.showTimezone !== false ? 'block' : 'none';
    
    let intervalId: number | null = null;
    
    const updateTime = () => {
      try {
        const now = new Date();
        const options: Intl.DateTimeFormatOptions = {
          timeZone: content.timezone,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: !content.format24h
        };
        
        const dateOptions: Intl.DateTimeFormatOptions = {
          timeZone: content.timezone,
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        };
        
        const timeStr = now.toLocaleTimeString('en-US', options);
        const dateStr = now.toLocaleDateString('en-US', dateOptions);
        
        timeDisplay.textContent = timeStr;
        dateDisplay.textContent = dateStr;
        timezoneDisplay.textContent = content.timezone.replace(/_/g, ' ');
      } catch (error) {
        timeDisplay.textContent = 'Invalid timezone';
        dateDisplay.textContent = '';
      }
    };
    
    updateTime();
    intervalId = window.setInterval(updateTime, 1000);
    
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.removedNodes.forEach((node) => {
          if (node === div && intervalId !== null) {
            clearInterval(intervalId);
          }
        });
      });
    });
    
    if (div.parentNode) {
      observer.observe(div.parentNode, { childList: true });
    }
    
    div.appendChild(timeDisplay);
    div.appendChild(dateDisplay);
    div.appendChild(timezoneDisplay);
  }
}

export const widget = {
  type: 'clock',
  name: 'Clock',
  icon: '🕐',
  description: 'World clock with timezone support',
  renderer: new ClockWidgetRenderer(),
  defaultSize: { w: 400, h: 500 },
  defaultContent: { timezone: '', format24h: false, showTimezone: true }
};
