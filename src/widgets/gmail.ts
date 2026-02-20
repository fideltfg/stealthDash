import type { Widget } from '../types/types';
import type { WidgetRenderer, WidgetPlugin } from '../types/base-widget';
import { escapeHtml, stopAllDragPropagation } from '../utils/dom';
import { getPingServerUrl, getAuthHeaders } from '../utils/api';
import { WidgetPoller } from '../utils/polling';
import { renderConfigPrompt } from '../utils/widgetRendering';
import { populateCredentialSelect } from '../utils/credentials';

export interface GmailContent {
  credentialId?: number;
  labelIds: string[]; // Labels to show (INBOX, UNREAD, etc.)
  maxResults: number; // Number of emails to display
  refreshInterval: number; // Auto-refresh interval in seconds
  _wizardShown?: boolean; // Internal flag to prevent auto-showing wizard multiple times
}

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
  };
  labelIds: string[];
  internalDate: string;
}

interface GmailMessagesResponse {
  messages?: Array<{ id: string; threadId: string }>;
  resultSizeEstimate?: number;
}

interface GmailMessageDetails extends GmailMessage {
  subject: string;
  from: string;
  date: string;
  isUnread: boolean;
}

class GmailWidgetRenderer implements WidgetRenderer {
  private poller = new WidgetPoller();

  configure(widget: Widget): void {
    const container = document.getElementById(`widget-${widget.id}`)?.querySelector('.widget-content') as HTMLElement;
    if (container) {
      this.showSettings(container, widget);
    }
  }

  render(container: HTMLElement, widget: Widget): void {
    const content = (widget.content || {}) as unknown as GmailContent;

    // Set defaults
    if (!content.labelIds) {
      content.labelIds = ['INBOX'];
    }
    if (!content.maxResults) {
      content.maxResults = 20;
    }
    if (content.refreshInterval === undefined) {
      content.refreshInterval = 300; // 5 minutes default
    }

    container.className = 'gmail-container widget-wrapper';
    container.innerHTML = '';
    this.poller.stop(widget.id);

    const header = this.createHeader(widget, container);
    const body = document.createElement('div');
    body.className = 'widget-body gmail-body';

    container.appendChild(header);
    container.appendChild(body);

    if (!content.credentialId) {
      this.showSetupMessage(body, widget);
      // Auto-open wizard on first render
      if (!content._wizardShown) {
        content._wizardShown = true;
        widget.content = content as any;
        setTimeout(() => this.showSetupWizard(container, widget), 500);
      }
    } else {
      if (content.refreshInterval > 0) {
        this.poller.start(widget.id, () => {
          const gmailBody = document.getElementById(`widget-${widget.id}`)?.querySelector('.gmail-body') as HTMLElement;
          if (gmailBody && content.credentialId) {
            this.loadEmails(gmailBody, widget);
          }
        }, content.refreshInterval * 1000);
      } else {
        this.loadEmails(body, widget);
      }
    }
  }

