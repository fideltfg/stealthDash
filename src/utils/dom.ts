/**
 * Shared DOM utility functions used across all components and widgets.
 */

/** Escape HTML entities to prevent XSS */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/** Strip all HTML tags from a string */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Prevent pointer/keyboard events from bubbling up to widget drag handlers.
 * Call on any interactive element inside a widget (inputs, buttons, etc.)
 */
export function stopWidgetDragPropagation(el: HTMLElement): void {
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('keydown', (e) => e.stopPropagation());
  el.addEventListener('keyup', (e) => e.stopPropagation());
}

/**
 * Apply stopWidgetDragPropagation to all interactive elements within a container.
 */
export function stopAllDragPropagation(
  container: HTMLElement,
  selector = 'input, select, textarea, button'
): void {
  container.querySelectorAll(selector).forEach(el => {
    stopWidgetDragPropagation(el as HTMLElement);
  });
}

/** Dispatch a widget content update event */
export function dispatchWidgetUpdate(widgetId: string, content: Record<string, any>): void {
  document.dispatchEvent(new CustomEvent('widget-update', {
    detail: { id: widgetId, content }
  }));
}

/**
 * Create a simple modal overlay + dialog with standard close behavior.
 * Returns { overlay, dialog, close } so callers can append content.
 */
export function createDialogShell(options?: {
  className?: string;
  closeOnBackdrop?: boolean;
}): { overlay: HTMLDivElement; dialog: HTMLDivElement; close: () => void } {
  const overlay = document.createElement('div');
  overlay.className = options?.className ?? 'widget-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'widget-dialog';
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();

  if (options?.closeOnBackdrop !== false) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
  }

  return { overlay, dialog, close };
}
