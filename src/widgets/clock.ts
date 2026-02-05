import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';
import { TIMEZONES } from './timezones';

export class ClockWidgetRenderer implements WidgetRenderer {
  configure(widget: Widget): void {
    const content = widget.content as { timezone: string; format24h?: boolean; showTimezone?: boolean };
    
    const overlay = document.createElement('div');
    overlay.className = 'widget-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'widget-dialog scrollable';

    dialog.innerHTML = `
      <h3>Configure Clock</h3>
      <div class="form-group">
        <label>Timezone</label>
        <select id="clock-timezone">
          <option value="">-- Select Timezone --</option>
          ${TIMEZONES.map(tz => `<option value="${tz}" ${content.timezone === tz ? 'selected' : ''}>${tz.replace(/_/g, ' ')}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="checkbox-label">
          <input type="checkbox" id="clock-24h" ${content.format24h ? 'checked' : ''} />
          <span>Use 24-hour format</span>
        </label>
      </div>
      <div class="form-group">
        <label class="checkbox-label">
          <input type="checkbox" id="clock-show-tz" ${content.showTimezone !== false ? 'checked' : ''} />
          <span>Show timezone</span>
        </label>
      </div>
      <div class="button-group">
        <button id="cancel-btn" class="cancel-btn">Cancel</button>
        <button id="save-btn" class="save-btn">Save</button>
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

    // Prevent propagation for form inputs
    [tzSelect, format24Input, showTzInput].forEach(input => {
      input.addEventListener('pointerdown', (e) => e.stopPropagation());
      input.addEventListener('keydown', (e) => e.stopPropagation());
      input.addEventListener('keyup', (e) => e.stopPropagation());
    });

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
    
    if (!content.timezone) {
      this.renderConfigScreen(div, widget);
    } else {
      this.renderClock(div, widget, content);
    }
    
    container.appendChild(div);
  }

  private renderConfigScreen(div: HTMLElement, widget: Widget): void {
    const icon = document.createElement('div');
    icon.className = 'widget-config-icon';
    icon.textContent = '🕐';
    
    const label = document.createElement('div');
    label.className = 'clock-config-title';
    label.textContent = 'Configure Clock';
    
    const tzLabel = document.createElement('div');
    tzLabel.className = 'clock-config-label';
    tzLabel.textContent = 'Timezone:';
    
    const timezoneSelect = document.createElement('select');
    timezoneSelect.className = 'clock-timezone-select';
    
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
    formatLabel.className = 'clock-config-label';
    formatLabel.textContent = 'Time Format:';
    
    const formatContainer = document.createElement('div');
    formatContainer.className = 'clock-format-container';
    
    const format24h = document.createElement('button');
    format24h.className = 'clock-format-btn';
    format24h.textContent = '24-hour';
    format24h.dataset.selected = 'true';
    
    const format12h = document.createElement('button');
    format12h.className = 'clock-format-btn';
    format12h.textContent = '12-hour';
    format12h.dataset.selected = 'false';
    
    format24h.addEventListener('click', () => {
      format24h.dataset.selected = 'true';
      format12h.dataset.selected = 'false';
    });
    
    format12h.addEventListener('click', () => {
      format12h.dataset.selected = 'true';
      format24h.dataset.selected = 'false';
    });
    
    formatContainer.appendChild(format24h);
    formatContainer.appendChild(format12h);
    
    const showTzLabel = document.createElement('label');
    showTzLabel.className = 'clock-tz-toggle';
    
    const showTzCheckbox = document.createElement('input');
    showTzCheckbox.className = 'clock-tz-checkbox';
    showTzCheckbox.type = 'checkbox';
    showTzCheckbox.checked = true;
    
    const showTzText = document.createElement('span');
    showTzText.textContent = 'Show timezone name';
    
    showTzLabel.appendChild(showTzCheckbox);
    showTzLabel.appendChild(showTzText);
    
    const button = document.createElement('button');
    button.className = 'clock-save-btn';
    button.textContent = 'Create Clock';
    button.disabled = true;
    
    timezoneSelect.addEventListener('change', () => {
      button.disabled = !timezoneSelect.value;
    });
    
    button.addEventListener('click', () => {
      if (timezoneSelect.value) {
        const is24h = format24h.dataset.selected === 'true';
        const showTz = showTzCheckbox.checked;
        const event = new CustomEvent('widget-update', {
          detail: { 
            id: widget.id, 
            content: { 
              timezone: timezoneSelect.value, 
              format24h: is24h, 
              showTimezone: showTz 
            } 
          }
        });
        document.dispatchEvent(event);
      }
    });
    
    // Prevent event propagation for interactive elements
    [timezoneSelect, button].forEach(el => {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.addEventListener('keydown', (e) => e.stopPropagation());
      el.addEventListener('keyup', (e) => e.stopPropagation());
    });
    
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
    const displayContainer = document.createElement('div');
    displayContainer.className = 'clock-display-container';
    
    const timeDisplay = document.createElement('div');
    timeDisplay.className = 'clock-time';
    
    const dateDisplay = document.createElement('div');
    dateDisplay.className = 'clock-date';
    
    const timezoneDisplay = document.createElement('div');
    timezoneDisplay.className = 'clock-timezone';
    if (content.showTimezone === false) {
      timezoneDisplay.style.display = 'none';
    }
    
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
    
    // Clean up interval when widget is removed
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
    
    displayContainer.appendChild(timeDisplay);
    displayContainer.appendChild(dateDisplay);
    displayContainer.appendChild(timezoneDisplay);
    div.appendChild(displayContainer);
  }
}

export const widget = {
  type: 'clock',
  name: 'Clock',
  icon: '<i class="fas fa-clock"></i>',
  description: 'World clock with timezone support',
  renderer: new ClockWidgetRenderer(),
  defaultSize: { w: 400, h: 500 },
  defaultContent: { timezone: '', format24h: false, showTimezone: true }
};
