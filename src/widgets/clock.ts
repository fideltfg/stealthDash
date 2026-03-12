import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';
import { TIMEZONES } from './timezones';
import { stopAllDragPropagation, dispatchWidgetUpdate, injectWidgetStyles } from '../utils/dom';

const CLOCK_STYLES = `
.clock-display-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
}
.clock-time {
  font-size: 38px;
  font-weight: 300;
  font-variant-numeric: tabular-nums;
}
.clock-date {
  font-size: 18px;
  color: var(--muted);
}
.clock-timezone {
  font-size: 14px;
  color: var(--muted);
  opacity: 0.8;
  text-transform: uppercase;
}
/* Analog clock */
.clock-analog-svg {
  width: 100%;
  max-width: 240px;
  height: auto;
  overflow: visible;
}
.clock-face-bg {
  fill: var(--surface);
  stroke: var(--border);
  stroke-width: 3;
}
.clock-tick {
  stroke: var(--muted);
  stroke-width: 1;
}
.clock-tick-major {
  stroke: var(--text);
  stroke-width: 3;
}
.clock-hour-num {
  font-size: 14px;
  fill: var(--text);
  font-weight: 500;
}
.clock-hand-hour {
  stroke: var(--text);
  stroke-width: 6;
  stroke-linecap: round;
}
.clock-hand-minute {
  stroke: var(--text);
  stroke-width: 4;
  stroke-linecap: round;
}
.clock-hand-second {
  stroke: var(--accent, #e05a5a);
  stroke-width: 2;
  stroke-linecap: round;
}
.clock-center-dot {
  fill: var(--text);
}
.clock-center-cover {
  fill: var(--accent, #e05a5a);
}
`;

