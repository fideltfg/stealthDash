import type { Widget, Vec2, Size } from './types';
import { MIN_WIDGET_SIZE } from './types';
import { getWidgetRenderer, getWidgetPlugin } from './widget-loader';

export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

export function createWidgetElement(widget: Widget, _gridSize: number): HTMLElement {
  const el = document.createElement('div');
  el.className = 'widget';
  el.id = `widget-${widget.id}`;
  el.tabIndex = -1; // Prevent focus on mouse enter, only programmatic focus
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', `${widget.type} widget`);
  el.style.left = `${widget.position.x}px`;
  el.style.top = `${widget.position.y}px`;
  el.style.width = `${widget.size.w}px`;
  el.style.height = `${widget.size.h}px`;
  el.style.zIndex = widget.z.toString();

  // Header
  const header = document.createElement('div');
  header.className = 'widget-header';
  
  const title = document.createElement('div');
  title.className = 'widget-title';
  title.textContent = widget.meta?.title || widget.type.toUpperCase();
  
  // Header buttons container
  const headerButtons = document.createElement('div');
  headerButtons.className = 'widget-header-buttons';
  
  // Get plugin and renderer for later use
  const plugin = getWidgetPlugin(widget.type);
  const renderer = getWidgetRenderer(widget.type);
  
  // Create menu button
  const menuBtn = document.createElement('button');
  menuBtn.className = 'widget-menu-btn';
  menuBtn.innerHTML = '⋮';
  menuBtn.title = 'Widget menu';
  menuBtn.setAttribute('aria-label', 'Widget menu');
  
  // Create dropdown menu
  const menuDropdown = document.createElement('div');
  menuDropdown.className = 'widget-menu-dropdown';
  menuDropdown.style.display = 'none';
  
  // Add custom menu items from widget renderer
  if (renderer?.getHeaderButtons) {
    const customButtons = renderer.getHeaderButtons(widget);
    customButtons.forEach((btn: HTMLElement) => {
      const menuItem = document.createElement('button');
      menuItem.className = 'widget-menu-item';
      menuItem.innerHTML = `<span class="widget-menu-icon">${btn.innerHTML}</span><span class="widget-menu-label">${btn.title || btn.getAttribute('aria-label') || 'Action'}</span>`;
      menuItem.onclick = (e) => {
        e.stopPropagation();
        btn.click();
        menuDropdown.style.display = 'none';
      };
      menuDropdown.appendChild(menuItem);
    });
  }
  
  // Settings menu item (if widget has configuration)
  if (plugin?.hasSettings !== false && renderer?.configure) {
    const settingsItem = document.createElement('button');
    settingsItem.className = 'widget-menu-item';
    settingsItem.innerHTML = '<span class="widget-menu-icon">⚙️</span><span class="widget-menu-label">Configure</span>';
    settingsItem.onclick = (e) => {
      e.stopPropagation();
      menuDropdown.style.display = 'none';
      if (renderer.configure) {
        renderer.configure(widget);
      }
    };
    menuDropdown.appendChild(settingsItem);
  }
  
  // Copy to Dashboard menu item
  const copyItem = document.createElement('button');
  copyItem.className = 'widget-menu-item';
  copyItem.innerHTML = '<span class="widget-menu-icon">📋</span><span class="widget-menu-label">Copy</span>';
  copyItem.onclick = (e) => {
    e.stopPropagation();
    menuDropdown.style.display = 'none';
    const event = new CustomEvent('widget-copy', { detail: { widgetId: widget.id } });
    window.dispatchEvent(event);
  };
  menuDropdown.appendChild(copyItem);
  
  // Delete menu item
  const deleteItem = document.createElement('button');
  deleteItem.className = 'widget-menu-item widget-menu-item-danger';
  deleteItem.innerHTML = '<span class="widget-menu-icon">🗑️</span><span class="widget-menu-label">Delete</span>';
  deleteItem.onclick = (e) => {
    e.stopPropagation();
    menuDropdown.style.display = 'none';
    const confirmed = confirm('Are you sure you want to delete this widget?');
    if (confirmed) {
      const event = new CustomEvent('widget-delete', { detail: { widgetId: widget.id } });
      window.dispatchEvent(event);
    }
  };
  menuDropdown.appendChild(deleteItem);
  
  // Prevent drag/resize when interacting with menu button and dropdown
  menuBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  menuDropdown.addEventListener('pointerdown', (e) => e.stopPropagation());
  
  // Toggle menu on button click
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const isVisible = menuDropdown.style.display === 'block';
    // Close all other widget menus
    document.querySelectorAll('.widget-menu-dropdown').forEach(menu => {
      (menu as HTMLElement).style.display = 'none';
    });
    menuDropdown.style.display = isVisible ? 'none' : 'block';
  });
  
  // Close menu when clicking outside (use capture phase to handle this once)
  const closeMenuHandler = (e: Event) => {
    if (!menuBtn.contains(e.target as Node) && !menuDropdown.contains(e.target as Node)) {
      menuDropdown.style.display = 'none';
    }
  };
  
  // Store handler reference for cleanup if needed
  (el as any).__menuCloseHandler = closeMenuHandler;
  document.addEventListener('click', closeMenuHandler);
  
  headerButtons.appendChild(menuBtn);
  headerButtons.appendChild(menuDropdown);
  
  header.appendChild(title);
  header.appendChild(headerButtons);
  el.appendChild(header);

  // Content
  const content = document.createElement('div');
  content.className = 'widget-content';
  
  // Use plugin architecture to render widget content (renderer already defined above)
  if (renderer) {
    renderer.render(content, widget);
  } else {
    content.textContent = `Unknown widget type: ${widget.type}`;
  }
  
  el.appendChild(content);

  // Resize handles
  addResizeHandles(el);

  return el;
}

function addResizeHandles(widget: HTMLElement): void {
  const handles = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
  
  handles.forEach(direction => {
    const handle = document.createElement('div');
    handle.className = `resize-handle resize-${direction}`;
    handle.dataset.direction = direction;
    widget.appendChild(handle);
  });
}

export function updateWidgetPosition(element: HTMLElement, position: Vec2): void {
  element.style.left = `${position.x}px`;
  element.style.top = `${position.y}px`;
}

export function updateWidgetSize(element: HTMLElement, size: Size): void {
  element.style.width = `${size.w}px`;
  element.style.height = `${size.h}px`;
}

export function updateWidgetZIndex(element: HTMLElement, z: number): void {
  element.style.zIndex = z.toString();
}

export function constrainSize(size: Size): Size {
  return {
    w: Math.max(MIN_WIDGET_SIZE.w, size.w),
    h: Math.max(MIN_WIDGET_SIZE.h, size.h)
  };
}

/**
 * Prevents keyboard events from propagating to widget drag handlers
 * Use this on input elements in widget configuration dialogs
 */
export function preventWidgetKeyboardDrag(element: HTMLElement): void {
  element.addEventListener('keydown', (e) => e.stopPropagation());
  element.addEventListener('keyup', (e) => e.stopPropagation());
}
