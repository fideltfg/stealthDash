# Copilot Instructions: Build a Web‑Based Dashboard (No Menus)

## Objective

Create a **web-based dashboard** that lets users add, position, and resize widgets of various sizes on an infinite (or sufficiently large) canvas. Widgets must **auto-resize to fit their contents**. The UI must support **light/dark themes**, and the interface must have **no sidebars, header bars, or footers**.

---

## Non‑Goals

* No server-side persistence required for v1 (use local persistence).
* No authentication/authorization in v1.
* No fixed, docked menus or app chrome (no side, header, or footer menus).

---

## Constraints

* **Zero persistent chrome**: no sidebars, top bars, or footers.
* Controls must be **contextual/floating** (e.g., FABs, inline handles, modal sheets).
* Dashboard must be fully responsive and keyboard-accessible.
* Use modern web standards; avoid framework lock-in. (Reference stacks below.)

---

## Core Features

### 1) Canvas & Layout

* A scrollable, zoomable **dashboard canvas** (single page) that holds widgets.
* Use **CSS Grid** or **absolute positioning with a layout engine** to allow arbitrary placement and drag/resize.
* Support **snap-to-grid** with configurable grid size (default 8px).
* Z‑index management: bring-to-front / send-to-back for overlapping widgets.

### 2) Widgets

* Built‑in widget types (v1):

  * **Text/Markdown** widget
  * **Image** widget
  * **Data view** widget (renders a small JSON table from pasted JSON)
  * **Web embed** (optional; sandboxed `iframe` with allowlist)
* Each widget supports: **move**, **resize**, **duplicate**, **delete**.
* **Auto-size to content**: a widget can switch to *auto* height/width mode where the container adapts to intrinsic content size (min/max constraints still apply).
* **Resizable handles** on corners/edges; **drag handle** on header (header appears only on hover/focus to honor the “no menus” aesthetic).
* **Keyboard**: arrow keys to move (with Shift for 10x nudge), Alt+arrow to resize.

### 3) Add/Insert Workflow (No Menus)

* A single floating **Add Widget** FAB (bottom-right by default).
* Tapping FAB opens a **modal sheet** (centered) with widget templates (Text, Image, Data view, Embed).
* On insert, place near viewport center and auto‑focus for immediate editing.

### 4) Theme Support

* Support **light** and **dark** themes via CSS custom properties.
* Honor `prefers-color-scheme`.
* Floating **Theme Toggle** (small circular button) positioned bottom-left; persists choice.
* Theming primitives: colors, elevation (shadows), surface/outline, focus ring, selection.

### 5) Persistence

* Persist dashboard state client-side via **localStorage** (or IndexedDB if large data).
* Persist: widgets (id, type, content, position/size), z‑order, theme, grid size, zoom level.
* Provide **Reset Dashboard** in a small floating overflow menu (three-dot floating button).

### 6) Undo/Redo & History

* Maintain in‑memory history stack with **Undo (Ctrl/Cmd+Z)** and **Redo (Shift+Ctrl/Cmd+Z)**.
* Coalesce minor drag/resize deltas to avoid bloating history.

### 7) Accessibility (A11y)

* All interactive controls reachable by keyboard; visible **focus rings**.
* Drag/resize must have keyboard equivalents and **ARIA live** announcements (e.g., size/position).
* Minimum contrast AA for both themes.
* Every widget has a **label** and **role="group"** (or component‑appropriate roles).
* Modals are focus‑trapped; ESC closes.

### 8) Performance

* 60fps target during drag/resize on modern hardware.
* Use **transform: translate/scale** for moves; avoid reflow where possible.
* Debounce persistence writes.
* Virtualize if many widgets (defer off‑screen paints).

---

## Data Model

```ts
// TypeScript reference model (framework-agnostic)
export type WidgetType = 'text' | 'image' | 'data' | 'embed';

export interface Vec2 { x: number; y: number }
export interface Size { w: number; h: number } // in pixels; respect min/max

export interface Widget {
  id: string;
  type: WidgetType;
  position: Vec2;       // canvas coords (px), snapped to grid when moving
  size: Size;           // px; if autoSize is true, w or h may be 'auto'
  autoSize: { width: boolean; height: boolean };
  z: number;            // z-index ordering
  content: any;         // type-specific payload
  meta?: { title?: string, createdAt: number, updatedAt: number };
}

export interface DashboardState {
  widgets: Widget[];
  theme: 'light' | 'dark' | 'system';
  grid: number;         // px
  zoom: number;         // 1.0 = 100%
  viewport: { x: number; y: number }; // for restoring scroll/zoom
  history?: { past: DashboardState[]; future: DashboardState[] };
}
```

