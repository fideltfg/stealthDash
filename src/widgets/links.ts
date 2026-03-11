import type { Widget, LinksContent, LinkItem } from '../types/types';
import type { WidgetRenderer, WidgetPlugin } from '../types/base-widget';
import {
  stopAllDragPropagation,
  dispatchWidgetUpdate,
  escapeHtml,
  injectWidgetStyles,
} from '../utils/dom';

// ─── Styles ──────────────────────────────────────────────────────────────────

const LINKS_STYLES = `
.links-root { display: flex; flex-direction: column; height: 100%; padding: 0px; gap: 6px; overflow: hidden; box-sizing: border-box; }

/* Toolbar */
.links-toolbar { display: flex; flex-direction: column; gap: 4px; flex-shrink: 0; }
.links-search { width: 100%; box-sizing: border-box; }
.links-cats { display: flex; gap: 4px; flex-wrap: wrap; }
.links-cat-btn { background: none; border: 1px solid var(--border, #444); color: var(--muted); cursor: pointer; padding: 2px 10px; border-radius: 12px; font-size: 12px; transition: all 0.15s; white-space: nowrap; line-height: 1.6; }
.links-cat-btn.active, .links-cat-btn:hover { background: var(--accent); border-color: var(--accent); color: #fff; }

/* List / Both modes */
.links-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 1px; min-height: 0; }
.link-item { display: flex; align-items: center; gap: 8px; padding: 6px 4px; border-radius: var(--radius); transition: background 0.15s; color: inherit; text-decoration: none; min-width: 0; position: relative; }
.link-item:hover { background: var(--hover); }

/* Favicon */
.link-favicon { width: 20px; height: 20px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.link-favicon img { width: 20px; height: 20px; object-fit: contain; border-radius: 3px; display: block; }
.link-favicon .link-fa-icon { color: var(--muted); font-size: 14px; }

/* Text */
.link-title { flex: 1; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.link-cat-badge { font-size: 11px; color: var(--muted); white-space: nowrap; flex-shrink: 0; }

/* Edit mode */
.links-edit-banner { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--accent); padding: 2px 4px; border-radius: var(--radius); background: rgba(99,102,241,0.1); flex-shrink: 0; }
.links-root.links-edit-mode .link-item { cursor: cell; }
.links-root.links-edit-mode .link-icon-item { cursor: cell; }

/* Drag handle (manual sort) */
.link-drag-handle { color: var(--muted); cursor: grab; font-size: 11px; padding: 0 3px; opacity: 0; transition: opacity 0.15s; flex-shrink: 0; }
.link-item:hover .link-drag-handle { opacity: 0.5; }
.link-item.dragging { opacity: 0.4; }
.link-item.drag-over { border-top: 2px solid var(--accent); }
.link-icon-item.drag-over { outline: 2px solid var(--accent); }

/* Icon grid mode */
.links-grid { flex: 1; overflow-y: auto; display: flex; flex-wrap: wrap; gap: 6px; align-content: flex-start; padding: 2px; min-height: 0; }
.link-icon-item { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 8px 8px; border-radius: var(--radius); transition: background 0.15s; color: inherit; text-decoration: none; width: 70px; text-align: center; position: relative; }
.link-icon-item:hover { background: var(--hover); }
.link-icon-wrap { width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 10px; overflow: hidden; flex-shrink: 0; }
.link-icon-wrap img { width: 100%; height: 100%; object-fit: contain; display: block; }
.link-icon-wrap .link-fa-icon { color: var(--muted); font-size: 22px; }

/* Empty */
.links-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; flex: 1; color: var(--muted); text-align: center; }

/* Footer */
.links-footer { display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
.links-add-btn { background: none; border: none; color: var(--accent); cursor: pointer; padding: 4px 8px; font-size: 12px; opacity: 0.8; }
.links-add-btn:hover { opacity: 1; }
.links-count { font-size: 12px; color: var(--muted); }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Block javascript: and data: URIs to prevent XSS */
function sanitizeHref(url: string): string {
  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:text/html')) {
    return '#';
  }
  return trimmed;
}

/** Derive a favicon URL for http/https links, or null for other protocols */
function getFaviconUrl(link: LinkItem): string | null {
  if (link.iconUrl) return link.iconUrl;
  try {
    const parsed = new URL(link.url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return `${parsed.protocol}//${parsed.hostname}/favicon.ico`;
    }
  } catch {
    // invalid URL – fall through
  }
  return null;
}

