import type { Widget } from '../../types';
import type { WidgetRenderer } from './base';

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
      <h3 style="margin: 0 0 20px 0; color: var(--text);">Configure RSS Feed</h3>
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; color: var(--text); font-size: 14px;">Feed URL</label>
        <input type="text" id="rss-url" value="${content.feedUrl || ''}" placeholder="https://example.com/feed.xml"
          style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text);" />
      </div>
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; color: var(--text); font-size: 14px;">Max Items</label>
        <input type="number" id="rss-max-items" value="${content.maxItems || 10}" min="1" max="50"
          style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text);" />
      </div>
      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 8px; color: var(--text); font-size: 14px;">Refresh Interval (minutes, 0 to disable)</label>
        <input type="number" id="rss-refresh" value="${content.refreshInterval !== undefined ? content.refreshInterval : 5}" min="0" max="60"
          style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text);" />
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
    div.style.height = '100%';
    div.style.display = 'flex';
    div.style.flexDirection = 'column';
    div.style.overflow = 'hidden';
    
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
    inputContainer.style.display = 'flex';
    inputContainer.style.flexDirection = 'column';
    inputContainer.style.alignItems = 'center';
    inputContainer.style.justifyContent = 'center';
    inputContainer.style.height = '100%';
    inputContainer.style.gap = '12px';
    inputContainer.style.padding = '20px';
    
    const icon = document.createElement('div');
    icon.textContent = '📰';
    icon.style.fontSize = '48px';
    
    const label = document.createElement('div');
    label.textContent = 'Enter RSS Feed URL';
    label.style.color = 'var(--muted)';
    label.style.marginBottom = '8px';
    
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.placeholder = 'https://example.com/feed.xml';
    urlInput.style.width = '100%';
    urlInput.style.padding = '8px 12px';
    urlInput.style.border = '2px solid var(--border)';
    urlInput.style.borderRadius = '6px';
    urlInput.style.fontFamily = 'inherit';
    urlInput.style.fontSize = '14px';
    urlInput.style.background = 'var(--bg)';
    urlInput.style.color = 'var(--text)';
    
    const maxItemsLabel = document.createElement('div');
    maxItemsLabel.textContent = 'Max items to display';
    maxItemsLabel.style.fontSize = '12px';
    maxItemsLabel.style.color = 'var(--muted)';
    maxItemsLabel.style.marginTop = '8px';
    
    const maxItemsInput = document.createElement('input');
    maxItemsInput.type = 'number';
    maxItemsInput.value = '10';
    maxItemsInput.min = '1';
    maxItemsInput.max = '50';
    maxItemsInput.style.width = '100px';
    maxItemsInput.style.padding = '8px 12px';
    maxItemsInput.style.border = '2px solid var(--border)';
    maxItemsInput.style.borderRadius = '6px';
    maxItemsInput.style.fontFamily = 'inherit';
    maxItemsInput.style.fontSize = '14px';
    maxItemsInput.style.background = 'var(--bg)';
    maxItemsInput.style.color = 'var(--text)';
    
    const refreshLabel = document.createElement('div');
    refreshLabel.textContent = 'Auto-refresh (minutes, 0 = disabled)';
    refreshLabel.style.fontSize = '12px';
    refreshLabel.style.color = 'var(--muted)';
    refreshLabel.style.marginTop = '8px';
    
    const refreshInput = document.createElement('input');
    refreshInput.type = 'number';
    refreshInput.value = '5';
    refreshInput.min = '0';
    refreshInput.max = '1440';
    refreshInput.style.width = '100px';
    refreshInput.style.padding = '8px 12px';
    refreshInput.style.border = '2px solid var(--border)';
    refreshInput.style.borderRadius = '6px';
    refreshInput.style.fontFamily = 'inherit';
    refreshInput.style.fontSize = '14px';
    refreshInput.style.background = 'var(--bg)';
    refreshInput.style.color = 'var(--text)';
    
    const button = document.createElement('button');
    button.textContent = 'Load Feed';
    button.style.padding = '8px 20px';
    button.style.background = 'var(--accent)';
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.borderRadius = '6px';
    button.style.cursor = 'pointer';
    button.style.fontSize = '14px';
    button.style.fontWeight = '500';
    button.style.marginTop = '8px';
    button.disabled = true;
    button.style.opacity = '0.5';
    button.style.cursor = 'not-allowed';
    
    const updateButtonState = () => {
      const url = urlInput.value.trim();
      if (url.length > 0) {
        button.disabled = false;
        button.style.opacity = '1';
        button.style.cursor = 'pointer';
      } else {
        button.disabled = true;
        button.style.opacity = '0.5';
        button.style.cursor = 'not-allowed';
      }
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
    maxItemsInput.addEventListener('pointerdown', (e) => e.stopPropagation());
    refreshInput.addEventListener('pointerdown', (e) => e.stopPropagation());
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
    container.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--muted); padding: 20px;">Loading feed...</div>';
    
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
      container.innerHTML = `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--error); text-align: center; padding: 20px;">
        <div style="font-size: 32px; margin-bottom: 12px;">⚠️</div>
        <div>Failed to load RSS feed</div>
        <div style="font-size: 12px; margin-top: 8px; color: var(--muted);">${error instanceof Error ? error.message : 'Unknown error'}</div>
      </div>`;
    }
  }

  private renderFeedItems(container: HTMLElement, feed: any, items: any[], maxItems: number): void {
    const feedContainer = document.createElement('div');
    feedContainer.style.height = '100%';
    feedContainer.style.display = 'flex';
    feedContainer.style.flexDirection = 'column';
    feedContainer.style.overflow = 'hidden';
    
    // Feed header
    const header = document.createElement('div');
    header.style.padding = '16px';
    header.style.borderBottom = '1px solid var(--border)';
    header.style.flexShrink = '0';
    
    const feedTitle = document.createElement('div');
    feedTitle.style.fontSize = '16px';
    feedTitle.style.fontWeight = '600';
    feedTitle.style.marginBottom = '4px';
    feedTitle.textContent = feed.title || 'RSS Feed';
    
    const feedDescription = document.createElement('div');
    feedDescription.style.fontSize = '12px';
    feedDescription.style.color = 'var(--muted)';
    feedDescription.textContent = feed.description || '';
    
    header.appendChild(feedTitle);
    if (feed.description) {
      header.appendChild(feedDescription);
    }
    
    // Items list
    const itemsList = document.createElement('div');
    itemsList.style.flex = '1';
    itemsList.style.overflowY = 'auto';
    itemsList.style.padding = '8px';
    
    const displayItems = items.slice(0, maxItems);
    
    displayItems.forEach((item, index) => {
      const itemDiv = document.createElement('div');
      itemDiv.style.padding = '12px';
      itemDiv.style.marginBottom = '8px';
      itemDiv.style.background = 'var(--bg)';
      itemDiv.style.borderRadius = '6px';
      itemDiv.style.border = '1px solid var(--border)';
      itemDiv.style.cursor = 'pointer';
      itemDiv.style.transition = 'background var(--transition-speed)';
      
      itemDiv.addEventListener('mouseenter', () => {
        itemDiv.style.background = 'var(--surface)';
      });
      
      itemDiv.addEventListener('mouseleave', () => {
        itemDiv.style.background = 'var(--bg)';
      });
      
      itemDiv.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.link) {
          window.open(item.link, '_blank', 'noopener,noreferrer');
        }
      });
      
      const itemTitle = document.createElement('div');
      itemTitle.style.fontSize = '14px';
      itemTitle.style.fontWeight = '500';
      itemTitle.style.marginBottom = '6px';
      itemTitle.style.color = 'var(--text)';
      itemTitle.textContent = item.title || 'Untitled';
      
      const itemMeta = document.createElement('div');
      itemMeta.style.fontSize = '11px';
      itemMeta.style.color = 'var(--muted)';
      itemMeta.style.marginBottom = '6px';
      
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
        itemDescription.style.fontSize = '12px';
        itemDescription.style.color = 'var(--muted)';
        itemDescription.style.lineHeight = '1.4';
        
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
  icon: '📰',
  description: 'Display RSS/Atom feeds',
  renderer: new RssWidgetRenderer(),
  defaultSize: { w: 400, h: 500 },
  defaultContent: { feedUrl: '', maxItems: 10, refreshInterval: 300 }
};
