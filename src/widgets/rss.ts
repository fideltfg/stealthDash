import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';

interface RssFeedItem {
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
  author?: string;
}

export class RssWidgetRenderer implements WidgetRenderer {
  private refreshIntervals: Map<string, number> = new Map();

  configure(widget: Widget): void {
    const content = widget.content as { feedUrl?: string; maxItems?: number; refreshInterval?: number };
    
    const overlay = document.createElement('div');
    overlay.className = 'rss-config-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'rss-config-dialog';

    dialog.innerHTML = `
      <h3 class="rss-config-title">Configure RSS Feed</h3>
      <div class="rss-config-field">
        <label class="rss-config-label">Feed URL</label>
        <input type="text" id="rss-url" value="${content.feedUrl || ''}" placeholder="https://example.com/feed.xml"
          class="rss-config-input" />
      </div>
      <div class="rss-config-field">
        <label class="rss-config-label">Max Items</label>
        <input type="number" id="rss-max-items" value="${content.maxItems || 10}" min="1" max="50"
          class="rss-config-input" />
      </div>
      <div class="rss-config-field large-margin">
        <label class="rss-config-label">Refresh Interval (minutes, 0 to disable)</label>
        <input type="number" id="rss-refresh" value="${content.refreshInterval !== undefined ? content.refreshInterval : 5}" min="0" max="60"
          class="rss-config-input" />
      </div>
      <div class="rss-config-actions">
        <button id="cancel-btn" class="rss-config-btn cancel">
          Cancel
        </button>
        <button id="save-btn" class="rss-config-btn save">
          Save
        </button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const urlInput = dialog.querySelector('#rss-url') as HTMLInputElement;
    const maxItemsInput = dialog.querySelector('#rss-max-items') as HTMLInputElement;
    const refreshInput = dialog.querySelector('#rss-refresh') as HTMLInputElement;
    const saveBtn = dialog.querySelector('#save-btn') as HTMLButtonElement;
    const cancelBtn = dialog.querySelector('#cancel-btn') as HTMLButtonElement;

    const close = () => overlay.remove();

    cancelBtn.onclick = close;
    overlay.onclick = (e) => e.target === overlay && close();

    saveBtn.onclick = () => {
      const feedUrl = urlInput.value.trim();
      if (feedUrl) {
        const event = new CustomEvent('widget-update', {
          detail: {
            id: widget.id,
            content: {
              feedUrl,
              maxItems: parseInt(maxItemsInput.value) || 10,
              refreshInterval: parseInt(refreshInput.value)
            }
          }
        });
        document.dispatchEvent(event);
        close();
      }
    };
  }

  render(container: HTMLElement, widget: Widget): void {
    const content = widget.content as { feedUrl?: string; maxItems?: number; refreshInterval?: number };
    const div = document.createElement('div');
    div.className = 'rss-widget';
    
    if (!content.feedUrl) {
      this.renderConfigScreen(div, widget);
    } else {
      const maxItems = content.maxItems || 10;
      const refreshInterval = content.refreshInterval !== undefined ? content.refreshInterval : 5; // Default to 5 minutes
      
      this.fetchAndRenderFeed(div, widget, content.feedUrl, maxItems);
      
      // Set up auto-refresh if enabled (0 = disabled)
      if (refreshInterval > 0) {
        this.clearRefreshInterval(widget.id);
        const intervalId = window.setInterval(() => {
          this.fetchAndRenderFeed(div, widget, content.feedUrl!, maxItems);
        }, refreshInterval * 60 * 1000); // Convert minutes to milliseconds
        this.refreshIntervals.set(widget.id, intervalId);
      }
    }
    
    container.appendChild(div);
  }

  private clearRefreshInterval(widgetId: string): void {
    const intervalId = this.refreshIntervals.get(widgetId);
    if (intervalId) {
      clearInterval(intervalId);
      this.refreshIntervals.delete(widgetId);
    }
  }

  private renderConfigScreen(div: HTMLElement, widget: Widget): void {
    const inputContainer = document.createElement('div');
    inputContainer.className = 'rss-setup-container';
    
    const icon = document.createElement('div');
    icon.className = 'rss-setup-icon';
    icon.innerHTML = '<i class="fas fa-rss"></i>';
    
    const label = document.createElement('div');
    label.className = 'rss-setup-label';
    label.textContent = 'Enter RSS Feed URL';
    
    const urlInput = document.createElement('input');
    urlInput.className = 'rss-setup-input';
    urlInput.type = 'text';
    urlInput.placeholder = 'https://example.com/feed.xml';
    
    const maxItemsLabel = document.createElement('div');
    maxItemsLabel.className = 'rss-setup-sublabel';
    maxItemsLabel.textContent = 'Max items to display';
    
    const maxItemsInput = document.createElement('input');
    maxItemsInput.className = 'rss-setup-input number';
    maxItemsInput.type = 'number';
    maxItemsInput.value = '10';
    maxItemsInput.min = '1';
    maxItemsInput.max = '50';
    
    const refreshLabel = document.createElement('div');
    refreshLabel.className = 'rss-setup-sublabel';
    refreshLabel.textContent = 'Auto-refresh (minutes, 0 = disabled)';
    
    const refreshInput = document.createElement('input');
    refreshInput.className = 'rss-setup-input number';
    refreshInput.type = 'number';
    refreshInput.value = '5';
    refreshInput.min = '0';
    refreshInput.max = '1440';
    
    const button = document.createElement('button');
    button.className = 'rss-setup-button';
    button.textContent = 'Load Feed';
    button.disabled = true;
    
    const updateButtonState = () => {
      const url = urlInput.value.trim();
      button.disabled = url.length === 0;
    };
    
    const loadFeed = () => {
      const feedUrl = urlInput.value.trim();
      const maxItems = parseInt(maxItemsInput.value) || 10;
      const refreshInterval = parseInt(refreshInput.value) || 0;
      
      if (feedUrl) {
        const event = new CustomEvent('widget-update', {
          detail: { 
            id: widget.id, 
            content: { feedUrl, maxItems, refreshInterval } 
          }
        });
        document.dispatchEvent(event);
      }
    };
    
    button.addEventListener('click', loadFeed);
    urlInput.addEventListener('input', updateButtonState);
    urlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !button.disabled) {
        loadFeed();
      }
    });
    
    urlInput.addEventListener('pointerdown', (e) => e.stopPropagation());
    urlInput.addEventListener('keydown', (e) => e.stopPropagation());
    urlInput.addEventListener('keyup', (e) => e.stopPropagation());
    maxItemsInput.addEventListener('pointerdown', (e) => e.stopPropagation());
    maxItemsInput.addEventListener('keydown', (e) => e.stopPropagation());
    maxItemsInput.addEventListener('keyup', (e) => e.stopPropagation());
    refreshInput.addEventListener('pointerdown', (e) => e.stopPropagation());
    refreshInput.addEventListener('keydown', (e) => e.stopPropagation());
    refreshInput.addEventListener('keyup', (e) => e.stopPropagation());
    button.addEventListener('pointerdown', (e) => e.stopPropagation());
    
    inputContainer.appendChild(icon);
    inputContainer.appendChild(label);
    inputContainer.appendChild(urlInput);
    inputContainer.appendChild(maxItemsLabel);
    inputContainer.appendChild(maxItemsInput);
    inputContainer.appendChild(refreshLabel);
    inputContainer.appendChild(refreshInput);
    inputContainer.appendChild(button);
    div.appendChild(inputContainer);
  }

  private async fetchAndRenderFeed(container: HTMLElement, widget: Widget, feedUrl: string, maxItems: number): Promise<void> {
    container.innerHTML = '<div class="rss-loading">Loading feed...</div>';
    
    try {
      // Use RSS2JSON service as a CORS proxy
      const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}&count=${maxItems}`;
      const response = await fetch(proxyUrl);
      
      if (!response.ok) {
        throw new Error('Failed to fetch feed');
      }
      
      const data = await response.json();
      
      if (data.status !== 'ok') {
        throw new Error(data.message || 'Failed to parse feed');
      }
      
      container.innerHTML = '';
      this.renderFeedItems(container, data.feed, data.items, maxItems);
    } catch (error) {
      container.innerHTML = `<div class="rss-error">
        <div class="rss-error-icon"><i class="fas fa-exclamation-triangle"></i></div>
        <div>Failed to load RSS feed</div>
        <div class="rss-error-detail">${error instanceof Error ? error.message : 'Unknown error'}</div>
      </div>`;
    }
  }

  private renderFeedItems(container: HTMLElement, feed: any, items: any[], maxItems: number): void {
    const feedContainer = document.createElement('div');
    feedContainer.className = 'rss-feed-container';
    
    // Feed header
    const header = document.createElement('div');
    header.className = 'rss-feed-header';
    
    const feedTitle = document.createElement('div');
    feedTitle.className = 'rss-feed-title';
    feedTitle.textContent = feed.title || 'RSS Feed';
    
    const feedDescription = document.createElement('div');
    feedDescription.className = 'rss-feed-description';
    feedDescription.textContent = feed.description || '';
    
    header.appendChild(feedTitle);
    if (feed.description) {
      header.appendChild(feedDescription);
    }
    
    // Items list
    const itemsList = document.createElement('div');
    itemsList.className = 'rss-items-list';
    
    const displayItems = items.slice(0, maxItems);
    
    displayItems.forEach((item, index) => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'rss-item';
      
      itemDiv.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.link) {
          window.open(item.link, '_blank', 'noopener,noreferrer');
        }
      });
      
      const itemTitle = document.createElement('div');
      itemTitle.className = 'rss-item-title';
      itemTitle.textContent = item.title || 'Untitled';
      
      const itemMeta = document.createElement('div');
      itemMeta.className = 'rss-item-meta';
      
      const pubDate = item.pubDate ? new Date(item.pubDate).toLocaleDateString('en', { 
        month: 'short', 
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) : '';
      
      const author = item.author ? ` • ${item.author}` : '';
      itemMeta.textContent = `${pubDate}${author}`;
      
      itemDiv.appendChild(itemTitle);
      if (pubDate || author) {
        itemDiv.appendChild(itemMeta);
      }
      
      if (item.description) {
        const itemDescription = document.createElement('div');
        itemDescription.className = 'rss-item-description';
        
        // Strip HTML tags and truncate
        const text = item.description.replace(/<[^>]*>/g, '');
        const truncated = text.length > 150 ? text.substring(0, 150) + '...' : text;
        itemDescription.textContent = truncated;
        
        itemDiv.appendChild(itemDescription);
      }
      
      itemsList.appendChild(itemDiv);
    });
    
    feedContainer.appendChild(header);
    feedContainer.appendChild(itemsList);
    container.appendChild(feedContainer);
  }
}

export const widget = {
  type: 'rss',
  name: 'RSS Feed',
  icon: '<i class="fas fa-rss"></i>',
  description: 'Display RSS/Atom feeds',
  renderer: new RssWidgetRenderer(),
  defaultSize: { w: 400, h: 500 },
  defaultContent: { feedUrl: '', maxItems: 10, refreshInterval: 300 }
};
