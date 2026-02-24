/**
 * Theme Registry — Single source of truth for all dashboard themes.
 *
 * To add a new theme:
 *   1. Add its CSS variables as `.theme-<value>` in src/css/app.css
 *   2. Add an entry to the THEMES array below
 *   3. (Optional) Add theme-specific widget overrides in app.css
 *
 * Everything else (type, menu, class toggling) is derived automatically.
 */

export interface ThemeDefinition {
  /** CSS class suffix — applied as `theme-<value>` on <html> */
  value: string;
  /** Human-readable label shown in the theme picker */
  label: string;
  /** FontAwesome icon class for the theme picker */
  icon: string;
}

/**
 * All available themes. Order here = order in the theme picker menu.
 * 'system' is a virtual theme (auto-detects OS preference) and must come last.
 */
export const THEMES: readonly ThemeDefinition[] = [
  { value: 'light',       label: 'Light',       icon: 'fa-solid fa-sun' },
  { value: 'dark',        label: 'Dark',        icon: 'fa-solid fa-moon' },
  { value: 'gruvbox',     label: 'Gruvbox',     icon: 'fa-solid fa-palette' },
  { value: 'tokyo-night', label: 'Tokyo Night', icon: 'fa-solid fa-city' },
  { value: 'catppuccin',  label: 'Catppuccin',  icon: 'fa-solid fa-mug-hot' },
  { value: 'forest',      label: 'Forest',      icon: 'fa-solid fa-tree' },
  { value: 'sunset',      label: 'Sunset',      icon: 'fa-solid fa-cloud-sun' },
  { value: 'peachy',      label: 'Peachy',      icon: 'fa-solid fa-heart' },
  { value: 'stealth',     label: 'Stealth',     icon: 'fa-solid fa-shield-halved' },
  { value: 'tactical',    label: 'Tactical',    icon: 'fa-solid fa-crosshairs' },
  { value: 'futurist',    label: 'Futurist',    icon: 'fa-solid fa-satellite' },
  { value: 'retro',       label: 'Retro',       icon: 'fa-solid fa-floppy-disk' },
  { value: 'system',      label: 'System',      icon: 'fa-solid fa-desktop' },
] as const;

/** All theme CSS class names, e.g. ['theme-light', 'theme-dark', ...] */
export const THEME_CLASSES: string[] = THEMES
  .filter(t => t.value !== 'system')
  .map(t => `theme-${t.value}`);

/** Union of valid theme value strings */
export type Theme = (typeof THEMES)[number]['value'];

/**
 * Resolve 'system' to the actual OS-preferred theme ('light' or 'dark').
 * This lets us apply a concrete CSS class instead of relying on a fragile
 * CSS @media :not() selector that must list every theme.
 */
export function resolveSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
