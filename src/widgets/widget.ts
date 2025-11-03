import type { Widget, Vec2, Size } from '../types';
import { MIN_WIDGET_SIZE } from '../types';
import { getWidgetRenderer } from './types';

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
  
  header.appendChild(title);
  el.appendChild(header);

  // Content
  const content = document.createElement('div');
  content.className = 'widget-content';
  
  // Use plugin architecture to render widget content
  const renderer = getWidgetRenderer(widget.type);
  if (renderer) {
    renderer.render(content, widget);
  } else {
    content.textContent = `Unknown widget type: ${widget.type}`;
  }
  
  el.appendChild(content);

  // Resize handles
  addResizeHandles(el);

  // Toolbar
  addToolbar(el);

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

function addToolbar(widget: HTMLElement): void {
  const toolbar = document.createElement('div');
  toolbar.className = 'widget-toolbar';
  
  const buttons = [
    { label: 'Duplicate', action: 'duplicate', icon: '📋' },
    { label: 'Delete', action: 'delete', icon: '🗑️' },
    { label: 'Auto-size', action: 'autosize', icon: '⚡' },
    { label: 'Bring Forward', action: 'forward', icon: '⬆️' },
  ];
  
  buttons.forEach(btn => {
    const button = document.createElement('button');
    button.className = 'toolbar-btn';
    button.textContent = `${btn.icon} ${btn.label}`;
    button.setAttribute('aria-label', btn.label);
    button.dataset.action = btn.action;
    toolbar.appendChild(button);
  });
  
  widget.appendChild(toolbar);
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
