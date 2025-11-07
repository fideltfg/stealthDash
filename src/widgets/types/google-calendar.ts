import type { Widget } from '../../types';
import type { WidgetRenderer } from './base';

interface GoogleCalendarContent {
  calendarId: string; // Google Calendar ID (usually your email or calendar@group.calendar.google.com)
  apiKey: string; // Google API key with Calendar API enabled
  maxEvents?: number; // Maximum number of events to display (default: 10)
  daysAhead?: number; // Number of days ahead to fetch events (default: 30)
  refreshInterval?: number; // Refresh interval in seconds (default: 300 = 5 minutes)
  displayMode?: 'compact' | 'detailed' | 'agenda'; // Display style
  showTime?: boolean; // Show event times (default: true)
  timeZone?: string; // Timezone for display (default: local)
}

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  htmlLink: string;
  colorId?: string;
  status: string;
  organizer?: {
    email: string;
    displayName?: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus: string;
  }>;
}

interface CalendarResponse {
  items: CalendarEvent[];
  summary: string;
  timeZone: string;
}

class GoogleCalendarRenderer implements WidgetRenderer {
  private updateIntervals: Map<string, number> = new Map();

  render(container: HTMLElement, widget: Widget): void {
    const content = widget.content as unknown as GoogleCalendarContent;

    // Check if configured
    if (!content.calendarId || !content.apiKey) {
      this.renderConfigPrompt(container, widget);
      return;
    }

    // Create widget structure
    container.innerHTML = `
      <div class="calendar-widget" style="width: 100%; height: 100%; display: flex; flex-direction: column; padding: 16px; overflow: auto; background: var(--surface);">
        <div class="calendar-header" style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: var(--text); display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 24px;">📅</span>
            <span>Calendar</span>
          </h3>
          <button id="calendar-settings-btn" title="Configure" style="
            background: transparent;
            border: none;
            color: var(--muted);
            cursor: pointer;
            font-size: 18px;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: all 0.2s;
          ">⚙️</button>
        </div>
        <div class="calendar-content" style="flex: 1; display: flex; flex-direction: column; gap: 12px;">
          <div class="calendar-loading" style="text-align: center; padding: 40px; color: var(--muted);">
            Loading events...
          </div>
        </div>
      </div>
    `;

    const contentEl = container.querySelector('.calendar-content') as HTMLElement;
    const settingsBtn = container.querySelector('#calendar-settings-btn');
    
    // Add settings button handler
    settingsBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showConfigDialog(widget);
    });

    const fetchAndRender = async () => {
      try {
        const maxEvents = content.maxEvents || 10;
        const daysAhead = content.daysAhead || 30;
        
        // Calculate time range
        const timeMin = new Date().toISOString();
        const timeMax = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();
        
        // Construct Google Calendar API URL
        const calendarUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(content.calendarId) + '/events');
        calendarUrl.searchParams.set('key', content.apiKey);
        calendarUrl.searchParams.set('timeMin', timeMin);
        calendarUrl.searchParams.set('timeMax', timeMax);
        calendarUrl.searchParams.set('maxResults', maxEvents.toString());
        calendarUrl.searchParams.set('orderBy', 'startTime');
        calendarUrl.searchParams.set('singleEvents', 'true');
        
        console.log('Fetching Google Calendar events...');
        console.log('Calendar ID:', content.calendarId);
        console.log('API URL:', calendarUrl.toString().replace(content.apiKey, '***'));
        
        const response = await fetch(calendarUrl.toString());

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
          console.error('Calendar API error:', response.status, errorData);
          
          let errorMsg = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
          if (response.status === 404) {
            errorMsg = 'Calendar not found. Check that:\n1. Calendar ID is correct (should be an email like you@gmail.com)\n2. Calendar is set to public or API key has access\n3. API key has Calendar API enabled';
          } else if (response.status === 403) {
            errorMsg = 'Access denied. Check that:\n1. API key is valid and has Calendar API enabled\n2. Calendar is shared publicly or with the API\n3. API key restrictions allow this domain';
          }
          throw new Error(errorMsg);
        }

        const data: CalendarResponse = await response.json();
        
        console.log('Calendar data received:', data);

        // Render based on display mode
        const mode = content.displayMode || 'compact';
        
        if (mode === 'agenda') {
          this.renderAgenda(contentEl, data.items, content);
        } else if (mode === 'detailed') {
          this.renderDetailed(contentEl, data.items, content);
        } else {
          this.renderCompact(contentEl, data.items, content);
        }

      } catch (error) {
        console.error('Error fetching calendar data:', error);
        contentEl.innerHTML = `
          <div style="text-align: center; padding: 40px; color: #f44336;">
            <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
            <div style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">Error loading calendar</div>
            <div style="font-size: 12px; color: var(--muted);">${error instanceof Error ? error.message : 'Unknown error'}</div>
            <div style="font-size: 11px; color: var(--muted); margin-top: 8px;">Check your Calendar ID (Settings → Calendar Settings in Google Calendar) and API key</div>
          </div>
        `;
      }
    };

    // Initial fetch
    fetchAndRender();

    // Clear any existing interval
    const existingInterval = this.updateIntervals.get(widget.id);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    // Set up auto-refresh
    const refreshInterval = (content.refreshInterval || 300) * 1000; // Convert to milliseconds
    const intervalId = window.setInterval(fetchAndRender, refreshInterval);
    this.updateIntervals.set(widget.id, intervalId);
  }

  private renderConfigPrompt(container: HTMLElement, widget: Widget): void {
    container.innerHTML = `
      <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; padding: 24px; background: var(--surface);">
        <div style="text-align: center; max-width: 400px;">
          <div style="font-size: 48px; margin-bottom: 16px;">📅</div>
          <h3 style="margin: 0 0 12px 0; font-size: 18px; color: var(--text);">Configure Google Calendar</h3>
          <p style="margin: 0 0 24px 0; font-size: 14px; color: var(--muted);">
            Connect your Google Calendar to display upcoming events
          </p>
          <button id="configure-calendar-btn" style="
            padding: 12px 24px;
            background: var(--accent);
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: filter 0.2s;
          ">
            Configure
          </button>
        </div>
      </div>
    `;

    const configBtn = container.querySelector('#configure-calendar-btn');
    configBtn?.addEventListener('click', () => {
      this.showConfigDialog(widget);
    });
  }

  private showConfigDialog(widget: Widget): void {
    const content = widget.content as unknown as GoogleCalendarContent;
    
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
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

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.cssText = `
      background: var(--surface);
      border-radius: 8px;
      padding: 24px;
      max-width: 600px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 8px 32px var(--shadow);
    `;

    modal.innerHTML = `
      <div style="margin-bottom: 20px;">
        <h2 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 600; color: var(--text);">
          📅 Google Calendar Configuration
        </h2>
        <p style="margin: 0; font-size: 14px; color: var(--muted);">
          Configure your Google Calendar connection
        </p>
      </div>

      <form id="calendar-config-form" style="display: flex; flex-direction: column; gap: 16px;">
        <div>
          <label style="display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500; color: var(--text);">
            Calendar ID *
          </label>
          <input 
            type="text" 
            id="calendar-id" 
            value="${content.calendarId || ''}"
            placeholder="your.email@gmail.com"
            required
            style="
              width: 100%;
              padding: 10px 12px;
              background: var(--bg);
              border: 1px solid var(--border);
              border-radius: 6px;
              font-size: 14px;
              color: var(--text);
              box-sizing: border-box;
            "
          />
          <small style="display: block; margin-top: 4px; font-size: 12px; color: var(--muted);">
            Your Google Calendar ID (usually your Gmail address or calendar@group.calendar.google.com)<br/>
            <strong>How to find:</strong> Google Calendar → Settings → Select your calendar → Scroll to "Integrate calendar" → Copy "Calendar ID"
          </small>
        </div>

        <div>
          <label style="display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500; color: var(--text);">
            Google API Key *
          </label>
          <input 
            type="text" 
            id="calendar-apikey" 
            value="${content.apiKey || ''}"
            placeholder="AIza..."
            required
            style="
              width: 100%;
              padding: 10px 12px;
              background: var(--bg);
              border: 1px solid var(--border);
              border-radius: 6px;
              font-size: 14px;
              color: var(--text);
              box-sizing: border-box;
            "
          />
          <small style="display: block; margin-top: 4px; font-size: 12px; color: var(--muted);">
            Get an API key from <a href="https://console.cloud.google.com/apis/credentials" target="_blank" style="color: var(--accent);">Google Cloud Console</a> with Calendar API enabled
          </small>
        </div>

        <div>
          <label style="display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500; color: var(--text);">
            Display Mode
          </label>
          <select 
            id="calendar-display-mode"
            style="
              width: 100%;
              padding: 10px 12px;
              background: var(--bg);
              border: 1px solid var(--border);
              border-radius: 6px;
              font-size: 14px;
              color: var(--text);
              box-sizing: border-box;
            "
          >
            <option value="compact" ${content.displayMode === 'compact' ? 'selected' : ''}>Compact</option>
            <option value="detailed" ${content.displayMode === 'detailed' ? 'selected' : ''}>Detailed</option>
            <option value="agenda" ${content.displayMode === 'agenda' ? 'selected' : ''}>Agenda</option>
          </select>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div>
            <label style="display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500; color: var(--text);">
              Max Events
            </label>
            <input 
              type="number" 
              id="calendar-max-events" 
              value="${content.maxEvents || 10}"
              min="1"
              max="50"
              style="
                width: 100%;
                padding: 10px 12px;
                background: var(--bg);
                border: 1px solid var(--border);
                border-radius: 6px;
                font-size: 14px;
                color: var(--text);
                box-sizing: border-box;
              "
            />
          </div>

          <div>
            <label style="display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500; color: var(--text);">
              Days Ahead
            </label>
            <input 
              type="number" 
              id="calendar-days-ahead" 
              value="${content.daysAhead || 30}"
              min="1"
              max="365"
              style="
                width: 100%;
                padding: 10px 12px;
                background: var(--bg);
                border: 1px solid var(--border);
                border-radius: 6px;
                font-size: 14px;
                color: var(--text);
                box-sizing: border-box;
              "
            />
          </div>
        </div>

        <div>
          <label style="display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500; color: var(--text);">
            Refresh Interval (seconds)
          </label>
          <input 
            type="number" 
            id="calendar-refresh" 
            value="${content.refreshInterval || 300}"
            min="60"
            max="3600"
            style="
              width: 100%;
              padding: 10px 12px;
              background: var(--bg);
              border: 1px solid var(--border);
              border-radius: 6px;
              font-size: 14px;
              color: var(--text);
              box-sizing: border-box;
            "
          />
        </div>

        <div style="display: flex; gap: 12px; margin-top: 8px;">
          <button 
            type="submit"
            style="
              flex: 1;
              padding: 12px;
              background: var(--accent);
              color: white;
              border: none;
              border-radius: 6px;
              font-size: 14px;
              font-weight: 600;
              cursor: pointer;
              transition: filter 0.2s;
            "
          >
            Save
          </button>
          <button 
            type="button"
            id="cancel-btn"
            style="
              flex: 1;
              padding: 12px;
              background: var(--border);
              color: var(--text);
              border: none;
              border-radius: 6px;
              font-size: 14px;
              font-weight: 600;
              cursor: pointer;
              transition: filter 0.2s;
            "
          >
            Cancel
          </button>
        </div>
      </form>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Handle form submission
    const form = modal.querySelector('#calendar-config-form') as HTMLFormElement;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const calendarId = (document.getElementById('calendar-id') as HTMLInputElement).value.trim();
      const apiKey = (document.getElementById('calendar-apikey') as HTMLInputElement).value.trim();
      const displayMode = (document.getElementById('calendar-display-mode') as HTMLSelectElement).value;
      const maxEvents = parseInt((document.getElementById('calendar-max-events') as HTMLInputElement).value);
      const daysAhead = parseInt((document.getElementById('calendar-days-ahead') as HTMLInputElement).value);
      const refreshInterval = parseInt((document.getElementById('calendar-refresh') as HTMLInputElement).value);

      // Update widget content
      const newContent: GoogleCalendarContent = {
        calendarId,
        apiKey,
        displayMode: displayMode as 'compact' | 'detailed' | 'agenda',
        maxEvents,
        daysAhead,
        refreshInterval,
        showTime: true
      };

      // Dispatch update event
      const event = new CustomEvent('widget-update', {
        detail: { id: widget.id, content: newContent }
      });
      document.dispatchEvent(event);

      // Close modal
      document.body.removeChild(overlay);
    });

    // Handle cancel
    const cancelBtn = modal.querySelector('#cancel-btn');
    cancelBtn?.addEventListener('click', () => {
      document.body.removeChild(overlay);
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
      }
    });
  }

  private renderCompact(container: HTMLElement, events: CalendarEvent[], _content: GoogleCalendarContent): void {
    if (!events || events.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--muted);">
          <div style="font-size: 48px; margin-bottom: 12px;">📭</div>
          <div style="font-size: 14px;">No upcoming events</div>
        </div>
      `;
      return;
    }

    const eventsHtml = events.map(event => {
      const startDate = this.parseEventDate(event.start);
      const isAllDay = !event.start.dateTime;
      const isToday = this.isToday(startDate);
      const isTomorrow = this.isTomorrow(startDate);

      let dateLabel = this.formatDate(startDate);
      if (isToday) dateLabel = 'Today';
      else if (isTomorrow) dateLabel = 'Tomorrow';

      return `
        <div style="
          padding: 12px;
          background: var(--hover);
          border-left: 3px solid var(--accent);
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        " onclick="window.open('${event.htmlLink}', '_blank')">
          <div style="display: flex; justify-content: space-between; align-items: start; gap: 12px;">
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${this.escapeHtml(event.summary)}
              </div>
              <div style="font-size: 12px; color: var(--muted);">
                ${isAllDay ? 'All day' : this.formatTime(startDate)}
                ${event.location ? `<span style="margin-left: 8px;">📍 ${this.escapeHtml(event.location)}</span>` : ''}
              </div>
            </div>
            <div style="font-size: 11px; color: var(--muted); white-space: nowrap;">
              ${dateLabel}
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${eventsHtml}
      </div>
    `;
  }

  private renderDetailed(container: HTMLElement, events: CalendarEvent[], _content: GoogleCalendarContent): void {
    if (!events || events.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--muted);">
          <div style="font-size: 48px; margin-bottom: 12px;">📭</div>
          <div style="font-size: 14px;">No upcoming events</div>
        </div>
      `;
      return;
    }

    const eventsHtml = events.map(event => {
      const startDate = this.parseEventDate(event.start);
      const endDate = this.parseEventDate(event.end);
      const isAllDay = !event.start.dateTime;
      const isToday = this.isToday(startDate);
      const isTomorrow = this.isTomorrow(startDate);

      let dateLabel = this.formatDate(startDate);
      if (isToday) dateLabel = 'Today';
      else if (isTomorrow) dateLabel = 'Tomorrow';

      return `
        <div style="
          padding: 16px;
          background: var(--hover);
          border-left: 3px solid var(--accent);
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        " onclick="window.open('${event.htmlLink}', '_blank')">
          <div style="margin-bottom: 8px;">
            <div style="font-size: 15px; font-weight: 600; color: var(--text); margin-bottom: 4px;">
              ${this.escapeHtml(event.summary)}
            </div>
            <div style="font-size: 12px; color: var(--muted);">
              ${dateLabel} ${isAllDay ? '(All day)' : `at ${this.formatTime(startDate)}`}
              ${!isAllDay ? ` - ${this.formatTime(endDate)}` : ''}
            </div>
          </div>
          ${event.location ? `
            <div style="font-size: 12px; color: var(--muted); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
              <span>📍</span>
              <span>${this.escapeHtml(event.location)}</span>
            </div>
          ` : ''}
          ${event.description ? `
            <div style="font-size: 12px; color: var(--muted); margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border);">
              ${this.escapeHtml(event.description.substring(0, 150))}${event.description.length > 150 ? '...' : ''}
            </div>
          ` : ''}
          ${event.attendees && event.attendees.length > 0 ? `
            <div style="font-size: 11px; color: var(--muted); margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border);">
              👥 ${event.attendees.length} attendee${event.attendees.length !== 1 ? 's' : ''}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${eventsHtml}
      </div>
    `;
  }

  private renderAgenda(container: HTMLElement, events: CalendarEvent[], _content: GoogleCalendarContent): void {
    if (!events || events.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--muted);">
          <div style="font-size: 48px; margin-bottom: 12px;">📭</div>
          <div style="font-size: 14px;">No upcoming events</div>
        </div>
      `;
      return;
    }

    // Group events by date
    const eventsByDate = new Map<string, CalendarEvent[]>();
    events.forEach(event => {
      const startDate = this.parseEventDate(event.start);
      const dateKey = this.formatDate(startDate);
      if (!eventsByDate.has(dateKey)) {
        eventsByDate.set(dateKey, []);
      }
      eventsByDate.get(dateKey)!.push(event);
    });

    const agendaHtml = Array.from(eventsByDate.entries()).map(([date, dayEvents]) => {
      const firstEventDate = this.parseEventDate(dayEvents[0].start);
      const isToday = this.isToday(firstEventDate);
      const isTomorrow = this.isTomorrow(firstEventDate);
      
      let dateLabel = date;
      if (isToday) dateLabel = 'Today';
      else if (isTomorrow) dateLabel = 'Tomorrow';

      const eventsHtml = dayEvents.map(event => {
        const startDate = this.parseEventDate(event.start);
        const isAllDay = !event.start.dateTime;

        return `
          <div style="
            display: flex;
            gap: 12px;
            padding: 8px 12px;
            background: var(--surface);
            border-radius: 4px;
            cursor: pointer;
            transition: background 0.2s;
          " onclick="window.open('${event.htmlLink}', '_blank')">
            <div style="min-width: 60px; font-size: 12px; color: var(--muted); text-align: right;">
              ${isAllDay ? 'All day' : this.formatTime(startDate)}
            </div>
            <div style="width: 3px; background: var(--accent); border-radius: 2px;"></div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 13px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${this.escapeHtml(event.summary)}
              </div>
              ${event.location ? `
                <div style="font-size: 11px; color: var(--muted); margin-top: 2px;">
                  📍 ${this.escapeHtml(event.location)}
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');

      return `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid var(--border);">
            ${dateLabel}
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${eventsHtml}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = agendaHtml;
  }

  private parseEventDate(dateObj: CalendarEvent['start'] | CalendarEvent['end']): Date {
    if (dateObj.dateTime) {
      return new Date(dateObj.dateTime);
    } else if (dateObj.date) {
      return new Date(dateObj.date + 'T00:00:00');
    }
    return new Date();
  }

  private formatDate(date: Date): string {
    const options: Intl.DateTimeFormatOptions = { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    };
    return date.toLocaleDateString(undefined, options);
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString(undefined, { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  }

  private isToday(date: Date): boolean {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  private isTomorrow(date: Date): boolean {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return date.toDateString() === tomorrow.toDateString();
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  destroy(widget: Widget): void {
    const intervalId = this.updateIntervals.get(widget.id);
    if (intervalId) {
      clearInterval(intervalId);
      this.updateIntervals.delete(widget.id);
    }
  }
}

export const widget = {
  type: 'google-calendar',
  name: 'Google Calendar',
  icon: '📅',
  description: 'Display upcoming events from Google Calendar',
  renderer: new GoogleCalendarRenderer(),
  defaultSize: { w: 400, h: 600 },
  defaultContent: {
    calendarId: '',
    apiKey: '',
    maxEvents: 10,
    daysAhead: 30,
    refreshInterval: 300,
    displayMode: 'compact',
    showTime: true
  }
};
