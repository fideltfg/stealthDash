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
  
  // Add custom buttons from widget renderer (if provided)
  if (renderer?.getHeaderButtons) {
    const customButtons = renderer.getHeaderButtons(widget);
    customButtons.forEach((btn: HTMLElement) => {
      headerButtons.appendChild(btn);
    });
  }
  
  // Settings button (if widget has configuration)
  if (plugin?.hasSettings !== false && renderer?.configure) {
    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'widget-settings-btn';
    settingsBtn.innerHTML = '⚙️';
    settingsBtn.title = 'Configure widget';
    settingsBtn.setAttribute('aria-label', 'Configure widget');
    settingsBtn.onclick = (e) => {
      e.stopPropagation();
      if (renderer.configure) {
        renderer.configure(widget);
      }
    };
    headerButtons.appendChild(settingsBtn);
  }
  
  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'widget-delete-btn';
  deleteBtn.innerHTML = '×';
  deleteBtn.title = 'Delete widget';
  deleteBtn.setAttribute('aria-label', 'Delete widget');
  deleteBtn.onclick = (e) => {
    e.stopPropagation();
    const confirmed = confirm('Are you sure you want to delete this widget?');
    if (confirmed) {
      const event = new CustomEvent('widget-delete', { detail: { widgetId: widget.id } });
      window.dispatchEvent(event);
    }
  };
  
  headerButtons.appendChild(deleteBtn);
  
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
