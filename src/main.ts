import type { DashboardState, Widget, Vec2, Size, WidgetType } from './types';
import { DEFAULT_WIDGET_SIZE } from './types';
import { loadState, saveState, debouncedSave, getAllDashboards, createDashboard, deleteDashboard, renameDashboard, switchDashboard, getActiveDashboardId } from './storage';
import { createHistoryManager, shouldCoalesceAction } from './history';
import { createWidgetElement, updateWidgetPosition, updateWidgetSize, updateWidgetZIndex, snapToGrid, constrainSize } from './widgets/widget';
import { authService, type User } from './services/auth';
import { AuthUI } from './components/AuthUI';
import { UserSettingsUI } from './components/UserSettingsUI';
import { AdminDashboardUI } from './components/AdminDashboardUI';
import './css/style.css';
import './css/custom.css';

class Dashboard {
  private state: DashboardState;
  private history = createHistoryManager();
  private canvas!: HTMLElement;
  private canvasContent!: HTMLElement;
  private selectedWidgetId: string | null = null;
  private dragState: { widgetId: string; startPos: Vec2; startMousePos: Vec2 } | null = null;
  private resizeState: { widgetId: string; direction: string; startSize: Size; startPos: Vec2; startMousePos: Vec2 } | null = null;
  private panState: { startScrollX: number; startScrollY: number; startMousePos: Vec2 } | null = null;
  private lastTouchDistance: number = 0;
  private isLocked: boolean = false;
  private lockButton!: HTMLElement;
  private readonly SNAP_DISTANCE = 10; // pixels to snap to nearby edges
  private readonly SNAP_THRESHOLD = 15; // distance at which snapping occurs
  private snapGuides: HTMLElement[] = [];
  private authUI: AuthUI;
  private userSettingsUI: UserSettingsUI;
  private adminDashboardUI: AdminDashboardUI;
  private currentUser: User | null = null;
  private userMenuElement: HTMLElement | null = null;
  private autoSaveInterval: number | null = null;

  constructor() {
    this.authUI = new AuthUI(this.handleAuthChange.bind(this));
    this.userSettingsUI = new UserSettingsUI();
    this.adminDashboardUI = new AdminDashboardUI();
    this.state = loadState();
    this.init();
  }

  private async init(): Promise<void> {
    // Check for password reset token in URL hash
    const hash = window.location.hash;
    if (hash.startsWith('#/reset-password?token=')) {
      const params = new URLSearchParams(hash.split('?')[1]);
      const token = params.get('token');
      if (token) {
        // Show reset password dialog
        const { PasswordRecoveryUI } = await import('./components/PasswordRecoveryUI');
        const recoveryUI = new PasswordRecoveryUI();
        recoveryUI.showResetPasswordDialog(token, () => {
          // After successful reset, clear the hash and show login
          window.location.hash = '';
          this.authUI.showLoginDialog();
        });
        return;
      }
    }

    // Check if user is logged in
    if (authService.isAuthenticated()) {
      this.currentUser = authService.getUser();
      
      // Verify token is still valid and get fresh profile with admin flag
      const valid = await authService.verify();
      if (!valid) {
        authService.logout();
        return;
      }

      // Get fresh profile to ensure we have is_admin flag
      await authService.getProfile();
      this.currentUser = authService.getUser();

      // Load dashboard from server
      const serverDashboard = await authService.loadDashboard();
      if (serverDashboard) {
        this.state = serverDashboard;
      }

      this.setupDOM();
      this.setupTheme();
      this.setupBackground();
      this.setupEventListeners();
      this.render();
      this.saveHistory();
      this.showUserMenu();
      this.startAutoSave();
    } else {
      // Show login dialog
      this.authUI.showLoginDialog();
    }
  }

  private handleAuthChange(user: User | null): void {
    this.currentUser = user;
    if (user) {
      // User logged in, initialize dashboard
      this.init();
    }
  }

  private showUserMenu(): void {
    if (this.currentUser && !this.userMenuElement) {
      this.userMenuElement = this.authUI.createUserMenu(
        this.currentUser,
        () => this.userSettingsUI.showSettingsDialog(),
        () => this.adminDashboardUI.showAdminDashboard()
      );
      document.body.appendChild(this.userMenuElement);
    }
  }

  private startAutoSave(): void {
    // Auto-save to server every 30 seconds
    this.autoSaveInterval = window.setInterval(() => {
      if (authService.isAuthenticated()) {
        authService.saveDashboard(this.state);
      }
    }, 30000);
  }

  private toggleFullscreen(): void {
    if (!document.fullscreenElement) {
      // Enter fullscreen
      document.documentElement.requestFullscreen().catch((err) => {
        console.log('Fullscreen request failed:', err);
      });
    } else {
      // Exit fullscreen
      document.exitFullscreen();
    }
  }

  private toggleLock(): void {
    this.isLocked = !this.isLocked;
    
    const app = document.getElementById('app')!;
    
    if (this.isLocked) {
      // Lock the dashboard
      app.classList.add('locked');
      this.lockButton.innerHTML = '🔒';
      this.lockButton.setAttribute('aria-label', 'Unlock dashboard');
      this.selectWidget(null);
    } else {
      // Unlock the dashboard
      app.classList.remove('locked');
      this.lockButton.innerHTML = '🔓';
      this.lockButton.setAttribute('aria-label', 'Lock dashboard');
    }
  }