/** FontAwesome icon class for non-web protocol links */
function getProtocolIcon(url: string): string {
  const lower = url.toLowerCase();
  if (lower.startsWith('ssh://') || lower.startsWith('sftp://')) return 'fa-terminal';
  if (lower.startsWith('rdp://') || lower.startsWith('vnc://')) return 'fa-desktop';
  if (lower.startsWith('steam://')) return 'fa-gamepad';
  if (lower.startsWith('file://')) return 'fa-folder-open';
  if (lower.startsWith('ftp://')) return 'fa-server';
  if (lower.startsWith('mailto:')) return 'fa-envelope';
  return 'fa-link';
}

/** Build favicon HTML with automatic fallback on load error */
function faviconHtml(link: LinkItem, size: 'small' | 'large'): string {
  const src = getFaviconUrl(link);
  const fallbackIcon = getProtocolIcon(link.url);
  if (src) {
    const px = size === 'large' ? 32 : 20;
    // Use parentNode.querySelector instead of nextElementSibling to avoid text-node gaps
    return `<img src="${escapeHtml(src)}" width="${px}" height="${px}" onerror="this.style.display='none';var f=this.parentNode&&this.parentNode.querySelector('.link-fa-icon');if(f){f.style.display='inline-block';}" alt="" loading="lazy"><i class="fas ${fallbackIcon} link-fa-icon" style="display:none"></i>`;
  }
  return `<i class="fas ${fallbackIcon} link-fa-icon"></i>`;
}

/** Unique ID for new link items */
function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Filter & sort links based on widget settings */
function filteredLinks(
  links: LinkItem[],
  search: string,
  category: string,
  sortBy: LinksContent['sortBy']
): LinkItem[] {
  let result = links.slice();

  if (category) {
    result = result.filter((l) => (l.category || '') === category);
  }

  if (search) {
    const q = search.toLowerCase();
    result = result.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        l.url.toLowerCase().includes(q) ||
        (l.category || '').toLowerCase().includes(q)
    );
  }

  if (sortBy === 'title') {
    result.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sortBy === 'category') {
    result.sort((a, b) => {
      const ca = a.category || '';
      const cb = b.category || '';
      if (ca !== cb) return ca.localeCompare(cb);
      return a.title.localeCompare(b.title);
    });
  }
  // 'manual' → keep existing array order

  return result;
}

/** Extract unique category names from a link list */
function getCategories(links: LinkItem[]): string[] {
  const cats = new Set<string>();
  for (const l of links) {
    if (l.category) cats.add(l.category);
  }
  return Array.from(cats).sort();
}

// ─── Renderer ─────────────────────────────────────────────────────────────────

class LinksRenderer implements WidgetRenderer {
  private searchText = '';
  private activeCategory = '';
  private dragSrcIndex = -1;
  /** Tracks which widget IDs have edit mode active */
  private editModes = new Set<string>();

  destroy(): void {}

  configure(widget: Widget): void {
    this.showConfigDialog(widget);
  }

  getHeaderButtons(widget: Widget): HTMLElement[] {
    const isActive = this.editModes.has(widget.id);

    // Add Link button
    const addBtn = document.createElement('button');
    addBtn.innerHTML = '<i class="fas fa-plus"></i>';
    addBtn.title = 'Add Link';
    addBtn.onclick = (e) => {
      e.stopPropagation();
      const contentEl = document.querySelector(`#widget-${widget.id} .widget-content`) as HTMLElement | null;
      const onUpdate = () => { if (contentEl) this.render(contentEl, widget); };
      this.showLinkDialog(widget, null, onUpdate);
    };

    // Edit mode toggle button
    const editBtn = document.createElement('button');
    editBtn.innerHTML = '<i class="fas fa-pencil"></i>';
    editBtn.title = isActive ? 'Exit Edit Mode' : 'Edit Links';
    if (isActive) editBtn.classList.add('active');
    editBtn.onclick = (e) => {
      e.stopPropagation();
      if (this.editModes.has(widget.id)) {
        this.editModes.delete(widget.id);
      } else {
        this.editModes.add(widget.id);
      }
      const contentEl = document.querySelector(`#widget-${widget.id} .widget-content`) as HTMLElement | null;
      if (contentEl) this.render(contentEl, widget);
      const isNowActive = this.editModes.has(widget.id);
      editBtn.title = isNowActive ? 'Exit Edit Mode' : 'Edit Links';
      editBtn.classList.toggle('active', isNowActive);
    };

    return [addBtn, editBtn];
  }