### Content payloads

```ts
// text
{ markdown: string }

// image
{ src: string, objectFit: 'contain' | 'cover', alt?: string }

// data
{ json: unknown }

// embed (optional)
{ url: string, sandbox?: string[] /* allowlist tokens */ }
```

---

## Interaction Design

* **Drag**: pointer‑based with collision avoidance (optional) and snap‑to‑grid.
* **Resize**: handles show on hover/focus; maintain minSize; Shift keeps aspect for images.
* **Context bar**: when a widget is focused/selected, show a small **inline toolbar** (floating) near it with actions: Duplicate, Delete, Auto‑size toggle, Bring Forward/Send Backward.
* **Selection**: click to select; Shift+click for multi‑select; marquee selection optional.
* **Guides**: show alignment guides to edges/centers of other widgets.

---

## Theming & Styling

* Define CSS variables for: `--bg`, `--surface`, `--text`, `--muted`, `--accent`, `--ring`, `--shadow`.
* Light theme defaults; a `.theme-dark` class flips variables.
* Widget chrome is minimal: hairline borders, subtle shadow, rounded corners (8px).
* Respect reduced motion via `prefers-reduced-motion`.

---

## Persistence Format (localStorage)

* Key: `dashboard.v1`
* Value: JSON‑serialized `DashboardState`.
* Include version field and a simple **migration** function for future versions.

---

## Security Considerations

* For `embed`, enforce **URL allowlist** and `sandbox` with explicit permissions (no `allow-scripts` unless necessary).
* Sanitise Markdown and JSON renderers.

---

## Testing & Acceptance Criteria

### Functional Acceptance

* [ ] Add Text widget via FAB; it appears centered and is editable immediately.
* [ ] Drag any widget; it snaps to grid and persists after reload.
* [ ] Resize any widget along edges/corners; min size enforced; persists.
* [ ] Toggle **Auto‑size**: widget adapts to content growth/shrink.
* [ ] Theme toggle switches among Light/Dark/System; persists; honors `prefers-color-scheme`.
* [ ] No side/header/footer menus present at any viewport size.
* [ ] Keyboard move/resize works; focus is visible; ESC closes modals.

### Performance Acceptance

* [ ] Drag/resize feels smooth (no major jank) with 25 widgets on a mid‑range laptop.
* [ ] Writes to persistence are debounced; no freeze when moving/resizing continuously.

### Accessibility Acceptance

* [ ] All actions available via keyboard and labeled for screen readers.
* [ ] Contrast meets WCAG AA in both themes.

---

## Suggested Tech Stacks (choose one)

### Option A: **Vanilla + TypeScript**

* Build with **Vite** (TS template).
* Use **Pointer Events** for DnD/resize; CSS variables + Grid for layout.
* State in a simple store (e.g., writable TS module) + localStorage sync.

### Option B: **React + TypeScript**

* React + Vite + **Zustand** (state) + **@dnd-kit** for drag/keyboard DnD.
* CSS variables for themes; headless components for modals and focus traps.

(Framework choice must still obey the “no menus” rule and floating controls.)

---

## Implementation Milestones

1. **Scaffold & Theming**: base page, theme system, floating Theme Toggle.
2. **Canvas & State**: grid, zoom, local persistence.
3. **Widget MVPs**: Text, Image, Data; move/resize; floating toolbar.
4. **Auto‑size**: intrinsic measurement and container resize.
5. **Undo/Redo**: history stack.
6. **A11y polish**: keyboard, ARIA, focus management.
7. **QA & Docs**: acceptance checklist, short README.

---

## Deliverables

* `index.html`, `styles.css`, `main.ts` (or React equivalent).
* `types.ts` containing the models above.
* `storage.ts` for persistence; `history.ts` for undo/redo.
* `widgets/` directory with components (text, image, data, embed).
* `THEMING.md` documenting tokens and extension points.
* **No permanent side/header/footer menus** anywhere in the UI.

---

## Nice‑to‑Haves (Post‑v1)

* Multi‑select and group move/resize.
* Export/import dashboard JSON.
* Snap to alignment guides (smart guides).
* Server persistence and collaboration.
* Grid density control slider on a floating palette.