  private setupDOM(): void {
    const app = document.getElementById('app')!;
    
    // Canvas
    this.canvas = document.createElement('div');
    this.canvas.className = 'canvas';
    this.canvas.setAttribute('role', 'main');
    
    this.canvasContent = document.createElement('div');
    this.canvasContent.className = 'canvas-content';
    this.canvas.appendChild(this.canvasContent);
    
    // Menu Button (hamburger icon)
    const menuButton = document.createElement('button');
    menuButton.className = 'menu-button';
    menuButton.innerHTML = '☰';
    menuButton.setAttribute('aria-label', 'Toggle menu');
    menuButton.setAttribute('title', 'Toggle menu');
    menuButton.addEventListener('click', () => this.toggleMenu());
    
    // Controls Container (slides out from left)
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'controls-container';
    controlsContainer.id = 'controls-container';
    
    // FAB (Add Widget)
    const fab = document.createElement('button');
    fab.className = 'fab';
    fab.innerHTML = '+';
    fab.setAttribute('aria-label', 'Add widget');
    fab.setAttribute('title', 'Add widget');
    fab.addEventListener('click', () => {
      this.showAddWidgetModal();
      this.closeMenu();
    });
    
    // Fullscreen Toggle
    const fullscreenToggle = document.createElement('button');
    fullscreenToggle.className = 'fullscreen-toggle';
    fullscreenToggle.innerHTML = '⛶';
    fullscreenToggle.setAttribute('aria-label', 'Toggle fullscreen');
    fullscreenToggle.setAttribute('title', 'Toggle fullscreen');
    fullscreenToggle.addEventListener('click', () => {
      this.toggleFullscreen();
      this.closeMenu();
    });
    
    // Theme Toggle
    const themeToggle = document.createElement('button');
    themeToggle.className = 'theme-toggle';
    themeToggle.innerHTML = '🌓';
    themeToggle.setAttribute('aria-label', 'Toggle theme');
    themeToggle.setAttribute('title', 'Toggle light/dark theme');
    themeToggle.addEventListener('click', () => {
      this.toggleTheme();
      this.closeMenu();
    });
    
    // Background Toggle
    const backgroundToggle = document.createElement('button');
    backgroundToggle.className = 'background-toggle';
    backgroundToggle.innerHTML = '◫';
    backgroundToggle.setAttribute('aria-label', 'Change background pattern');
    backgroundToggle.setAttribute('title', 'Change background pattern');
    backgroundToggle.addEventListener('click', () => {
      this.toggleBackground();
      this.closeMenu();
    });
    
    // Lock Toggle
    this.lockButton = document.createElement('button');
    this.lockButton.className = 'lock-toggle';
    this.lockButton.innerHTML = '🔓';
    this.lockButton.setAttribute('aria-label', 'Lock dashboard');
    this.lockButton.setAttribute('title', 'Lock dashboard (prevents editing)');
    this.lockButton.addEventListener('click', () => {
      this.toggleLock();
      this.closeMenu();
    });
    
    // Reset Zoom Button
    const resetZoomButton = document.createElement('button');
    resetZoomButton.className = 'reset-zoom-toggle';
    resetZoomButton.innerHTML = '1:1';
    resetZoomButton.setAttribute('aria-label', 'Reset zoom to 100%');
    resetZoomButton.setAttribute('title', 'Reset zoom to 100%');
    resetZoomButton.addEventListener('click', () => {
      this.resetZoom();
      this.closeMenu();
    });
    
    // Auto-Arrange Button
    const autoArrangeButton = document.createElement('button');
    autoArrangeButton.className = 'auto-arrange-toggle';
    autoArrangeButton.innerHTML = '⚡';
    autoArrangeButton.setAttribute('aria-label', 'Auto-arrange widgets');
    autoArrangeButton.setAttribute('title', 'Auto-arrange and resize widgets to fit content');
    autoArrangeButton.addEventListener('click', () => {
      this.autoArrangeWidgets();
      this.closeMenu();
    });
    
    // Dashboard Switcher Button
    const dashboardSwitcher = document.createElement('button');
    dashboardSwitcher.className = 'dashboard-switcher';
    dashboardSwitcher.innerHTML = '🎛️';
    dashboardSwitcher.setAttribute('aria-label', 'Switch dashboard');
    dashboardSwitcher.setAttribute('title', 'Manage dashboards');
    dashboardSwitcher.addEventListener('click', () => {
      this.showDashboardManager();
      this.closeMenu();
    });
    
    // Add all buttons to controls container
    controlsContainer.appendChild(fab);
    controlsContainer.appendChild(fullscreenToggle);
    controlsContainer.appendChild(this.lockButton);
    controlsContainer.appendChild(resetZoomButton);
    controlsContainer.appendChild(autoArrangeButton);
    controlsContainer.appendChild(dashboardSwitcher);
    controlsContainer.appendChild(themeToggle);
    controlsContainer.appendChild(backgroundToggle);
    
    app.appendChild(this.canvas);
    app.appendChild(menuButton);
    app.appendChild(controlsContainer);
    
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!menuButton.contains(target) && !controlsContainer.contains(target)) {
        this.closeMenu();
      }
    });
  }
  
  private toggleMenu(): void {
    const container = document.getElementById('controls-container');
    if (container) {
      container.classList.toggle('open');
    }
  }
  
  private closeMenu(): void {
    const container = document.getElementById('controls-container');
    if (container) {
      container.classList.remove('open');
    }
  }

  private setupTheme(): void {
    const root = document.documentElement;
    
    if (this.state.theme === 'dark') {
      root.classList.add('theme-dark');
      root.classList.remove('theme-light');
    } else if (this.state.theme === 'light') {
      root.classList.add('theme-light');
      root.classList.remove('theme-dark');
    } else {
      root.classList.remove('theme-dark', 'theme-light');
    }
  }

  private toggleTheme(): void {
    const themes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
    const currentIndex = themes.indexOf(this.state.theme);
    this.state.theme = themes[(currentIndex + 1) % themes.length];
    this.setupTheme();
    this.save();
  }

  private setupBackground(): void {
    this.canvas.setAttribute('data-background', this.state.background);
  }

  private toggleBackground(): void {
    const backgrounds: Array<'grid' | 'dots' | 'lines' | 'solid'> = ['grid', 'dots', 'lines', 'solid'];
    const currentIndex = backgrounds.indexOf(this.state.background);
    this.state.background = backgrounds[(currentIndex + 1) % backgrounds.length];
    this.setupBackground();
    this.save();
  }

  private setupEventListeners(): void {
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    
    // Widget events
    document.addEventListener('widget-update', ((e: CustomEvent) => {
      this.updateWidgetContent(e.detail.id, e.detail.content);
    }) as EventListener);
    
    // Widget delete event
    window.addEventListener('widget-delete', ((e: CustomEvent) => {
      this.deleteWidget(e.detail.widgetId);
    }) as EventListener);
    
    // Pointer events for drag/resize
    this.canvasContent.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
    document.addEventListener('pointermove', (e) => this.handlePointerMove(e));
    document.addEventListener('pointerup', () => this.handlePointerUp());
    
    // Click outside to deselect
    this.canvas.addEventListener('click', (e) => {
      if (e.target === this.canvas || e.target === this.canvasContent) {
        this.selectWidget(null);
      }
    });
    
    // Mouse wheel zoom
    this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
    
    // Touch events for pinch zoom
    this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    this.canvas.addEventListener('touchend', () => this.handleTouchEnd());
  }

  private handleKeyboard(e: KeyboardEvent): void {
    // Ignore all input when locked
    if (this.isLocked) return;
    
    // Undo/Redo
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      this.undo();
      return;
    }
    
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
      e.preventDefault();
      this.redo();
      return;
    }
    
    // Widget manipulation
    if (!this.selectedWidgetId) return;
    
    const widget = this.state.widgets.find(w => w.id === this.selectedWidgetId);
    if (!widget) return;
    
    const step = e.shiftKey ? 10 * this.state.grid : this.state.grid;
    
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        widget.position.y -= step;
        this.updateWidget(widget);
        break;
      case 'ArrowDown':
        e.preventDefault();
        widget.position.y += step;
        this.updateWidget(widget);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        widget.position.x -= step;
        this.updateWidget(widget);
        break;
      case 'ArrowRight':
        e.preventDefault();
        widget.position.x += step;
        this.updateWidget(widget);
        break;
      case 'Escape':
        this.selectWidget(null);
        break;
    }
  }

  private handlePointerDown(e: PointerEvent): void {
    // Ignore all interactions when locked
    if (this.isLocked) return;
    
    const target = e.target as HTMLElement;
    
    // Find widget element
    const widgetEl = target.closest('.widget') as HTMLElement;
    if (!widgetEl) {
      // Clicked on canvas background - start panning
      if (target === this.canvas || target === this.canvasContent) {
        e.preventDefault();
        this.startPan(e);
      }
      return;
    }
    
    const widgetId = widgetEl.id.replace('widget-', '');
    const widget = this.state.widgets.find(w => w.id === widgetId);
    if (!widget) return;
    
    this.selectWidget(widgetId);
    
    // Check if clicking resize handle
    if (target.classList.contains('resize-handle')) {
      e.preventDefault();
      this.startResize(widgetId, target.dataset.direction!, e);
      return;
    }
    
    // Start drag if clicking header or widget body
    if (target.classList.contains('widget-header') || target.classList.contains('widget')) {
      e.preventDefault();
      this.startDrag(widgetId, e);
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    if (this.dragState) {
      e.preventDefault();
      this.updateDrag(e);
    } else if (this.resizeState) {
      e.preventDefault();
      this.updateResize(e);
    } else if (this.panState) {
      e.preventDefault();
      this.updatePan(e);
    }
  }

  private handlePointerUp(): void {
    if (this.dragState || this.resizeState) {
      this.saveHistory();
      this.save(); // Save after drag/resize is complete
    }
    
    // Save viewport position after panning
    if (this.panState) {
      this.save();
    }
    
    this.dragState = null;
    this.resizeState = null;
    this.panState = null;
    
    // Clear snap guides
    this.clearSnapGuides();
    
    // Reset cursor
    if (this.canvas) {
      this.canvas.style.cursor = '';
    }
  }

  private showSnapGuides(snapTargets: { x: number | null; y: number | null }): void {
    this.clearSnapGuides();
    
    if (snapTargets.x !== null) {
      const guide = document.createElement('div');
      guide.className = 'snap-guide snap-guide-vertical';
      guide.style.left = `${snapTargets.x}px`;
      this.canvasContent.appendChild(guide);
      this.snapGuides.push(guide);
    }
    
    if (snapTargets.y !== null) {
      const guide = document.createElement('div');
      guide.className = 'snap-guide snap-guide-horizontal';
      guide.style.top = `${snapTargets.y}px`;
      this.canvasContent.appendChild(guide);
      this.snapGuides.push(guide);
    }
  }
  
  private clearSnapGuides(): void {
    this.snapGuides.forEach(guide => guide.remove());
    this.snapGuides = [];
  }

  private startDrag(widgetId: string, e: PointerEvent): void {
    const widget = this.state.widgets.find(w => w.id === widgetId);
    if (!widget) return;
    
    this.dragState = {
      widgetId,
      startPos: { ...widget.position },
      startMousePos: { x: e.clientX, y: e.clientY }
    };
  }

  private findSnapTargets(widget: Widget, otherWidgets: Widget[]): { x: number | null; y: number | null; w: number | null; h: number | null } {
    let snapX: number | null = null;
    let snapY: number | null = null;
    let snapW: number | null = null;
    let snapH: number | null = null;
    
    const widgetLeft = widget.position.x;
    const widgetRight = widget.position.x + widget.size.w;
    const widgetTop = widget.position.y;
    const widgetBottom = widget.position.y + widget.size.h;
    
    for (const other of otherWidgets) {
      if (other.id === widget.id) continue;
      
      const otherLeft = other.position.x;
      const otherRight = other.position.x + other.size.w;
      const otherTop = other.position.y;
      const otherBottom = other.position.y + other.size.h;
      
      // Check for horizontal edge snapping
      if (Math.abs(widgetLeft - otherRight) < this.SNAP_THRESHOLD) {
        snapX = otherRight;
      } else if (Math.abs(widgetRight - otherLeft) < this.SNAP_THRESHOLD) {
        snapX = otherLeft - widget.size.w;
      } else if (Math.abs(widgetLeft - otherLeft) < this.SNAP_THRESHOLD) {
        snapX = otherLeft;
      } else if (Math.abs(widgetRight - otherRight) < this.SNAP_THRESHOLD) {
        snapX = otherRight - widget.size.w;
      }
      
      // Check for vertical edge snapping
      if (Math.abs(widgetTop - otherBottom) < this.SNAP_THRESHOLD) {
        snapY = otherBottom;
      } else if (Math.abs(widgetBottom - otherTop) < this.SNAP_THRESHOLD) {
        snapY = otherTop - widget.size.h;
      } else if (Math.abs(widgetTop - otherTop) < this.SNAP_THRESHOLD) {
        snapY = otherTop;
      } else if (Math.abs(widgetBottom - otherBottom) < this.SNAP_THRESHOLD) {
        snapY = otherBottom - widget.size.h;
      }
      
      // Check for width matching (when horizontally aligned)
      const verticalOverlap = !(widgetBottom < otherTop || widgetTop > otherBottom);
      if (verticalOverlap && Math.abs(widget.size.w - other.size.w) < this.SNAP_THRESHOLD) {
        snapW = other.size.w;
      }
      
      // Check for height matching (when vertically aligned)
      const horizontalOverlap = !(widgetRight < otherLeft || widgetLeft > otherRight);
      if (horizontalOverlap && Math.abs(widget.size.h - other.size.h) < this.SNAP_THRESHOLD) {
        snapH = other.size.h;
      }
    }
    
    return { x: snapX, y: snapY, w: snapW, h: snapH };
  }

  private updateDrag(e: PointerEvent): void {
    if (!this.dragState) return;
    
    const widget = this.state.widgets.find(w => w.id === this.dragState!.widgetId);
    if (!widget) return;
    
    const dx = (e.clientX - this.dragState.startMousePos.x) / this.state.zoom;
    const dy = (e.clientY - this.dragState.startMousePos.y) / this.state.zoom;
    
    // Calculate new position with grid snapping
    let newX = snapToGrid(this.dragState.startPos.x + dx, this.state.grid);
    let newY = snapToGrid(this.dragState.startPos.y + dy, this.state.grid);
    
    // Temporarily update position for snap detection
    widget.position.x = newX;
    widget.position.y = newY;
    
    // Find snap targets
    const snapTargets = this.findSnapTargets(widget, this.state.widgets);
    
    // Apply snapping if found
    if (snapTargets.x !== null) {
      newX = snapTargets.x;
    }
    if (snapTargets.y !== null) {
      newY = snapTargets.y;
    }
    
    widget.position.x = newX;
    widget.position.y = newY;
    
    // Show visual guides
    this.showSnapGuides({ x: snapTargets.x, y: snapTargets.y });
    
    // Don't save during drag - only update visuals
    this.updateWidget(widget, false);
  }

  private startResize(widgetId: string, direction: string, e: PointerEvent): void {
    const widget = this.state.widgets.find(w => w.id === widgetId);
    if (!widget) return;
    
    this.resizeState = {
      widgetId,
      direction,
      startSize: { ...widget.size },
      startPos: { ...widget.position },
      startMousePos: { x: e.clientX, y: e.clientY }
    };
  }

  private updateResize(e: PointerEvent): void {
    if (!this.resizeState) return;
    
    const widget = this.state.widgets.find(w => w.id === this.resizeState!.widgetId);
    if (!widget) return;
    
    const dx = (e.clientX - this.resizeState.startMousePos.x) / this.state.zoom;
    const dy = (e.clientY - this.resizeState.startMousePos.y) / this.state.zoom;
    const dir = this.resizeState.direction;
    
    let newSize = { ...this.resizeState.startSize };
    let newPos = { ...this.resizeState.startPos };
    
    if (dir.includes('e')) newSize.w += dx;
    if (dir.includes('w')) {
      newSize.w -= dx;
      newPos.x += dx;
    }
    if (dir.includes('s')) newSize.h += dy;
    if (dir.includes('n')) {
      newSize.h -= dy;
      newPos.y += dy;
    }
    
    newSize = constrainSize(newSize);
    
    // Temporarily update widget for snap detection
    widget.size = newSize;
    widget.position = newPos;
    
    // Find snap targets for size matching
    const snapTargets = this.findSnapTargets(widget, this.state.widgets);
    
    // Apply size snapping if found
    if (snapTargets.w !== null && (dir.includes('e') || dir.includes('w'))) {
      const widthDiff = snapTargets.w - newSize.w;
      newSize.w = snapTargets.w;
      // Adjust position if resizing from west
      if (dir.includes('w')) {
        newPos.x -= widthDiff;
      }
    }
    
    if (snapTargets.h !== null && (dir.includes('n') || dir.includes('s'))) {
      const heightDiff = snapTargets.h - newSize.h;
      newSize.h = snapTargets.h;
      // Adjust position if resizing from north
      if (dir.includes('n')) {
        newPos.y -= heightDiff;
      }
    }
    
    // Apply edge snapping when resizing
    if (dir.includes('e') && snapTargets.x !== null) {
      const targetRight = snapTargets.x + newSize.w;
      // Find the right edge we're snapping to
      for (const other of this.state.widgets) {
        if (other.id === widget.id) continue;
        const otherLeft = other.position.x;
        if (Math.abs(targetRight - otherLeft) < this.SNAP_THRESHOLD) {
          newSize.w = otherLeft - newPos.x;
          break;
        }
      }
    }
    
    if (dir.includes('s') && snapTargets.y !== null) {
      const targetBottom = snapTargets.y + newSize.h;
      // Find the bottom edge we're snapping to
      for (const other of this.state.widgets) {
        if (other.id === widget.id) continue;
        const otherTop = other.position.y;
        if (Math.abs(targetBottom - otherTop) < this.SNAP_THRESHOLD) {
          newSize.h = otherTop - newPos.y;
          break;
        }
      }
    }
    
    widget.size = newSize;
    widget.position = newPos;
    
    // Show visual guides for snapped edges
    this.showSnapGuides({ x: snapTargets.x, y: snapTargets.y });
    
    // Don't save during resize - only update visuals
    this.updateWidget(widget, false);
  }

  private startPan(e: PointerEvent): void {
    this.panState = {
      startScrollX: this.canvasContent.offsetLeft,
      startScrollY: this.canvasContent.offsetTop,
      startMousePos: { x: e.clientX, y: e.clientY }
    };
    this.canvas.style.cursor = 'grabbing';
  }

  private updatePan(e: PointerEvent): void {
    if (!this.panState) return;
    
    const dx = e.clientX - this.panState.startMousePos.x;
    const dy = e.clientY - this.panState.startMousePos.y;
    
    const newX = this.panState.startScrollX + dx;
    const newY = this.panState.startScrollY + dy;
    
    this.canvasContent.style.left = `${newX}px`;
    this.canvasContent.style.top = `${newY}px`;
    
    // Update state viewport
    this.state.viewport.x = newX;
    this.state.viewport.y = newY;
  }

  private handleWheel(e: WheelEvent): void {
    // Only zoom if cursor is over the canvas background, not over a widget
    const target = e.target as HTMLElement;
    const isOverWidget = target.closest('.widget');
    
    if (isOverWidget) {
      // Let the widget handle scrolling
      return;
    }
    
    // Don't zoom when dashboard is locked
    if (this.isLocked) {
      return;
    }
    
    e.preventDefault();
    
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newZoom = Math.max(0.1, Math.min(3, this.state.zoom + delta));
    
    if (newZoom !== this.state.zoom) {
      this.state.zoom = newZoom;
      this.applyZoom();
      this.save();
    }
  }

  private handleTouchStart(e: TouchEvent): void {
    if (e.touches.length === 2) {
      e.preventDefault();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      this.lastTouchDistance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    if (e.touches.length === 2) {
      e.preventDefault();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      
      if (this.lastTouchDistance > 0) {
        const scale = distance / this.lastTouchDistance;
        const newZoom = Math.max(0.1, Math.min(3, this.state.zoom * scale));
        
        if (newZoom !== this.state.zoom) {
          this.state.zoom = newZoom;
          this.applyZoom();
        }
      }
      
      this.lastTouchDistance = distance;
    }
  }

  private handleTouchEnd(): void {
    this.lastTouchDistance = 0;
    this.save();
  }

  private applyZoom(): void {
    this.canvasContent.style.transform = `scale(${this.state.zoom})`;
    this.canvasContent.style.transformOrigin = 'top left';
    
    // Restore viewport position
    this.canvasContent.style.left = `${this.state.viewport.x}px`;
    this.canvasContent.style.top = `${this.state.viewport.y}px`;
  }

  private resetZoom(): void {
    this.state.zoom = 1.0;
    this.applyZoom();
    this.save();
  }

  private autoArrangeWidgets(): void {
    if (this.state.widgets.length === 0) return;
    
    // First, resize all widgets to fit their content
    this.state.widgets.forEach(widget => {
      this.resizeToFitContent(widget);
    });
    
    // Get viewport dimensions
    const viewportWidth = this.canvas.clientWidth / this.state.zoom;
    const viewportHeight = this.canvas.clientHeight / this.state.zoom;
    
    // Keep widgets in their original order (don't sort)
    const widgetsToArrange = [...this.state.widgets];
    
    // Starting position
    const padding = 20;
    let currentX = padding;
    let currentY = padding;
    let rowHeight = 0;
    let maxRowWidth = viewportWidth - padding;
    
    widgetsToArrange.forEach(widget => {
      // Check if widget fits in current row
      if (currentX + widget.size.w > maxRowWidth && currentX > padding) {
        // Move to next row
        currentX = padding;
        currentY += rowHeight + padding;
        rowHeight = 0;
      }
      
      // Place widget
      widget.position.x = currentX;
      widget.position.y = currentY;
      
      // Update position for next widget
      currentX += widget.size.w + padding;
      rowHeight = Math.max(rowHeight, widget.size.h);
      
      this.updateWidget(widget);
    });
    
    this.saveHistory();
    this.save();
  }

  private resizeToFitContent(widget: Widget): void {
    const el = document.getElementById(`widget-${widget.id}`);
    if (!el) return;
    
    const content = el.querySelector('.widget-content') as HTMLElement;
    if (!content) return;
    
    const header = el.querySelector('.widget-header') as HTMLElement;
    const headerHeight = header ? header.offsetHeight : 40;
    
    // Calculate ideal size based on widget type
    let idealWidth = widget.size.w;
    let idealHeight = widget.size.h;
    
    switch (widget.type) {
      case 'text':
      case 'data': {
        const textarea = content.querySelector('textarea') as HTMLTextAreaElement;
        if (textarea) {
          // Create a temporary clone to measure actual content
          const clone = textarea.cloneNode(true) as HTMLTextAreaElement;
          clone.style.position = 'absolute';
          clone.style.visibility = 'hidden';
          clone.style.height = 'auto';
          clone.style.width = 'auto';
          clone.style.minHeight = '0';
          clone.style.maxHeight = 'none';
          clone.style.minWidth = '0';
          clone.style.maxWidth = 'none';
          clone.style.whiteSpace = 'pre-wrap';
          clone.style.overflowY = 'hidden';
          clone.style.overflowX = 'hidden';
          
          document.body.appendChild(clone);
          
          // Measure natural size
          const naturalWidth = clone.scrollWidth + 20; // Add padding
          const naturalHeight = clone.scrollHeight + 20; // Add padding
          
          document.body.removeChild(clone);
          
          // Set size with reasonable limits
          idealWidth = Math.max(300, Math.min(1200, naturalWidth));
          idealHeight = Math.max(150, Math.min(1000, naturalHeight + headerHeight + 20));
        }
        break;
      }
      
      case 'image': {
        const img = content.querySelector('img') as HTMLImageElement;
        if (img && img.complete && img.naturalWidth) {
          const aspectRatio = img.naturalWidth / img.naturalHeight;
          const maxWidth = 1000;
          const maxHeight = 800;
          
          let targetWidth = img.naturalWidth;
          let targetHeight = img.naturalHeight;
          
          // Scale down if too large
          if (targetWidth > maxWidth || targetHeight > maxHeight) {
            if (aspectRatio > 1) {
              targetWidth = maxWidth;
              targetHeight = maxWidth / aspectRatio;
            } else {
              targetHeight = maxHeight;
              targetWidth = maxHeight * aspectRatio;
            }
          }
          
          idealWidth = targetWidth + 40; // Add space for borders/padding
          idealHeight = targetHeight + headerHeight + 40;
        }
        break;
      }
      
      case 'weather': {
        // Weather widget has a fixed layout with current weather + 5-day forecast
        // Need enough space for all content without scrollbars
        idealWidth = 340;
        idealHeight = 580;
        break;
      }
      
      case 'clock': {
        // Clock widget has a relatively fixed layout
        // Size depends on whether timezone is shown
        const clockContent = widget.content as { timezone?: string; format?: string; showTimezone?: boolean };
        const showTimezone = clockContent.showTimezone !== false; // Default to true
        
        idealWidth = 300;
        idealHeight = showTimezone ? 200 : 100;
        break;
      }
      
      case 'embed': {
        // For embeds, maintain aspect ratio or use current size
        // Common embed sizes: 16:9 video ratio
        idealWidth = Math.max(400, widget.size.w);
        idealHeight = Math.max(300, widget.size.h);
        break;
      }
      
      case 'rss': {
        // RSS feed widget needs space for multiple items
        const rssContent = widget.content as { maxItems?: number };
        const itemCount = rssContent.maxItems || 10;
        // Each item is ~100px, plus header ~80px
        idealWidth = 400;
        idealHeight = Math.min(800, 80 + itemCount * 100);
        break;
      }
      
      case 'uptime': {
        // Uptime widget with bar chart
        idealWidth = 500;
        idealHeight = 300;
        break;
      }
    }
    
    // Apply the new size
    widget.size.w = snapToGrid(idealWidth, this.state.grid);
    widget.size.h = snapToGrid(idealHeight, this.state.grid);
    
    // Ensure minimum size
    widget.size = constrainSize(widget.size);
    
    // Force a re-render
    this.updateWidget(widget);
  }

  private selectWidget(widgetId: string | null): void {
    // Remove previous selection
    if (this.selectedWidgetId) {
      const prevEl = document.getElementById(`widget-${this.selectedWidgetId}`);
      prevEl?.classList.remove('selected');
    }
    
    this.selectedWidgetId = widgetId;
    
    // Add new selection
    if (widgetId) {
      const el = document.getElementById(`widget-${widgetId}`);
      el?.classList.add('selected');
      el?.focus();
    }
  }

  private addWidget(type: WidgetType, content: any): void {
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    // Get viewport center
    const viewportCenterX = this.canvas.scrollLeft + this.canvas.clientWidth / 2;
    const viewportCenterY = this.canvas.scrollTop + this.canvas.clientHeight / 2;
    
    // Set size based on widget type
    const size = type === 'clock' 
      ? { w: 400, h: 500 }
      : { ...DEFAULT_WIDGET_SIZE };
    
    const widget: Widget = {
      id,
      type,
      position: {
        x: snapToGrid(viewportCenterX - size.w / 2, this.state.grid),
        y: snapToGrid(viewportCenterY - size.h / 2, this.state.grid)
      },
      size,
      autoSize: { width: false, height: false },
      z: this.state.widgets.length,
      content,
      meta: {
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    };
    
    this.state.widgets.push(widget);
    this.renderWidget(widget);
    this.selectWidget(id);
    this.saveHistory();
    this.save();
  }

  private updateWidget(widget: Widget, shouldSave: boolean = true): void {
    if (widget.meta) {
      widget.meta.updatedAt = Date.now();
    } else {
      widget.meta = {
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
    }
    
    const el = document.getElementById(`widget-${widget.id}`);
    if (el) {
      updateWidgetPosition(el, widget.position);
      updateWidgetSize(el, widget.size);
      updateWidgetZIndex(el, widget.z);
    }
    
    if (shouldSave) {
      this.save();
    }
  }

  private updateWidgetContent(widgetId: string, content: any): void {
    const widget = this.state.widgets.find(w => w.id === widgetId);
    if (!widget) return;
    
    widget.content = { ...widget.content, ...content };
    if (widget.meta) {
      widget.meta.updatedAt = Date.now();
    } else {
      widget.meta = {
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
    }
    
    // Re-render widget
    const el = document.getElementById(`widget-${widgetId}`);
    if (el) {
      el.remove();
      this.renderWidget(widget);
    }
    
    this.saveHistory();
    this.save();
  }

  private duplicateWidget(widgetId: string): void {
    const widget = this.state.widgets.find(w => w.id === widgetId);
    if (!widget) return;
    
    const newWidget: Widget = {
      ...JSON.parse(JSON.stringify(widget)),
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      position: {
        x: widget.position.x + 20,
        y: widget.position.y + 20
      },
      z: this.state.widgets.length,
      meta: {
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    };
    
    this.state.widgets.push(newWidget);
    this.renderWidget(newWidget);
    this.selectWidget(newWidget.id);
    this.saveHistory();
    this.save();
  }

  private deleteWidget(widgetId: string): void {
    const index = this.state.widgets.findIndex(w => w.id === widgetId);
    if (index === -1) return;
    
    this.state.widgets.splice(index, 1);
    
    const el = document.getElementById(`widget-${widgetId}`);
    el?.remove();
    
    if (this.selectedWidgetId === widgetId) {
      this.selectWidget(null);
    }
    
    this.saveHistory();
    this.save();
  }

  private toggleAutoSize(widgetId: string): void {
    const widget = this.state.widgets.find(w => w.id === widgetId);
    if (!widget) return;
    
    widget.autoSize.width = !widget.autoSize.width;
    widget.autoSize.height = !widget.autoSize.height;
    
    // TODO: Implement actual auto-sizing based on content
    
    this.saveHistory();
    this.save();
  }

  private bringForward(widgetId: string): void {
    const widget = this.state.widgets.find(w => w.id === widgetId);
    if (!widget) return;
    
    const maxZ = Math.max(...this.state.widgets.map(w => w.z));
    widget.z = maxZ + 1;
    
    this.updateWidget(widget);
    this.saveHistory();
  }

  private async showAddWidgetModal(): Promise<void> {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    
    const header = document.createElement('div');
    header.className = 'modal-header';
    
    const title = document.createElement('h2');
    title.className = 'modal-title';
    title.textContent = 'Add Widget';
    header.appendChild(title);
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.innerHTML = '×';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.addEventListener('click', () => overlay.remove());
    header.appendChild(closeBtn);
    
    const types = document.createElement('div');
    types.className = 'widget-types';
    
    // Get all registered widgets from the plugin system
    const { getAllWidgetPlugins } = await import('./widgets/types');
    const plugins = getAllWidgetPlugins();
    
    plugins.forEach((plugin: any) => {
      const row = document.createElement('button');
      row.className = 'widget-type-row';
      row.tabIndex = 0;
      
      const icon = document.createElement('div');
      icon.className = 'widget-type-icon';
      icon.textContent = plugin.icon;
      
      const content = document.createElement('div');
      content.className = 'widget-type-content';
      
      const name = document.createElement('div');
      name.className = 'widget-type-name';
      name.textContent = plugin.name;
      
      const description = document.createElement('div');
      description.className = 'widget-type-description';
      description.textContent = plugin.description || '';
      
      content.appendChild(name);
      content.appendChild(description);
      
      row.appendChild(icon);
      row.appendChild(content);
      
      row.addEventListener('click', () => {
        this.addWidget(plugin.type as WidgetType, plugin.defaultContent || {});
        overlay.remove();
      });
      
      types.appendChild(row);
    });
    
    modal.appendChild(header);
    modal.appendChild(types);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Focus trap
    const focusableElements = modal.querySelectorAll('button');
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;
    
    firstElement?.focus();
    
    // ESC to close
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', handleKeyDown);
      }
      
      // Tab trap
      if (e.key === 'Tab') {
        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    
    // Click outside to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        document.removeEventListener('keydown', handleKeyDown);
      }
    });
  }

  private showDashboardManager(): void {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    
    const header = document.createElement('div');
    header.className = 'modal-header';
    
    const title = document.createElement('h2');
    title.className = 'modal-title';
    title.textContent = 'Manage Dashboards';
    header.appendChild(title);
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.innerHTML = '×';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.addEventListener('click', () => overlay.remove());
    header.appendChild(closeBtn);
    
    const content = document.createElement('div');
    content.className = 'dashboard-manager-content';
    content.style.cssText = `
      padding: 20px;
      max-height: 500px;
      overflow-y: auto;
    `;
    
    // Get all dashboards
    const dashboards = getAllDashboards();
    const activeDashboardId = getActiveDashboardId();
    
    // Dashboard list
    const listContainer = document.createElement('div');
    listContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 20px;
    `;
    
    dashboards.forEach(dashboard => {
      const dashboardRow = document.createElement('div');
      dashboardRow.style.cssText = `
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: var(--surface-hover);
        border: 2px solid ${dashboard.id === activeDashboardId ? 'var(--accent)' : 'var(--border)'};
        border-radius: 8px;
        transition: border-color 0.2s;
      `;
      
      // Dashboard name (editable)
      const nameSpan = document.createElement('span');
      nameSpan.style.cssText = `
        flex: 1;
        font-weight: ${dashboard.id === activeDashboardId ? '600' : '400'};
        color: var(--text);
        cursor: pointer;
      `;
      nameSpan.textContent = dashboard.name + (dashboard.id === activeDashboardId ? ' (Active)' : '');
      nameSpan.addEventListener('click', () => {
        if (dashboard.id !== activeDashboardId) {
          this.switchToDashboard(dashboard.id);
          overlay.remove();
        }
      });
      
      // Rename button
      const renameBtn = document.createElement('button');
      renameBtn.innerHTML = '✏️';
      renameBtn.title = 'Rename';
      renameBtn.style.cssText = `
        padding: 6px 10px;
        background: var(--accent);
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
      `;
      renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const newName = prompt('Enter new dashboard name:', dashboard.name);
        if (newName && newName.trim()) {
          renameDashboard(dashboard.id, newName.trim());
          overlay.remove();
          this.showDashboardManager();
        }
      });
      
      // Delete button (only if not the last dashboard)
      if (dashboards.length > 1) {
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '🗑️';
        deleteBtn.title = 'Delete';
        deleteBtn.style.cssText = `
          padding: 6px 10px;
          background: #f44336;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        `;
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const widgetCount = dashboard.state.widgets.length;
          const message = widgetCount > 0 
            ? `Delete dashboard "${dashboard.name}"? This will delete ${widgetCount} widget${widgetCount > 1 ? 's' : ''}. This cannot be undone.`
            : `Delete dashboard "${dashboard.name}"? This cannot be undone.`;
          
          if (confirm(message)) {
            const wasActive = dashboard.id === activeDashboardId;
            deleteDashboard(dashboard.id);
            overlay.remove();
            
            if (wasActive) {
              // Switch to the new active dashboard (deleteDashboard already changed activeDashboardId)
              const newActiveDashboardId = getActiveDashboardId();
              this.switchToDashboard(newActiveDashboardId);
            } else {
              this.showDashboardManager();
            }
          }
        });
        dashboardRow.appendChild(renameBtn);
        dashboardRow.appendChild(deleteBtn);
      } else {
        dashboardRow.appendChild(renameBtn);
      }
      
      dashboardRow.appendChild(nameSpan);
      dashboardRow.insertBefore(nameSpan, dashboardRow.firstChild);
      
      listContainer.appendChild(dashboardRow);
    });
    
    content.appendChild(listContainer);
    
    // Add new dashboard button
    const addButton = document.createElement('button');
    addButton.textContent = '+ New Dashboard';
    addButton.style.cssText = `
      width: 100%;
      padding: 12px;
      background: var(--accent);
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
    `;
    addButton.addEventListener('click', () => {
      const name = prompt('Enter dashboard name:', `Dashboard ${dashboards.length + 1}`);
      if (name && name.trim()) {
        const newDashboard = createDashboard(name.trim());
        overlay.remove();
        // Switch to the new dashboard
        this.switchToDashboard(newDashboard.id);
      }
    });
    content.appendChild(addButton);
    
    modal.appendChild(header);
    modal.appendChild(content);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });
    
    // Close on ESC
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
  }

  private switchToDashboard(dashboardId: string): void {
    // Clean up current widgets before switching
    this.cleanup();
    
    // Switch to new dashboard
    const newState = switchDashboard(dashboardId);
    if (newState) {
      this.state = newState;
      this.history = createHistoryManager();
      this.render();
      this.setupTheme();
      this.setupBackground();
      this.save();
    }
  }

  private cleanup(): void {
    // Stop all widget refresh intervals and cleanup
    this.state.widgets.forEach(widget => {
      const widgetElement = document.getElementById(`widget-${widget.id}`);
      if (widgetElement) {
        // Dispatch cleanup event for widgets to stop intervals
        const event = new CustomEvent('widget-cleanup', {
          detail: { widgetId: widget.id }
        });
        widgetElement.dispatchEvent(event);
      }
    });
    
    // Clear any intervals we might have
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
  }

  private render(): void {
    this.canvasContent.innerHTML = '';
    this.state.widgets.forEach(widget => this.renderWidget(widget));
    this.applyZoom();
  }

  private renderWidget(widget: Widget): void {
    const el = createWidgetElement(widget, this.state.grid);
    this.canvasContent.appendChild(el);
  }

  private saveHistory(): void {
    if (!shouldCoalesceAction('')) {
      this.history.push(JSON.parse(JSON.stringify(this.state)));
    }
  }

  private save(): void {
    debouncedSave(this.state);
    // Also save to server if authenticated
    if (authService.isAuthenticated()) {
      authService.saveDashboard(this.state).catch(err => {
        console.error('Failed to save dashboard to server:', err);
      });
    }
  }

  private undo(): void {
    const previous = this.history.undo();
    if (previous) {
      this.state = JSON.parse(JSON.stringify(previous));
      this.render();
      saveState(this.state);
    }
  }

  private redo(): void {
    const next = this.history.redo();
    if (next) {
      this.state = JSON.parse(JSON.stringify(next));
      this.render();
      saveState(this.state);
    }
  }
}

// Initialize dashboard
new Dashboard();
