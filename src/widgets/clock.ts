import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';
import { TIMEZONES } from './timezones';

export class ClockWidgetRenderer implements WidgetRenderer {
  configure(widget: Widget): void {
    const content = widget.content as { timezone: string; format24h?: boolean; showTimezone?: boolean };
    
    const overlay = document.createElement('div');
    overlay.className = 'widget-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'widget-dialog';

    dialog.innerHTML = `
      <h3 class="mb-4"><i class="fas fa-clock me-2"></i>Configure Clock</h3>
      <div class="mb-3">
        <label class="form-label">Timezone</label>
        <select id="clock-timezone" class="form-select">
          <option value="">-- Select Timezone --</option>
          ${TIMEZONES.map(tz => `<option value="${tz}" ${content.timezone === tz ? 'selected' : ''}>${tz.replace(/_/g, ' ')}</option>`).join('')}
        </select>
      </div>
      <div class="mb-3">
        <div class="form-check">
          <input class="form-check-input" type="checkbox" id="clock-24h" ${content.format24h ? 'checked' : ''} />
          <label class="form-check-label" for="clock-24h">Use 24-hour format</label>
        </div>
      </div>
      <div class="mb-4">
        <div class="form-check">
          <input class="form-check-input" type="checkbox" id="clock-show-tz" ${content.showTimezone !== false ? 'checked' : ''} />
          <label class="form-check-label" for="clock-show-tz">Show timezone</label>
        </div>
      </div>
      <div class="d-flex gap-2 justify-content-end">
        <button id="cancel-btn" class="btn btn-secondary">Cancel</button>
        <button id="save-btn" class="btn btn-primary">Save</button>
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
    div.innerHTML = `
      <div class="text-center p-4">
        <div class="widget-config-icon mb-3">🕐</div>
        <h5 class="mb-3">Configure Clock</h5>
        
        <div class="mb-3">
          <label class="form-label">Timezone:</label>
          <select id="clock-timezone-select" class="form-select">
            <option value="" disabled selected>-- Select Timezone --</option>
            ${TIMEZONES.map(tz => `<option value="${tz}">${tz.replace(/_/g, ' ')}</option>`).join('')}
          </select>
        </div>
        
        <div class="mb-3">
          <label class="form-label">Time Format:</label>
          <div class="btn-group w-100" role="group">
            <input type="radio" class="btn-check" name="format" id="format-24h" value="24" checked>
            <label class="btn btn-outline-primary" for="format-24h">24-hour</label>
            <input type="radio" class="btn-check" name="format" id="format-12h" value="12">
            <label class="btn btn-outline-primary" for="format-12h">12-hour</label>
          </div>
        </div>
        
        <div class="mb-3">
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="show-tz-checkbox" checked>
            <label class="form-check-label" for="show-tz-checkbox">Show timezone name</label>
          </div>
        </div>
        
        <button id="clock-save-btn" class="btn btn-primary" disabled>
          <i class="fas fa-check me-2"></i>Create Clock
        </button>
      </div>
    `;
    
    const timezoneSelect = div.querySelector('#clock-timezone-select') as HTMLSelectElement;
    const button = div.querySelector('#clock-save-btn') as HTMLButtonElement;
    const format24Input = div.querySelector('#format-24h') as HTMLInputElement;
    const showTzCheckbox = div.querySelector('#show-tz-checkbox') as HTMLInputElement;
    
    timezoneSelect.addEventListener('change', () => {
      button.disabled = !timezoneSelect.value;
    });
    
    button.addEventListener('click', () => {
      if (timezoneSelect.value) {
        const is24h = format24Input.checked;
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
  title: 'Clock',
  name: 'Clock',
  icon: '<i class="fas fa-clock"></i>',
  description: 'World clock with timezone support',
  renderer: new ClockWidgetRenderer(),
  defaultSize: { w: 400, h: 500 },
  defaultContent: { timezone: '', format24h: false, showTimezone: true }
};
