import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';
import { credentialsService } from '../services/credentials';
import { authService } from '../services/auth';

interface GoogleCalendarContent {
  calendarId?: string; // Google Calendar ID (deprecated - use credentialId)
  apiKey?: string; // Google API key (deprecated - use credentialId)
  credentialId?: number; // ID of saved credential to use
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

  configure(widget: Widget): void {
    this.showConfigDialog(widget);
  }

  render(container: HTMLElement, widget: Widget): void {
    const content = widget.content as unknown as GoogleCalendarContent;

    // Check if configured
    if (!content.credentialId) {
      console.log('Google Calendar widget not configured - showing config prompt');
      this.renderConfigPrompt(container, widget);
      return;
    }

    // Create widget structure
    container.innerHTML = `
      <div class="calendar-widget widget-container flex flex-column">
        <div class="calendar-header widget-header-row">
          <h3 className="widget-title flex align-center gap-8">
            <span className="widget-icon-large"><i class="fas fa-calendar"></i></span>
            <span>Calendar</span>
          </h3>
        </div>
        <div class="calendar-content flex-1 flex flex-column gap-12">
          <div class="calendar-loading widget-loading centered">
            Loading events...
          </div>
        </div>
      </div>
    `;

    const contentEl = container.querySelector('.calendar-content') as HTMLElement;
 
    const fetchAndRender = async () => {
      try {
        // Verify credentialId is present
        if (!content.credentialId) {
          throw new Error('No credential configured for Google Calendar');
        }

        const maxEvents = content.maxEvents || 10;
        const daysAhead = content.daysAhead || 30;
        
        // Calculate time range
        const timeMin = new Date().toISOString();
        const timeMax = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();
        
        // Use backend API endpoint with credentialId
        const token = authService.getToken();
        const apiUrl = new URL(`${window.location.protocol}//${window.location.hostname}:3001/api/google-calendar/events`);
        apiUrl.searchParams.set('credentialId', content.credentialId.toString());
        apiUrl.searchParams.set('timeMin', timeMin);
        apiUrl.searchParams.set('timeMax', timeMax);
        apiUrl.searchParams.set('maxResults', maxEvents.toString());
        
        console.log('Fetching Google Calendar events via backend...');
        
        const response = await fetch(apiUrl.toString(), {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

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
          <div className="widget-error">
            <div className="widget-error-icon large" style="color: #f44336;"><i class="fas fa-exclamation-triangle"></i></div>
            <div className="widget-error-title">${error instanceof Error ? error.message : 'Unknown error'}</div>
            <div className="widget-error-message">Check your credentials in the user menu (<i class="fas fa-key"></i> Credentials)</div>
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
      <div className="widget-container flex align-center justify-center">
        <div className="text-center" style="max-width: 400px;">
          <div className="widget-config-icon"><i class="fas fa-calendar"></i></div>
          <h3 className="widget-title mb-12">Configure Google Calendar</h3>
          <p className="widget-text mb-8">
            Connect your Google Calendar to display upcoming events
          </p>
          <p className="widget-hint mb-24">
            <i class="fas fa-lightbulb"></i> Tip: Create credentials first from the user menu (<i class="fas fa-key"></i> Credentials)
          </p>
          <button id="configure-calendar-btn" className="widget-button primary">
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

  private async showConfigDialog(widget: Widget): Promise<void> {
    const content = widget.content as unknown as GoogleCalendarContent;
    
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay widget-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal widget-dialog scrollable';

    // Load credentials for dropdown
    const credentials = await credentialsService.getAll();
    const calendarCredentials = credentials.filter((c: any) => c.service_type === 'google_calendar');
    
    const credentialOptions = calendarCredentials.length > 0
      ? calendarCredentials.map((c: any) => 
          `<option value="${c.id}" ${content.credentialId === c.id ? 'selected' : ''} style="background: var(--surface); color: var(--text);">${c.name}</option>`
        ).join('')
      : '<option value="" disabled style="background: var(--surface); color: var(--muted);">No credentials available</option>';

    modal.innerHTML = `
      <div className="mb-20">
        <h2 className="widget-dialog-title large">
          <i class="fas fa-calendar"></i> Google Calendar Configuration
        </h2>
        <p className="widget-text">
          Configure your Google Calendar connection
        </p>
      </div>

      <form id="calendar-config-form" className="flex flex-column gap-16">
        <div>
          <label className="widget-dialog-label">
            Credentials *
          </label>
          <select 
            id="calendar-credential"
            required
            className="widget-dialog-input"
          >
            <option value="" style="background: var(--surface); color: var(--muted);">Select credentials...</option>
            ${credentialOptions}
          </select>
          <small className="widget-dialog-hint">
            Create Google Calendar credentials from the user menu (<i class="fas fa-key"></i> Credentials). Include Calendar ID and API Key.
          </small>
        </div>

        <div>
          <label className="widget-dialog-label">
            Display Mode
          </label>
          <select 
            id="calendar-display-mode"
            className="widget-dialog-input"
          >
            <option value="compact" ${content.displayMode === 'compact' ? 'selected' : ''} style="background: var(--surface); color: var(--text);">Compact</option>
            <option value="detailed" ${content.displayMode === 'detailed' ? 'selected' : ''} style="background: var(--surface); color: var(--text);">Detailed</option>
            <option value="agenda" ${content.displayMode === 'agenda' ? 'selected' : ''} style="background: var(--surface); color: var(--text);">Agenda</option>
          </select>
        </div>

        <div className="grid grid-2 gap-12">
          <div>
            <label className="widget-dialog-label">
              Max Events
            </label>
            <input 
              type="number" 
              id="calendar-max-events" 
              value="${content.maxEvents || 10}"
              min="1"
              max="50"
              className="widget-dialog-input"
            />
          </div>

          <div>
            <label className="widget-dialog-label">
              Days Ahead
            </label>
            <input 
              type="number" 
              id="calendar-days-ahead" 
              value="${content.daysAhead || 30}"
              min="1"
              max="365"
              className="widget-dialog-input"
            />
          </div>
        </div>

        <div>
          <label className="widget-dialog-label">
            Refresh Interval (seconds)
          </label>
          <input 
            type="number" 
            id="calendar-refresh" 
            value="${content.refreshInterval || 300}"
            min="60"
            max="3600"
            className="widget-dialog-input"
          />
        </div>

        <div className="widget-dialog-buttons">
          <button 
            type="submit"
            className="widget-dialog-button-save full-width"
          >
            Save
          </button>
          <button 
            type="button"
            id="cancel-btn"
            className="widget-dialog-button-cancel full-width"
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
      
      const credentialSelect = document.getElementById('calendar-credential') as HTMLSelectElement;
      const displayModeSelect = document.getElementById('calendar-display-mode') as HTMLSelectElement;
      const maxEventsInput = document.getElementById('calendar-max-events') as HTMLInputElement;
      const daysAheadInput = document.getElementById('calendar-days-ahead') as HTMLInputElement;
      const refreshInput = document.getElementById('calendar-refresh') as HTMLInputElement;

      // Prevent arrow keys from moving the widget
      credentialSelect.addEventListener('keydown', (e) => e.stopPropagation());
      credentialSelect.addEventListener('keyup', (e) => e.stopPropagation());
      displayModeSelect.addEventListener('keydown', (e) => e.stopPropagation());
      displayModeSelect.addEventListener('keyup', (e) => e.stopPropagation());
      maxEventsInput.addEventListener('keydown', (e) => e.stopPropagation());
      maxEventsInput.addEventListener('keyup', (e) => e.stopPropagation());
      daysAheadInput.addEventListener('keydown', (e) => e.stopPropagation());
      daysAheadInput.addEventListener('keyup', (e) => e.stopPropagation());
      refreshInput.addEventListener('keydown', (e) => e.stopPropagation());
      refreshInput.addEventListener('keyup', (e) => e.stopPropagation());
      
      const credentialId = parseInt(credentialSelect.value);
      const displayMode = displayModeSelect.value;
      const maxEvents = parseInt(maxEventsInput.value);
      const daysAhead = parseInt(daysAheadInput.value);
      const refreshInterval = parseInt(refreshInput.value);

      // Validate credential selection
      if (!credentialId) {
        alert('Please select credentials for Google Calendar authentication');
        return;
      }

      // Update widget content
      const newContent: GoogleCalendarContent = {
        credentialId,
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
        <div className="widget-empty">
          <div className="widget-empty-icon"><i class="fas fa-inbox"></i></div>
          <div className="widget-text">No upcoming events</div>
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
        <div className="event-card hover-effect" onclick="window.open('${event.htmlLink}', '_blank')">
          <div className="flex space-between align-start gap-12">
            <div className="flex-1 truncate">
              <div className="event-title">
                ${this.escapeHtml(event.summary)}
              </div>
              <div className="event-time">
                ${isAllDay ? 'All day' : this.formatTime(startDate)}
                ${event.location ? `<span className="event-location"><i class="fas fa-map-marker-alt"></i> ${this.escapeHtml(event.location)}</span>` : ''}
              </div>
            </div>
            <div className="event-date-label">
              ${dateLabel}
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div className="flex flex-column gap-8">
        ${eventsHtml}
      </div>
    `;
  }

  private renderDetailed(container: HTMLElement, events: CalendarEvent[], _content: GoogleCalendarContent): void {
    if (!events || events.length === 0) {
      container.innerHTML = `
        <div className="widget-empty">
          <div className="widget-empty-icon"><i class="fas fa-inbox"></i></div>
          <div className="widget-text">No upcoming events</div>
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
        <div className="event-card-detailed hover-effect" onclick="window.open('${event.htmlLink}', '_blank')">
          <div className="mb-8">
            <div className="event-title-large">
              ${this.escapeHtml(event.summary)}
            </div>
            <div className="event-time">
              ${dateLabel} ${isAllDay ? '(All day)' : `at ${this.formatTime(startDate)}`}
              ${!isAllDay ? ` - ${this.formatTime(endDate)}` : ''}
            </div>
          </div>
          ${event.location ? `
            <div className="event-location-row">
              <span><i class="fas fa-map-marker-alt"></i></span>
              <span>${this.escapeHtml(event.location)}</span>
            </div>
          ` : ''}
          ${event.description ? `
            <div className="event-description">
              ${this.escapeHtml(event.description.substring(0, 150))}${event.description.length > 150 ? '...' : ''}
            </div>
          ` : ''}
          ${event.attendees && event.attendees.length > 0 ? `
            <div className="event-attendees">
              <i class="fas fa-users"></i> ${event.attendees.length} attendee${event.attendees.length !== 1 ? 's' : ''}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div className="flex flex-column gap-12">
        ${eventsHtml}
      </div>
    `;
  }

  private renderAgenda(container: HTMLElement, events: CalendarEvent[], _content: GoogleCalendarContent): void {
    if (!events || events.length === 0) {
      container.innerHTML = `
        <div className="widget-empty">
          <div className="widget-empty-icon"><i class="fas fa-inbox"></i></div>
          <div className="widget-text">No upcoming events</div>
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
          <div className="agenda-event hover-effect" onclick="window.open('${event.htmlLink}', '_blank')">
            <div className="agenda-time">
              ${isAllDay ? 'All day' : this.formatTime(startDate)}
            </div>
            <div className="agenda-divider"></div>
            <div className="flex-1 truncate">
              <div className="agenda-event-title">
                ${this.escapeHtml(event.summary)}
              </div>
              ${event.location ? `
                <div className="agenda-event-location">
                  <i class="fas fa-map-marker-alt"></i> ${this.escapeHtml(event.location)}
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');

      return `
        <div className="agenda-day-section">
          <div className="agenda-day-header">
            ${dateLabel}
          </div>
          <div className="flex flex-column gap-8">
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
  icon: '<i class="fas fa-calendar"></i>',
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