  render(container: HTMLElement, widget: Widget): void {
    injectWidgetStyles('links', LINKS_STYLES);
    const c = widget.content as LinksContent;
    const links: LinkItem[] = c.links || [];
    const sortBy = c.sortBy || 'title';
    const displayMode = c.displayMode || 'both';
    const showSearch = c.showSearch !== false;
    const showCategories = c.showCategories !== false;

    const categories = getCategories(links);
    // Reset active category if it no longer exists
    if (this.activeCategory && !categories.includes(this.activeCategory)) {
      this.activeCategory = '';
    }

    const visible = filteredLinks(links, this.searchText, this.activeCategory, sortBy);

    // ── Root
    container.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'links-root';
    container.appendChild(root);

    // ── Toolbar
    if (showSearch || (showCategories && categories.length > 0)) {
      const toolbar = document.createElement('div');
      toolbar.className = 'links-toolbar';

      if (showSearch) {
        const search = document.createElement('input');
        search.type = 'text';
        search.className = 'widget-dialog-input links-search';
        search.placeholder = 'Search links…';
        search.value = this.searchText;
        search.addEventListener('input', () => {
          this.searchText = search.value;
          this.render(container, widget);
        });
        toolbar.appendChild(search);
      }

      if (showCategories && categories.length > 0) {
        const catBar = document.createElement('div');
        catBar.className = 'links-cats';

        const allBtn = document.createElement('button');
        allBtn.className = `links-cat-btn${this.activeCategory === '' ? ' active' : ''}`;
        allBtn.textContent = 'All';
        allBtn.addEventListener('click', () => {
          this.activeCategory = '';
          this.render(container, widget);
        });
        catBar.appendChild(allBtn);

        for (const cat of categories) {
          const btn = document.createElement('button');
          btn.className = `links-cat-btn${this.activeCategory === cat ? ' active' : ''}`;
          btn.textContent = cat;
          btn.addEventListener('click', () => {
            this.activeCategory = cat;
            this.render(container, widget);
          });
          catBar.appendChild(btn);
        }
        toolbar.appendChild(catBar);
      }

      root.appendChild(toolbar);
    }

    // ── Edit-mode banner
    const isEditMode = this.editModes.has(widget.id);
    // if (isEditMode) {
    //   root.classList.add('links-edit-mode');
    //   const banner = document.createElement('div');
    //   banner.className = 'links-edit-banner';
    //   banner.innerHTML = '<i class="fas fa-pencil"></i> Edit Mode — click a link to edit it';
    //   root.appendChild(banner);
    // }

    // ── Link list / grid
    const onUpdate = () => this.render(container, widget);

    if (displayMode === 'icon') {
      this.renderIconGrid(root, widget, visible, sortBy, isEditMode, onUpdate);
    } else {
      this.renderList(root, widget, visible, displayMode, sortBy, isEditMode, onUpdate);
    }

    // ── Footer
    // const footer = document.createElement('div');
    // footer.className = 'links-footer';
    // const count = document.createElement('span');
    // count.className = 'links-count';
    // count.textContent = `${visible.length} link${visible.length !== 1 ? 's' : ''}`;
    // footer.appendChild(count);
    // root.appendChild(footer);

    stopAllDragPropagation(container);
  }

  // ── List / Both ────────────────────────────────────────────────────────────

  private renderList(
    root: HTMLElement,
    widget: Widget,
    visible: LinkItem[],
    displayMode: string,
    sortBy: string,
    isEditMode: boolean,
    onUpdate: () => void
  ): void {
    const list = document.createElement('div');
    list.className = 'links-list';
    const totalLinks = ((widget.content as LinksContent).links || []).length;

    if (visible.length === 0) {
      list.innerHTML = `<div class="links-empty"><i class="fas fa-link"></i><p>${totalLinks === 0 ? 'No links yet' : 'No results'}</p></div>`;
    } else {
      for (let i = 0; i < visible.length; i++) {
        const link = visible[i];
        const el = this.buildListItem(widget, link, displayMode, sortBy, isEditMode, onUpdate);
        list.appendChild(el);
      }

      // HTML5 drag-and-drop for manual sort (edit mode only)
      if (isEditMode && sortBy === 'manual') {
        this.attachDragHandlers(list, widget, onUpdate);
      }
    }

    root.appendChild(list);
  }