export class ClockWidgetRenderer implements WidgetRenderer {
  configure(widget: Widget): void {
    const content = widget.content as { timezone: string; format24h?: boolean; showTimezone?: boolean; showDate?: boolean; displayMode?: 'digital' | 'analog' };

    const overlay = document.createElement('div');
    overlay.className = 'widget-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'widget-dialog scrollable';

    // Build checkboxes programmatically so click events work reliably
    const format24Input = document.createElement('input');
    format24Input.type = 'checkbox';
    format24Input.checked = !!content.format24h;

    const showTzInput = document.createElement('input');
    showTzInput.type = 'checkbox';
    showTzInput.checked = content.showTimezone !== false;

    const showDateInput = document.createElement('input');
    showDateInput.type = 'checkbox';
    showDateInput.checked = content.showDate !== false;

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
        <label>Display Mode</label>
        <select id="clock-display-mode">
          <option value="digital" ${content.displayMode !== 'analog' ? 'selected' : ''}>Digital</option>
          <option value="analog" ${content.displayMode === 'analog' ? 'selected' : ''}>Analog</option>
        </select>
      </div>
      <div id="clock-24h-row" class="form-group"></div>
      <div id="clock-show-date-row" class="form-group"></div>
      <div id="clock-show-tz-row" class="form-group"></div>
      <div class="widget-dialog-buttons">
        <button id="cancel-btn" class="btn btn-small btn-secondary">Cancel</button>
        <button id="save-btn" class="btn btn-small btn-primary">Save</button>
      </div>
    `;

    const format24Label = document.createElement('label');
    format24Label.className = 'widget-dialog-label';
    format24Label.appendChild(format24Input);
    format24Label.appendChild(document.createTextNode(' Use 24-hour format'));
    (dialog.querySelector('#clock-24h-row') as HTMLElement).appendChild(format24Label);

    const showTzLabel = document.createElement('label');
    showTzLabel.className = 'widget-dialog-label';
    showTzLabel.appendChild(showTzInput);
    showTzLabel.appendChild(document.createTextNode(' Show timezone'));
    (dialog.querySelector('#clock-show-tz-row') as HTMLElement).appendChild(showTzLabel);

    const showDateLabel = document.createElement('label');
    showDateLabel.className = 'widget-dialog-label';
    showDateLabel.appendChild(showDateInput);
    showDateLabel.appendChild(document.createTextNode(' Show date'));
    (dialog.querySelector('#clock-show-date-row') as HTMLElement).appendChild(showDateLabel);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Prevent dialog pointerdown from reaching canvas handlers
    dialog.addEventListener('pointerdown', (e) => e.stopPropagation());

    const tzSelect = dialog.querySelector('#clock-timezone') as HTMLSelectElement;
    const displayModeSelect = dialog.querySelector('#clock-display-mode') as HTMLSelectElement;
    const saveBtn = dialog.querySelector('#save-btn') as HTMLButtonElement;
    const cancelBtn = dialog.querySelector('#cancel-btn') as HTMLButtonElement;

    const close = () => overlay.remove();

    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    stopAllDragPropagation(dialog);

    saveBtn.addEventListener('click', () => {
      const timezone = tzSelect.value || content.timezone;
      if (timezone) {
        dispatchWidgetUpdate(widget.id, {
          timezone,
          format24h: format24Input.checked,
          showTimezone: showTzInput.checked,
          showDate: showDateInput.checked,
          displayMode: displayModeSelect.value as 'digital' | 'analog'
        });
        close();
      }
    });
  }

  render(container: HTMLElement, widget: Widget): void {
    injectWidgetStyles('clock', CLOCK_STYLES);
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
    icon.innerHTML = '<i class="fa-regular fa-clock"></i>';

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

    // Display mode selector
    const displayModeLabel = document.createElement('div');
    displayModeLabel.className = 'clock-config-label';
    displayModeLabel.textContent = 'Display Mode:';

    const displayModeContainer = document.createElement('div');
    displayModeContainer.className = 'clock-format-container';

    const digitalBtn = document.createElement('button');
    digitalBtn.className = 'clock-format-btn';
    digitalBtn.textContent = 'Digital';
    digitalBtn.dataset.selected = 'true';

    const analogBtn = document.createElement('button');
    analogBtn.className = 'clock-format-btn';
    analogBtn.textContent = 'Analog';
    analogBtn.dataset.selected = 'false';

    digitalBtn.addEventListener('click', () => {
      digitalBtn.dataset.selected = 'true';
      analogBtn.dataset.selected = 'false';
    });
    analogBtn.addEventListener('click', () => {
      analogBtn.dataset.selected = 'true';
      digitalBtn.dataset.selected = 'false';
    });

    displayModeContainer.appendChild(digitalBtn);
    displayModeContainer.appendChild(analogBtn);

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

    const showDateLabel2 = document.createElement('label');
    showDateLabel2.className = 'clock-tz-toggle';

    const showDateCheckbox = document.createElement('input');
    showDateCheckbox.className = 'clock-tz-checkbox';
    showDateCheckbox.type = 'checkbox';
    showDateCheckbox.checked = true;

    const showDateText = document.createElement('span');
    showDateText.textContent = 'Show date';

    showDateLabel2.appendChild(showDateCheckbox);
    showDateLabel2.appendChild(showDateText);

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
        dispatchWidgetUpdate(widget.id, {
          timezone: timezoneSelect.value,
          format24h: is24h,
          showTimezone: showTz,
          showDate: showDateCheckbox.checked,
          displayMode: analogBtn.dataset.selected === 'true' ? 'analog' : 'digital'
        });
      }
    });

    div.appendChild(icon);
    div.appendChild(label);
    div.appendChild(tzLabel);
    div.appendChild(timezoneSelect);
    div.appendChild(formatLabel);
    div.appendChild(formatContainer);
    div.appendChild(displayModeLabel);
    div.appendChild(displayModeContainer);
    div.appendChild(showTzLabel);
    div.appendChild(showDateLabel2);
    div.appendChild(button);

    // Prevent event propagation for all interactive elements in this config screen
    stopAllDragPropagation(div);
  }

  private renderClock(div: HTMLElement, _widget: Widget, content: { timezone: string; format24h?: boolean; showTimezone?: boolean; showDate?: boolean; displayMode?: 'digital' | 'analog' }): void {
    const displayContainer = document.createElement('div');
    displayContainer.className = 'clock-display-container';

    let intervalId: number | null = null;
    if (content.displayMode === 'analog') {
      intervalId = this.renderAnalogClock(displayContainer, content);
    } else {
      intervalId = this.renderDigitalClock(displayContainer, content);
    }

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

    div.appendChild(displayContainer);
  }

  private renderDigitalClock(container: HTMLElement, content: { timezone: string; format24h?: boolean; showTimezone?: boolean; showDate?: boolean }): number {
    const timeDisplay = document.createElement('div');
    timeDisplay.className = 'clock-time';

    const dateDisplay = document.createElement('div');
    dateDisplay.className = 'clock-date';
    if (content.showDate === false) dateDisplay.classList.add('hidden');

    const timezoneDisplay = document.createElement('div');
    timezoneDisplay.className = 'clock-timezone';
    if (content.showTimezone === false) {
      timezoneDisplay.classList.add('hidden');
    }

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
        timeDisplay.textContent = now.toLocaleTimeString('en-US', options);
        dateDisplay.textContent = now.toLocaleDateString('en-US', dateOptions);
        timezoneDisplay.textContent = content.timezone.replace(/_/g, ' ');
      } catch {
        timeDisplay.textContent = 'Invalid timezone';
        dateDisplay.textContent = '';
      }
    };

    updateTime();
    const intervalId = window.setInterval(updateTime, 1000);

    container.appendChild(timeDisplay);
    container.appendChild(dateDisplay);
    container.appendChild(timezoneDisplay);

    return intervalId;
  }

  private renderAnalogClock(container: HTMLElement, content: { timezone: string; showTimezone?: boolean; showDate?: boolean }): number {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 200 200');
    svg.classList.add('clock-analog-svg');

    // Background circle
    const bg = document.createElementNS(svgNS, 'circle');
    bg.setAttribute('cx', '100');
    bg.setAttribute('cy', '100');
    bg.setAttribute('r', '96');
    bg.classList.add('clock-face-bg');
    svg.appendChild(bg);

    // 60 tick marks (12 major, 48 minor)
    for (let i = 0; i < 60; i++) {
      const angle = (i / 60) * 2 * Math.PI;
      const isMajor = i % 5 === 0;
      const innerR = isMajor ? 80 : 88;
      const tick = document.createElementNS(svgNS, 'line');
      tick.setAttribute('x1', String(100 + innerR * Math.sin(angle)));
      tick.setAttribute('y1', String(100 - innerR * Math.cos(angle)));
      tick.setAttribute('x2', String(100 + 94 * Math.sin(angle)));
      tick.setAttribute('y2', String(100 - 94 * Math.cos(angle)));
      tick.classList.add('clock-tick');
      if (isMajor) tick.classList.add('clock-tick-major');
      svg.appendChild(tick);
    }

    // Hour numbers 1–12
    for (let i = 1; i <= 12; i++) {
      const angle = (i / 12) * 2 * Math.PI;
      const r = 70;
      const text = document.createElementNS(svgNS, 'text');
      text.setAttribute('x', String(100 + r * Math.sin(angle)));
      text.setAttribute('y', String(100 - r * Math.cos(angle)));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.classList.add('clock-hour-num');
      text.textContent = String(i);
      svg.appendChild(text);
    }

    // Hands
    const hourHand = document.createElementNS(svgNS, 'line');
    hourHand.classList.add('clock-hand-hour');
    svg.appendChild(hourHand);

    const minuteHand = document.createElementNS(svgNS, 'line');
    minuteHand.classList.add('clock-hand-minute');
    svg.appendChild(minuteHand);

    const secondHand = document.createElementNS(svgNS, 'line');
    secondHand.classList.add('clock-hand-second');
    svg.appendChild(secondHand);

    // Center dot + accent cover
    const centerDot = document.createElementNS(svgNS, 'circle');
    centerDot.setAttribute('cx', '100');
    centerDot.setAttribute('cy', '100');
    centerDot.setAttribute('r', '5');
    centerDot.classList.add('clock-center-dot');
    svg.appendChild(centerDot);

    const centerCover = document.createElementNS(svgNS, 'circle');
    centerCover.setAttribute('cx', '100');
    centerCover.setAttribute('cy', '100');
    centerCover.setAttribute('r', '2.5');
    centerCover.classList.add('clock-center-cover');
    svg.appendChild(centerCover);

    container.appendChild(svg);

    // Date + timezone below
    const dateDisplay = document.createElement('div');
    dateDisplay.className = 'clock-date';
    if (content.showDate === false) dateDisplay.classList.add('hidden');
    container.appendChild(dateDisplay);

    const timezoneDisplay = document.createElement('div');
    timezoneDisplay.className = 'clock-timezone';
    if (content.showTimezone === false) timezoneDisplay.classList.add('hidden');
    container.appendChild(timezoneDisplay);

    // Helper: position a hand at angleDeg (0 = 12 o'clock), length toward tip, back behind center
    const setHand = (hand: Element, angleDeg: number, length: number, back: number) => {
      const rad = angleDeg * Math.PI / 180;
      hand.setAttribute('x1', String(100 - back * Math.sin(rad)));
      hand.setAttribute('y1', String(100 + back * Math.cos(rad)));
      hand.setAttribute('x2', String(100 + length * Math.sin(rad)));
      hand.setAttribute('y2', String(100 - length * Math.cos(rad)));
    };

    const update = () => {
      try {
        const now = new Date();
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: content.timezone,
          hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false
        }).formatToParts(now);

        const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0');
        const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0');
        const s = parseInt(parts.find(p => p.type === 'second')?.value ?? '0');

        setHand(hourHand,   (h % 12) / 12 * 360 + m / 60 * 30, 55, 12);
        setHand(minuteHand, m / 60 * 360 + s / 60 * 6,          72, 15);
        setHand(secondHand, s / 60 * 360,                        78, 20);

        dateDisplay.textContent = new Date().toLocaleDateString('en-US', {
          timeZone: content.timezone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        timezoneDisplay.textContent = content.timezone.replace(/_/g, ' ');
      } catch { /* invalid timezone */ }
    };

    update();
    return window.setInterval(update, 1000);
  }
}

export const widget = {
  type: 'clock',
  name: 'Clock',
  icon: '<i class="fas fa-clock"></i>',
  description: 'World clock with timezone support',
  renderer: new ClockWidgetRenderer(),
  defaultSize: { w: 400, h: 500 },
  defaultContent: { timezone: '', format24h: false, showTimezone: true, showDate: true, displayMode: 'digital' },
  allowedFields: ['timezone', 'format24h', 'showTimezone', 'showDate', 'displayMode']
};
