/**
 * Common rendering helpers for widgets.
 * Reduces boilerplate for loading, error, and config-prompt states.
 */

import { escapeHtml } from './dom';

/** Show a loading spinner/message inside a widget container */
export function renderLoading(container: HTMLElement, message = 'Loading...'): void {
  container.innerHTML = `<div class="widget-loading padded centered">${escapeHtml(message)}</div>`;
}

/** Show an error state inside a widget container */
export function renderError(
  container: HTMLElement,
  title: string,
  error: unknown,
  hint?: string
): void {
  const msg = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  container.innerHTML = `
    <div class="widget-error">
      <div class="widget-error-icon">⚠️</div>
      <div class="widget-error-title">${escapeHtml(title)}</div>
      <div class="widget-error-message">${escapeHtml(msg)}</div>
      ${hint ? `<div class="widget-error-hint">${escapeHtml(hint)}</div>` : ''}
    </div>
  `;
}

/**
 * Show a "not configured" prompt with an icon + configure button.
 * Returns the button element so the caller can wire the configure handler.
 */
export function renderConfigPrompt(
  container: HTMLElement,
  icon: string,
  title: string,
  description: string
): HTMLButtonElement {
  container.innerHTML = `
    <div class="widget-config-screen padded">
      <div class="widget-config-icon">${icon}</div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>
      <button class="widget-button primary">Configure</button>
    </div>
  `;
  return container.querySelector('.widget-button') as HTMLButtonElement;
}