  private buildListItem(
    widget: Widget,
    link: LinkItem,
    displayMode: string,
    sortBy: string,
    isEditMode: boolean,
    onUpdate: () => void
  ): HTMLElement {
    const el = document.createElement('a');
    el.className = 'link-item';
    el.href = isEditMode ? '#' : sanitizeHref(link.url);
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
    el.dataset.id = link.id;
    el.draggable = isEditMode && sortBy === 'manual';

    let inner = '';

    // Drag handle (edit mode + manual sort only)
    if (isEditMode && sortBy === 'manual') {
      inner += `<span class="link-drag-handle" title="Drag to reorder"><i class="fas fa-grip-vertical"></i></span>`;
    }

    // Favicon
    if (displayMode !== 'text') {
      inner += `<span class="link-favicon">${faviconHtml(link, 'small')}</span>`;
    }

    // Title
    inner += `<span class="link-title" title="${escapeHtml(link.url)}">${escapeHtml(link.title)}</span>`;

    // Category badge
    if (link.category) {
      inner += `<span class="link-cat-badge">${escapeHtml(link.category)}</span>`;
    }

    el.innerHTML = inner;

    if (isEditMode) {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.showLinkDialog(widget, link, onUpdate);
      });
    }

    return el;
  }

  private deleteLink(id: string, widget: Widget, onUpdate: () => void): void {
    const c = widget.content as LinksContent;
    const links = (c.links || []).filter((l) => l.id !== id);
    dispatchWidgetUpdate(widget.id, { ...c, links });
    onUpdate();
  }

  // ── Drag-and-drop reordering ───────────────────────────────────────────────

  private attachDragHandlers(
    list: HTMLElement,
    widget: Widget,
    onUpdate: () => void,
    itemSelector = '.link-item'
  ): void {
    const items = Array.from(list.querySelectorAll(itemSelector)) as HTMLElement[];

    items.forEach((el) => {
      el.addEventListener('dragstart', (e) => {
        this.dragSrcIndex = items.indexOf(el);
        el.classList.add('dragging');
        e.dataTransfer!.effectAllowed = 'move';
        e.dataTransfer!.setData('text/plain', el.dataset.id || '');
      });

      el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        items.forEach((i) => i.classList.remove('drag-over'));
      });

      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'move';
        items.forEach((i) => i.classList.remove('drag-over'));
        el.classList.add('drag-over');
      });

      el.addEventListener('drop', (e) => {
        e.preventDefault();
        const targetIndex = items.indexOf(el);
        if (this.dragSrcIndex === -1 || this.dragSrcIndex === targetIndex) return;

        const c = widget.content as LinksContent;
        const links = (c.links || []).slice();

        // Get the IDs for source and target in the current list order (may differ from allLinks)
        const srcId = items[this.dragSrcIndex].dataset.id!;
        const tgtId = el.dataset.id!;

        const srcIdx = links.findIndex((l) => l.id === srcId);
        const tgtIdx = links.findIndex((l) => l.id === tgtId);

        if (srcIdx === -1 || tgtIdx === -1) return;

        const [moved] = links.splice(srcIdx, 1);
        links.splice(tgtIdx, 0, moved);

        dispatchWidgetUpdate(widget.id, { ...c, links });
        this.dragSrcIndex = -1;
        onUpdate();
      });
    });
  }

  // ── Icon Grid ─────────────────────────────────────────────────────────────

  private renderIconGrid(
    root: HTMLElement,
    widget: Widget,
    visible: LinkItem[],
    sortBy: string,
    isEditMode: boolean,
    onUpdate: () => void
  ): void {
    const grid = document.createElement('div');
    grid.className = 'links-grid';
    const totalLinks = ((widget.content as LinksContent).links || []).length;

    if (visible.length === 0) {
      grid.innerHTML = `<div class="links-empty"><i class="fas fa-link"></i><p>${totalLinks === 0 ? 'No links yet' : 'No results'}</p></div>`;
    } else {
      for (const link of visible) {
        const el = document.createElement('a');
        el.className = 'link-icon-item';
        el.href = isEditMode ? '#' : sanitizeHref(link.url);
        el.target = '_blank';
        el.rel = 'noopener noreferrer';
        el.dataset.id = link.id;
        el.title = link.title;
        el.draggable = isEditMode && sortBy === 'manual';

        el.innerHTML = `<div class="link-icon-wrap">${faviconHtml(link, 'large')}</div>`;

        if (isEditMode) {
          el.addEventListener('click', (e) => {
            e.preventDefault();
            this.showLinkDialog(widget, link, onUpdate);
          });
        }

        grid.appendChild(el);
      }

      if (isEditMode && sortBy === 'manual') {
        this.attachDragHandlers(grid, widget, onUpdate, '.link-icon-item');
      }
    }

    root.appendChild(grid);
  }

  // ─── Add / Edit Link Dialog ───────────────────────────────────────────────

  private showLinkDialog(widget: Widget, link: LinkItem | null, onUpdate: () => void): void {
    const isEdit = link !== null;
    const overlay = document.createElement('div');
    overlay.className = 'widget-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'widget-dialog';

    dialog.innerHTML = `
      <h3 class="widget-dialog-title">${isEdit ? 'Edit Link' : 'Add Link'}</h3>

      <div class="widget-dialog-field">
        <label class="widget-dialog-label">Title *</label>
        <input id="link-title" type="text" class="widget-dialog-input" value="${escapeHtml(link?.title || '')}"
          placeholder="e.g. Home Assistant" autofocus />
      </div>

      <div class="widget-dialog-field">
        <label class="widget-dialog-label">URL *</label>
        <input id="link-url" type="text" class="widget-dialog-input" value="${escapeHtml(link?.url || '')}"
          placeholder="https://… or ssh:// or steam:// or file://…" />
        <p style="font-size:11px;color:var(--muted);margin:2px 0 0 0">
          Use <code>http://</code>, <code>https://</code>, <code>ssh://</code>, <code>rdp://</code>,
          <code>steam://</code>, <code>file://</code>, etc.
          Local app links work best in the <strong>desktop app</strong>.
        </p>
      </div>

      <div class="widget-dialog-field">
        <label class="widget-dialog-label">Category</label>
        <input id="link-category" type="text" class="widget-dialog-input" value="${escapeHtml(link?.category || '')}"
          placeholder="e.g. Work, Gaming, Media" />
      </div>

      <div class="widget-dialog-field">
        <label class="widget-dialog-label">Custom Icon URL <span style="color:var(--muted)">(optional)</span></label>
        <input id="link-icon" type="text" class="widget-dialog-input" value="${escapeHtml(link?.iconUrl || '')}"
          placeholder="https://example.com/icon.png (leave blank to auto-detect)" />
        <div id="link-icon-preview" style="margin-top:4px;height:32px;display:flex;align-items:center;gap:6px;"></div>
      </div>

      <div class="widget-dialog-actions">
        <button class="btn btn-small btn-secondary" id="link-cancel">Cancel</button>
        ${isEdit ? '<button class="btn btn-small btn-secondary" id="link-delete" style="color:#ef4444;border-color:#ef4444">Delete</button>' : ''}
        <button class="btn btn-small btn-primary" id="link-save">${isEdit ? 'Save' : 'Add'}</button>
      </div>`;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const titleInput = dialog.querySelector('#link-title') as HTMLInputElement;
    const urlInput = dialog.querySelector('#link-url') as HTMLInputElement;
    const catInput = dialog.querySelector('#link-category') as HTMLInputElement;
    const iconInput = dialog.querySelector('#link-icon') as HTMLInputElement;
    const iconPreview = dialog.querySelector('#link-icon-preview') as HTMLDivElement;

    // Icon preview updates
    const updatePreview = () => {
      const iconUrl = iconInput.value.trim();
      if (!iconUrl) {
        iconPreview.innerHTML = '';
        return;
      }
      iconPreview.innerHTML = `<img src="${escapeHtml(iconUrl)}" width="28" height="28" style="object-fit:contain;border-radius:4px;"
        onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'⚠️ Icon not found', style:'font-size:11px;color:#ef4444'}))"
        alt="icon preview" />
        <span style="font-size:11px;color:var(--muted)">Custom icon</span>`;
    };

    iconInput.addEventListener('input', updatePreview);
    if (link?.iconUrl) updatePreview();

    // Close
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    dialog.querySelector('#link-cancel')!.addEventListener('click', close);

    // Delete (edit mode only)
    if (isEdit && link) {
      dialog.querySelector('#link-delete')?.addEventListener('click', () => {
        if (!confirm(`Delete "${link.title}"?`)) return;
        this.deleteLink(link.id, widget, onUpdate);
        close();
      });
    }

    // Save
    dialog.querySelector('#link-save')!.addEventListener('click', () => {
      const title = titleInput.value.trim();
      const url = urlInput.value.trim();

      if (!title) { titleInput.focus(); titleInput.style.borderColor = '#ef4444'; return; }
      if (!url) { urlInput.focus(); urlInput.style.borderColor = '#ef4444'; return; }

      const c = widget.content as LinksContent;
      const links: LinkItem[] = (c.links || []).slice();

      if (isEdit && link) {
        const idx = links.findIndex((l) => l.id === link.id);
        if (idx !== -1) {
          links[idx] = {
            ...links[idx],
            title,
            url,
            category: catInput.value.trim() || undefined,
            iconUrl: iconInput.value.trim() || undefined,
          };
        }
      } else {
        links.push({
          id: newId(),
          title,
          url,
          category: catInput.value.trim() || undefined,
          iconUrl: iconInput.value.trim() || undefined,
        });
      }

      dispatchWidgetUpdate(widget.id, { ...c, links });
      close();
      onUpdate();
    });

    // Allow Enter to save from text inputs
    [titleInput, urlInput, catInput, iconInput].forEach((input) => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') (dialog.querySelector('#link-save') as HTMLButtonElement).click();
        if (e.key === 'Escape') close();
      });
    });

    titleInput.focus();
  }

  // ─── Settings / Config Dialog ─────────────────────────────────────────────

  private showConfigDialog(widget: Widget): void {
    const c = widget.content as LinksContent;
    const overlay = document.createElement('div');
    overlay.className = 'widget-overlay';
    const dialog = document.createElement('div');
    dialog.className = 'widget-dialog';

    dialog.innerHTML = `
      <h3 class="widget-dialog-title">Links Settings</h3>

      <div class="widget-dialog-field">
        <label class="widget-dialog-label">Display Mode</label>
        <select id="cfg-display" class="widget-dialog-input">
          <option value="both"  ${(c.displayMode || 'both') === 'both'  ? 'selected' : ''}>Icon + Text list</option>
          <option value="text"  ${c.displayMode === 'text'  ? 'selected' : ''}>Text only list</option>
          <option value="icon"  ${c.displayMode === 'icon'  ? 'selected' : ''}>Icons Grid</option>
        </select>
      </div>

      <div class="widget-dialog-field">
        <label class="widget-dialog-label">Sort By</label>
        <select id="cfg-sort" class="widget-dialog-input">
          <option value="title"    ${(c.sortBy || 'title') === 'title'    ? 'selected' : ''}>Title (A → Z)</option>
          <option value="category" ${c.sortBy === 'category' ? 'selected' : ''}>Category then Title</option>
          <option value="manual"   ${c.sortBy === 'manual'   ? 'selected' : ''}>Manual (drag to reorder)</option>
        </select>
      </div>

      <div class="widget-dialog-field">
        <label class="widget-dialog-label">
          <input type="checkbox" id="cfg-search" ${c.showSearch !== false ? 'checked' : ''} />
          Show search bar
        </label>
      </div>

      <div class="widget-dialog-field">
        <label class="widget-dialog-label">
          <input type="checkbox" id="cfg-cats" ${c.showCategories !== false ? 'checked' : ''} />
          Show category filter
        </label>
      </div>

      <div class="widget-dialog-actions">
        <button class="btn btn-small btn-secondary" id="cfg-cancel">Cancel</button>
        <button class="btn btn-small btn-primary" id="cfg-save">Save</button>
      </div>`;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    dialog.querySelector('#cfg-cancel')!.addEventListener('click', close);

    dialog.querySelector('#cfg-save')!.addEventListener('click', () => {
      const displayMode = (dialog.querySelector('#cfg-display') as HTMLSelectElement).value as LinksContent['displayMode'];
      const sortBy = (dialog.querySelector('#cfg-sort') as HTMLSelectElement).value as LinksContent['sortBy'];
      const showSearch = (dialog.querySelector('#cfg-search') as HTMLInputElement).checked;
      const showCategories = (dialog.querySelector('#cfg-cats') as HTMLInputElement).checked;

      dispatchWidgetUpdate(widget.id, { ...c, displayMode, sortBy, showSearch, showCategories });
      close();
    });
  }
}

// ─── Plugin Export ────────────────────────────────────────────────────────────

export const widget: WidgetPlugin = {
  type: 'links',
  name: 'Links',
  icon: '<i class="fas fa-link"></i>',
  description: 'Manage and launch web links and local applications',
  renderer: new LinksRenderer(),
  defaultSize: { w: 380, h: 480 },
  defaultContent: {
    links: [] as LinkItem[],
    displayMode: 'both',
    sortBy: 'title',
    showSearch: true,
    showCategories: true,
  } as LinksContent,
  hasSettings: true,
  allowedFields: ['links', 'displayMode', 'sortBy', 'showSearch', 'showCategories'],
};