  private createHeader(widget: Widget, container: HTMLElement): HTMLElement {
    const content = widget.content as unknown as GmailContent;
    const header = document.createElement('div');
    header.className = 'header gmail-header';

    const headerLeft = document.createElement('div');
    headerLeft.className = 'flex align-center gap-8';
    headerLeft.innerHTML = `
      <i class="fas fa-envelope" style="color: var(--accent);"></i>
      <div>
        <div class="header-title">Gmail</div>
        <div class="header-subtitle" id="gmail-status-${widget.id}">Loading...</div>
      </div>
    `;

    const headerRight = document.createElement('div');
    headerRight.className = 'header-actions flex align-center gap-8';

    // Refresh button
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'btn-small';
    refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
    refreshBtn.title = 'Refresh emails';
    refreshBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const body = container.querySelector('.gmail-body') as HTMLElement;
      if (body && content.credentialId) {
        this.loadEmails(body, widget);
      }
    });
    refreshBtn.addEventListener('pointerdown', (e) => e.stopPropagation());

    // Settings button
    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'btn-small';
    settingsBtn.innerHTML = '<i class="fas fa-cog"></i>';
    settingsBtn.title = 'Settings';
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showSettings(container, widget);
    });
    settingsBtn.addEventListener('pointerdown', (e) => e.stopPropagation());

    headerRight.appendChild(refreshBtn);
    headerRight.appendChild(settingsBtn);

    header.appendChild(headerLeft);
    header.appendChild(headerRight);

    return header;
  }

  private showSetupMessage(body: HTMLElement, widget: Widget): void {
    const btn = renderConfigPrompt(body, '📧', 'Gmail Not Configured', 'Click the button below to set up your Gmail connection.');
    btn.addEventListener('click', () => {
      this.showSetupWizard(body.parentElement as HTMLElement, widget);
    });
  }

  private async loadEmails(body: HTMLElement, widget: Widget): Promise<void> {
    const content = widget.content as unknown as GmailContent;

    body.innerHTML = `
      <div class="widget-loading">
        <i class="fas fa-spinner fa-spin"></i> Loading emails...
      </div>
    `;

    try {
      const messages = await this.fetchEmails(content);
      this.renderEmailList(body, widget, messages);
      this.updateStatus(widget, messages.length);
    } catch (error) {
      console.error('Failed to load emails:', error);
      body.innerHTML = `
        <div class="widget-error">
          <div class="widget-error-icon"><i class="fas fa-exclamation-triangle"></i></div>
          <div>Failed to load emails</div>
          <div style="font-size: 12px; margin-top: 8px;">${error instanceof Error ? error.message : 'Unknown error'}</div>
        </div>
      `;
      this.updateStatus(widget, 0, true);
    }
  }

  private async fetchEmails(content: GmailContent): Promise<GmailMessageDetails[]> {
    if (!content.credentialId) {
      throw new Error('No credential configured');
    }

    const serverUrl = getPingServerUrl();

    // First, get the list of message IDs
    const listQuery = new URLSearchParams({
      credentialId: content.credentialId.toString(),
      labelIds: content.labelIds.join(','),
      maxResults: content.maxResults.toString(),
    });

    const listResponse = await fetch(
      `${serverUrl}/api/gmail/messages?${listQuery}`,
      {
        headers: getAuthHeaders(false),
      }
    );

    if (!listResponse.ok) {
      const error = await listResponse.json().catch(() => ({ message: 'Failed to fetch emails' }));
      throw new Error(error.message || 'Failed to fetch emails');
    }

    const listData: GmailMessagesResponse = await listResponse.json();

    if (!listData.messages || listData.messages.length === 0) {
      return [];
    }

    // Fetch details for each message
    const messagePromises = listData.messages.map(async (msg) => {
      const detailServerUrl = getPingServerUrl();

      const detailQuery = new URLSearchParams({
        credentialId: content.credentialId!.toString(),
        messageId: msg.id,
      });

      const detailResponse = await fetch(
        `${detailServerUrl}/api/gmail/message?${detailQuery}`,
        {
          headers: getAuthHeaders(false),
        }
      );

      if (!detailResponse.ok) {
        throw new Error('Failed to fetch message details');
      }

      const message: GmailMessage = await detailResponse.json();
      return this.parseMessageDetails(message);
    });

    return Promise.all(messagePromises);
  }

  private parseMessageDetails(message: GmailMessage): GmailMessageDetails {
    const headers = message.payload.headers;
    const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '(No subject)';
    const from = headers.find(h => h.name.toLowerCase() === 'from')?.value || 'Unknown';
    const dateStr = headers.find(h => h.name.toLowerCase() === 'date')?.value || message.internalDate;
    
    // Parse email address from "Name <email>" format
    const fromEmail = from.match(/<(.+?)>/) ? from.match(/<(.+?)>/)![1] : from;
    const fromName = from.includes('<') ? from.split('<')[0].trim() : from;

    return {
      ...message,
      subject,
      from: fromName || fromEmail,
      date: this.formatDate(new Date(dateStr)),
      isUnread: message.labelIds.includes('UNREAD'),
    };
  }

  private renderEmailList(body: HTMLElement, widget: Widget, messages: GmailMessageDetails[]): void {
    body.innerHTML = '';

    if (messages.length === 0) {
      body.innerHTML = `
        <div class="widget-empty">
          <div class="widget-empty-icon">📭</div>
          <div>No messages found</div>
        </div>
      `;
      return;
    }

    const listContainer = document.createElement('div');
    listContainer.className = 'gmail-messages-list';

    messages.forEach(message => {
      const messageEl = this.createMessageElement(message, widget);
      listContainer.appendChild(messageEl);
    });

    body.appendChild(listContainer);
  }

  private createMessageElement(message: GmailMessageDetails, widget: Widget): HTMLElement {
    const el = document.createElement('div');
    el.className = `gmail-message ${message.isUnread ? 'gmail-message-unread' : ''}`;

    const iconColor = message.isUnread ? 'var(--accent)' : 'var(--muted)';
    
    el.innerHTML = `
      <div class="gmail-message-header">
        <div class="gmail-message-icon">
          <i class="fas ${message.isUnread ? 'fa-envelope' : 'fa-envelope-open'}" style="color: ${iconColor};"></i>
        </div>
        <div class="gmail-message-info">
          <div class="gmail-message-from">${escapeHtml(message.from)}</div>
          <div class="gmail-message-subject">${escapeHtml(message.subject)}</div>
          <div class="gmail-message-snippet">${escapeHtml(message.snippet)}</div>
        </div>
        <div class="gmail-message-date">${message.date}</div>
      </div>
      <div class="gmail-message-actions">
        <button class="btn-small gmail-action-open" data-id="${message.id}" title="Open in Gmail">
          <i class="fas fa-external-link-alt"></i>
        </button>
        ${message.isUnread ? `
          <button class="btn-small gmail-action-read" data-id="${message.id}" title="Mark as read">
            <i class="fas fa-envelope-open"></i>
          </button>
        ` : ''}
      </div>
    `;

    // Open in Gmail
    const openBtn = el.querySelector('.gmail-action-open') as HTMLButtonElement;
    openBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(`https://mail.google.com/mail/u/0/#inbox/${message.id}`, '_blank');
    });

    // Mark as read
    const readBtn = el.querySelector('.gmail-action-read') as HTMLButtonElement;
    readBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.markAsRead(message.id, widget);
      const body = el.closest('.gmail-body') as HTMLElement;
      if (body) {
        this.loadEmails(body, widget);
      }
    });

    return el;
  }

  private async markAsRead(messageId: string, widget: Widget): Promise<void> {
    const content = widget.content as unknown as GmailContent;
    if (!content.credentialId) return;

    const serverUrl = getPingServerUrl();

    try {
      const response = await fetch(
        `${serverUrl}/api/gmail/modify`,
        {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            credentialId: content.credentialId,
            messageId,
            removeLabelIds: ['UNREAD'],
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to mark message as read');
      }
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  }

  private updateStatus(widget: Widget, count: number, error = false): void {
    const statusEl = document.getElementById(`gmail-status-${widget.id}`);
    if (statusEl) {
      if (error) {
        statusEl.textContent = 'Error loading';
        statusEl.style.color = 'var(--error)';
      } else {
        const content = widget.content as unknown as GmailContent;
        const unreadNote = content.labelIds.includes('UNREAD') ? ' unread' : '';
        statusEl.textContent = `${count} message${count !== 1 ? 's' : ''}${unreadNote}`;
        statusEl.style.color = 'var(--muted)';
      }
    }
  }

  private formatDate(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      // Today - show time
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }

  private showSetupWizard(_container: HTMLElement, widget: Widget): void {
    const content = (widget.content || {}) as unknown as GmailContent;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'widget-dialog gmail-wizard';
    dialog.style.maxWidth = '700px';

    dialog.innerHTML = `
      <div class="gmail-wizard-header">
        <h3 class="widget-dialog-title">
          <i class="fas fa-envelope"></i> Gmail Setup Wizard
        </h3>
        <p style="color: var(--muted); font-size: 14px; margin-top: 8px;">
          Connect your Gmail account to display your inbox on the dashboard
        </p>
      </div>

      <div class="gmail-wizard-steps">
        <div class="gmail-wizard-step">
          <div class="gmail-wizard-step-number">1</div>
          <div class="gmail-wizard-step-content">
            <h4>Select Gmail Credential</h4>
            <p>Choose a Gmail account that you've already authorized, or authorize a new one.</p>
            <div class="form-group">
              <select id="gmail-credential-${widget.id}" class="form-input">
                <option value="">Select Gmail account...</option>
              </select>
            </div>
            <div class="info-box info-box-info" id="gmail-auth-info-${widget.id}">
              <strong>Need to authorize Gmail?</strong><br>
              The backend OAuth2 endpoints must be set up first. See 
              <a href="https://github.com/fideltfg/stealthDash/blob/main/docs/GMAIL_WIDGET_API.md" target="_blank">
                Gmail API Documentation
              </a> for setup instructions.
            </div>
          </div>
        </div>

        <div class="gmail-wizard-step">
          <div class="gmail-wizard-step-number">2</div>
          <div class="gmail-wizard-step-content">
            <h4>Choose What to Display</h4>
            <p>Select which Gmail labels you want to see in your widget.</p>
            <div class="form-group">
              <div id="gmail-labels-${widget.id}" class="gmail-labels-checkboxes">
                <label class="gmail-label-option">
                  <input type="checkbox" value="INBOX" ${content.labelIds?.includes('INBOX') ? 'checked' : 'checked'}>
                  <span><i class="fas fa-inbox"></i> Inbox</span>
                </label>
                <label class="gmail-label-option">
                  <input type="checkbox" value="UNREAD" ${content.labelIds?.includes('UNREAD') ? 'checked' : ''}>
                  <span><i class="fas fa-envelope"></i> Unread Only</span>
                </label>
                <label class="gmail-label-option">
                  <input type="checkbox" value="STARRED" ${content.labelIds?.includes('STARRED') ? 'checked' : ''}>
                  <span><i class="fas fa-star"></i> Starred</span>
                </label>
                <label class="gmail-label-option">
                  <input type="checkbox" value="IMPORTANT" ${content.labelIds?.includes('IMPORTANT') ? 'checked' : ''}>
                  <span><i class="fas fa-exclamation"></i> Important</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div class="gmail-wizard-step">
          <div class="gmail-wizard-step-number">3</div>
          <div class="gmail-wizard-step-content">
            <h4>Configure Display Options</h4>
            <p>Customize how many messages to show and refresh frequency.</p>
            <div class="form-group">
              <label class="form-label" for="gmail-max-${widget.id}">
                <i class="fas fa-list"></i> Maximum Messages
              </label>
              <input 
                type="number" 
                id="gmail-max-${widget.id}" 
                class="form-input" 
                value="${content.maxResults || 20}"
                min="1"
                max="100"
              >
              <span class="form-hint">Number of messages to display (1-100)</span>
            </div>

            <div class="form-group">
              <label class="form-label" for="gmail-refresh-${widget.id}">
                <i class="fas fa-sync-alt"></i> Auto-refresh Interval
              </label>
              <select id="gmail-refresh-${widget.id}" class="form-input">
                <option value="0" ${content.refreshInterval === 0 ? 'selected' : ''}>Never (manual only)</option>
                <option value="60" ${content.refreshInterval === 60 ? 'selected' : ''}>1 minute</option>
                <option value="120" ${content.refreshInterval === 120 ? 'selected' : ''}>2 minutes</option>
                <option value="300" ${content.refreshInterval === 300 ? 'selected' : ''}>5 minutes</option>
                <option value="600" ${content.refreshInterval === 600 ? 'selected' : ''}>10 minutes</option>
                <option value="900" ${content.refreshInterval === 900 ? 'selected' : ''}>15 minutes</option>
              </select>
              <span class="form-hint">How often to check for new emails</span>
            </div>
          </div>
        </div>
      </div>

      <div class="widget-dialog-buttons">
        <button class="btn btn-secondary" id="gmail-cancel-${widget.id}">
          <i class="fas fa-times"></i> Cancel
        </button>
        <button class="btn btn-primary" id="gmail-save-${widget.id}">
          <i class="fas fa-check"></i> Complete Setup
        </button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Prevent interaction with widget content
    stopAllDragPropagation(dialog);

    // Load credentials
    this.loadCredentials(widget);

    // Cancel button
    const cancelBtn = dialog.querySelector(`#gmail-cancel-${widget.id}`) as HTMLButtonElement;
    cancelBtn?.addEventListener('click', () => {
      overlay.remove();
    });

    // Save button
    const saveBtn = dialog.querySelector(`#gmail-save-${widget.id}`) as HTMLButtonElement;
    saveBtn?.addEventListener('click', async () => {
      const credentialSelect = dialog.querySelector(`#gmail-credential-${widget.id}`) as HTMLSelectElement;
      const maxInput = dialog.querySelector(`#gmail-max-${widget.id}`) as HTMLInputElement;
      const refreshSelect = dialog.querySelector(`#gmail-refresh-${widget.id}`) as HTMLSelectElement;
      
      const labelCheckboxes = dialog.querySelectorAll(`#gmail-labels-${widget.id} input:checked`) as NodeListOf<HTMLInputElement>;
      const selectedLabels = Array.from(labelCheckboxes).map(cb => cb.value);

      if (selectedLabels.length === 0) {
        alert('Please select at least one label');
        return;
      }

      if (!credentialSelect.value) {
        alert('Please select a Gmail credential');
        return;
      }

      content.credentialId = parseInt(credentialSelect.value);
      content.labelIds = selectedLabels;
      content.maxResults = parseInt(maxInput.value) || 20;
      content.refreshInterval = parseInt(refreshSelect.value) || 0;

      widget.content = content as any;

      // Save widget
      const event = new CustomEvent('widget-updated', { detail: { widget } });
      window.dispatchEvent(event);

      overlay.remove();

      // Re-render
      const widgetContainer = document.getElementById(`widget-${widget.id}`)?.querySelector('.widget-content') as HTMLElement;
      if (widgetContainer) {
        this.render(widgetContainer, widget);
      }
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });
  }

  private showSettings(container: HTMLElement, widget: Widget): void {
    // Settings just redirects to the wizard now
    this.showSetupWizard(container, widget);
  }

  private async loadCredentials(widget: Widget): Promise<void> {
    const select = document.querySelector(`#gmail-credential-${widget.id}`) as HTMLSelectElement;
    if (select) {
      // Clear existing options except first
      while (select.options.length > 1) {
        select.remove(1);
      }
      const content = widget.content as unknown as GmailContent;
      await populateCredentialSelect(select, 'gmail', content.credentialId);
    }
  }
}

// Export the widget plugin
export const widget: WidgetPlugin = {
  type: 'gmail',
  name: 'Gmail',
  icon: '📧',
  description: 'Display Gmail inbox with unread messages and quick actions',
  renderer: new GmailWidgetRenderer(),
  defaultSize: { w: 400, h: 600 },
  defaultContent: {
    labelIds: ['INBOX'],
    maxResults: 20,
    refreshInterval: 300,
  },
  hasSettings: true,
};
