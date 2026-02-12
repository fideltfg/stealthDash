import type { DashboardState, Widget, Vec2, Size, WidgetType, MultiDashboardState, Theme } from './types/types';
import { DEFAULT_WIDGET_SIZE } from './types/types';
import { getDefaultState, getAllDashboards, createDashboard, deleteDashboard, renameDashboard, switchDashboard, getActiveDashboardId, generateUUID } from './components/storage';
import { createHistoryManager, shouldCoalesceAction } from './components/history';
import { createWidgetElement, updateWidgetPosition, updateWidgetSize, updateWidgetZIndex, snapToGrid, constrainSize } from './types/widget';
import { loadWidgetModule, loadWidgetModules } from './types/widget-loader';
import { authService, type User } from './services/auth';
import { dashboardStorage } from './services/dashboardStorage';
import { AuthUI } from './components/AuthUI';
import { UserSettingsUI } from './components/UserSettingsUI';
import { AdminDashboardUI } from './components/AdminDashboardUI';
import { CredentialsUI } from './components/CredentialsUI';

class Dashboard {
  private state: DashboardState;
  private multiState: MultiDashboardState | null = null; // Cached multi-dashboard state
  private history = createHistoryManager();
  private canvas!: HTMLElement;
  private canvasContent!: HTMLElement;
  private selectedWidgetId: string | null = null;
  private dragState: { widgetId: string; startPos: Vec2; startMousePos: Vec2 } | null = null;
  private resizeState: { widgetId: string; direction: string; startSize: Size; startPos: Vec2; startMousePos: Vec2 } | null = null;
  private panState: { startScrollX: number; startScrollY: number; startMousePos: Vec2 } | null = null;
  private lastTouchDistance: number = 0;
  private touchStartX: number = 0;
  private touchStartY: number = 0;
  private touchStartTime: number = 0;
  private isLocked: boolean = false;
  private lockButton!: HTMLElement;
  private readonly SNAP_DISTANCE = 10; // pixels to snap to nearby edges
  private readonly SNAP_THRESHOLD = 15; // distance at which snapping occurs
  private readonly PAN_LIMIT = 1000; // Maximum distance to pan from origin (in pixels)
  private snapGuides: HTMLElement[] = [];
  private authUI: AuthUI;
  private userSettingsUI: UserSettingsUI;
  private adminDashboardUI: AdminDashboardUI;
  private credentialsUI: CredentialsUI;
  private currentUser: User | null = null;
  private userMenuElement: HTMLElement | null = null;
  private autoSaveInterval: number | null = null;

  constructor() {
    this.authUI = new AuthUI(this.handleAuthChange.bind(this));
    this.userSettingsUI = new UserSettingsUI();
    this.adminDashboardUI = new AdminDashboardUI();
    this.credentialsUI = new CredentialsUI();
    this.state = getDefaultState();
    this.init();
  }

  private async init(): Promise<void> {
    //console.log('🚀 Init called, isAuthenticated:', authService.isAuthenticated());
    
    // Check for public dashboard view
    const hash = window.location.hash;
    if (hash.startsWith('#/public/')) {
      const dashboardId = hash.replace('#/public/', '');
      await this.loadPublicDashboard(dashboardId);
      return;
    }
    
    // Check for password reset token in URL hash
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

      // Load dashboards from server (primary source of truth)
      this.multiState = await dashboardStorage.loadDashboards();

      // Get the active dashboard's state
      const activeDashboard = this.multiState.dashboards.find(
        (d: any) => d.id === this.multiState!.activeDashboardId
      );

      if (activeDashboard) {
        this.state = activeDashboard.state;
       //console.log('✅ Loaded active dashboard:', activeDashboard.name, 'with', this.state.widgets.length, 'widgets');
      } else {
        console.warn('⚠️  No active dashboard found, using default state');
        this.state = getDefaultState();
      }

      this.setupDOM();
      this.setupTheme();
      this.setupBackground();
      this.setupEventListeners();
      
      try {
        await this.render();
      } catch (error) {
        console.error('❌ Error during render:', error);
      }
      
      this.saveHistory();
      //console.log('About to show user menu, currentUser:', this.currentUser);
      this.showUserMenu();
      this.startAutoSave();


    } else {
      // Show login dialog
      this.authUI.showLoginDialog();

    
    }
      // Hide loading screen
    this.hideLoadingScreen();
  }

  private handleAuthChange(user: User | null): void {
    this.currentUser = user;
    if (user) {
      // User logged in, show loading screen and initialize dashboard
      this.showLoadingScreen();
      this.init();
    }
  }

  private showUserMenu(): void {
    //console.log('👤 showUserMenu called');
    //console.log('   currentUser:', this.currentUser);
    //console.log('   existing userMenuElement:', this.userMenuElement);
    
    // Remove existing menu if present
    if (this.userMenuElement) {
      this.userMenuElement.remove();
      this.userMenuElement = null;
    }

    // Create new menu if user is logged in
    if (this.currentUser) {
      //console.log('   Creating user menu for:', this.currentUser.username);
      this.userMenuElement = this.authUI.createUserMenu(
        this.currentUser,
        () => this.userSettingsUI.showSettingsDialog(),
        () => this.adminDashboardUI.showAdminDashboard(),
        () => this.showDashboardManager(),
        () => this.credentialsUI.showCredentialsDialog(),
        () => this.showHelpDialog()
      );
      document.body.appendChild(this.userMenuElement);
    } else {
      console.warn('   ❌ Cannot create user menu: currentUser is null');
    }
  }

  private startAutoSave(): void {
    // Auto-save to server every 30 seconds
    this.autoSaveInterval = window.setInterval(async () => {
      if (authService.isAuthenticated() && this.multiState) {
        // Update the active dashboard's state in memory
        const activeDashboard = this.multiState.dashboards.find(
          (d: any) => d.id === this.multiState!.activeDashboardId
        );
        if (activeDashboard) {
          activeDashboard.state = this.state;
          activeDashboard.updatedAt = Date.now();
          await dashboardStorage.saveDashboards(this.multiState); // Save to server (debounced)
        }
      }
    }, 30000);
  }

  private hideLoadingScreen(): void {
    // Call the global function to hide the loading screen
    if (typeof (window as any).hideLoadingScreen === 'function') {
      (window as any).hideLoadingScreen();
    }
  }

  private showLoadingScreen(): void {
    // Recreate loading screen if it doesn't exist
    if (!document.getElementById('loading-screen')) {
      const loadingScreen = document.createElement('div');
      loadingScreen.id = 'loading-screen';
      loadingScreen.innerHTML = `
        <div class="loader"></div>
        <div class="loading-text">Loading Dashboard<span class="loading-dots"></span></div>
      `;
      document.body.appendChild(loadingScreen);
    }
    
    // Remove fade-out class if it exists
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
      loadingScreen.classList.remove('fade-out');
    }
    
    // Hide app while loading
    const app = document.getElementById('app');
    if (app) {
      app.classList.remove('loaded');
    }
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
      this.lockButton.innerHTML = '<i class="fas fa-lock"></i>';
      this.lockButton.setAttribute('aria-label', 'Unlock dashboard');
      this.selectWidget(null);
    } else {
      // Unlock the dashboard
      app.classList.remove('locked');
      this.lockButton.innerHTML = '<i class="fas fa-lock-open"></i>';
      this.lockButton.setAttribute('aria-label', 'Lock dashboard');
    }
  }

  private setupDOM(): void {
    const app = document.getElementById('app')!;

    // Only setup DOM once (prevent duplicate elements)
    if (app.querySelector('.canvas')) {
      console.log('DOM already setup, skipping');
      return;
    }

    // Canvas
    this.canvas = document.createElement('div');
    this.canvas.className = 'canvas';
    this.canvas.setAttribute('role', 'main');

    this.canvasContent = document.createElement('div');
    this.canvasContent.className = 'canvas-content';
    this.canvas.appendChild(this.canvasContent);

    // Dashboard Switcher (top-left)
    const dashboardSwitcher = document.createElement('div');
    dashboardSwitcher.className = 'dashboard-switcher';
    
    const dashboardButton = document.createElement('button');
    dashboardButton.className = 'dashboard-switcher-button';
    dashboardButton.innerHTML = '<span class="dashboard-switcher-icon">📊</span><span class="dashboard-switcher-text"></span>';
    dashboardButton.setAttribute('aria-label', 'Switch dashboard');
    dashboardButton.setAttribute('title', 'Switch dashboard');
    
    const dashboardDropdown = document.createElement('div');
    dashboardDropdown.className = 'dashboard-switcher-dropdown';
    dashboardDropdown.style.display = 'none';
    
    dashboardButton.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = dashboardDropdown.style.display === 'block';
      dashboardDropdown.style.display = isVisible ? 'none' : 'block';
      if (!isVisible) {
        this.updateDashboardSwitcherDropdown(dashboardDropdown);
      }
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      dashboardDropdown.style.display = 'none';
    });
    
    dashboardSwitcher.appendChild(dashboardButton);
    dashboardSwitcher.appendChild(dashboardDropdown);
    
    // Update button text with current dashboard name
    this.updateDashboardSwitcherButton(dashboardButton);

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
    themeToggle.innerHTML = '�';
    themeToggle.setAttribute('aria-label', 'Select theme');
    themeToggle.setAttribute('title', 'Select theme');
    themeToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showThemeMenu(themeToggle);
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

    // Lock Toggle (positioned at top-right, replaces user button when locked)
    this.lockButton = document.createElement('button');
    this.lockButton.className = 'lock-toggle';
    this.lockButton.innerHTML = '🔓';
    this.lockButton.setAttribute('aria-label', 'Lock dashboard');
    this.lockButton.setAttribute('title', 'Lock dashboard (prevents editing)');
    this.lockButton.addEventListener('click', () => {
      this.toggleLock();
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

    // Reset View Button
    const resetViewButton = document.createElement('button');
    resetViewButton.className = 'reset-view-toggle';
    resetViewButton.innerHTML = '🎯';
    resetViewButton.setAttribute('aria-label', 'Reset canvas view');
    resetViewButton.setAttribute('title', 'Reset canvas position to center');
    resetViewButton.addEventListener('click', () => {
      this.resetView();
      this.closeMenu();
    });

    // Add all buttons to controls container (except lock button)
    controlsContainer.appendChild(fab);
    controlsContainer.appendChild(fullscreenToggle);
    controlsContainer.appendChild(resetZoomButton);
    controlsContainer.appendChild(resetViewButton);
    controlsContainer.appendChild(themeToggle);
    controlsContainer.appendChild(backgroundToggle);

    // Dashboard navigation arrows
    const prevDashboardBtn = document.createElement('button');
    prevDashboardBtn.className = 'dashboard-nav-btn dashboard-nav-prev';
    prevDashboardBtn.innerHTML = '‹';
    prevDashboardBtn.setAttribute('aria-label', 'Previous dashboard');
    prevDashboardBtn.setAttribute('title', 'Previous dashboard (Ctrl+←)');
    prevDashboardBtn.addEventListener('click', () => this.navigateToPreviousDashboard());

    const nextDashboardBtn = document.createElement('button');
    nextDashboardBtn.className = 'dashboard-nav-btn dashboard-nav-next';
    nextDashboardBtn.innerHTML = '›';
    nextDashboardBtn.setAttribute('aria-label', 'Next dashboard');
    nextDashboardBtn.setAttribute('title', 'Next dashboard (Ctrl+→)');
    nextDashboardBtn.addEventListener('click', () => this.navigateToNextDashboard());

    app.appendChild(this.canvas);
    app.appendChild(dashboardSwitcher);
    app.appendChild(prevDashboardBtn);
    app.appendChild(nextDashboardBtn);
    app.appendChild(menuButton);
    app.appendChild(this.lockButton);
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
    
    // Remove all theme classes first
    root.classList.remove('theme-dark', 'theme-light', 'theme-gruvbox', 'theme-tokyo-night', 'theme-catppuccin', 'theme-forest', 'theme-emerald');

    if (this.state.theme === 'dark') {
      root.classList.add('theme-dark');
    } else if (this.state.theme === 'light') {
      root.classList.add('theme-light');
    } else if (this.state.theme === 'gruvbox') {
      root.classList.add('theme-gruvbox');
    } else if (this.state.theme === 'tokyo-night') {
      root.classList.add('theme-tokyo-night');
    } else if (this.state.theme === 'catppuccin') {
      root.classList.add('theme-catppuccin');
    } else if (this.state.theme === 'forest') {
      root.classList.add('theme-forest');
    } else if (this.state.theme === 'emerald') {
      root.classList.add('theme-emerald');
    }
    // If 'system', no class is added (uses @media prefers-color-scheme)
  }

  private showThemeMenu(button: HTMLElement): void {
    // Remove any existing theme menu
    const existing = document.querySelector('.theme-menu-dropdown');
    if (existing) {
      existing.remove();
      return;
    }

    const menu = document.createElement('div');
    menu.className = 'theme-menu-dropdown';

    const themes: Array<{ value: Theme; label: string; icon: string }> = [
      { value: 'light', label: 'Light', icon: '☀️' },
      { value: 'dark', label: 'Dark', icon: '🌙' },
      { value: 'gruvbox', label: 'Gruvbox', icon: '🟠' },
      { value: 'tokyo-night', label: 'Tokyo Night', icon: '🌃' },
      { value: 'catppuccin', label: 'Catppuccin', icon: '💜' },
      { value: 'forest', label: 'Forest', icon: '🌲' },
      { value: 'emerald', label: 'Emerald', icon: '💎' },
      { value: 'system', label: 'System', icon: '💻' }
    ];

    themes.forEach(theme => {
      const item = document.createElement('button');
      item.className = 'theme-menu-item';
      
      const icon = document.createElement('span');
      icon.className = 'theme-menu-icon';
      icon.textContent = theme.icon;
      
      const label = document.createElement('span');
      label.className = 'theme-menu-label';
      label.textContent = theme.label;
      
      const check = document.createElement('span');
      check.className = 'theme-menu-check';
      check.innerHTML = this.state.theme === theme.value ? '✓' : '';
      
      item.appendChild(icon);
      item.appendChild(label);
      item.appendChild(check);
      
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.state.theme = theme.value;
        this.setupTheme();
        this.save();
        menu.remove();
      });
      
      menu.appendChild(item);
    });

    // Position menu above the button
    const rect = button.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    menu.style.left = `${rect.left}px`;

    document.body.appendChild(menu);

    // Close menu when clicking outside
    const closeMenu = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node) && e.target !== button) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 0);
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

    // Widget duplicate event
    window.addEventListener('widget-duplicate', ((e: CustomEvent) => {
      this.duplicateWidget(e.detail.widgetId);
    }) as EventListener);

    // Widget copy event
    window.addEventListener('widget-copy', ((e: CustomEvent) => {
      this.showCopyWidgetDialog(e.detail.widgetId);
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
    this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));
  }

  private handleKeyboard(e: KeyboardEvent): void {
    // Ignore all input when locked
    if (this.isLocked) return;

    // Dashboard navigation with Shift + Number (e.g., Shift+1, Shift+2)
    if (e.shiftKey && e.code.startsWith('Digit')) {
      const digit = e.code.replace('Digit', '');
      const dashboardIndex = parseInt(digit) - 1;
      if (this.multiState && this.multiState.dashboards[dashboardIndex]) {
        e.preventDefault();
        this.switchToDashboard(this.multiState.dashboards[dashboardIndex].id);
        return;
      }
    }

    // Dashboard navigation with Ctrl+Arrow keys (when no widget is selected)
    if ((e.ctrlKey || e.metaKey) && !this.selectedWidgetId) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.navigateToPreviousDashboard();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.navigateToNextDashboard();
        return;
      }
    }

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

    // Check if clicking resize handle
    if (target.classList.contains('resize-handle')) {
      e.preventDefault();
      this.startResize(widgetId, target.dataset.direction!, e);
      return;
    }

    // Start drag if clicking header (always allow dragging from header)
    if (target.classList.contains('widget-header') || target.classList.contains('widget-title')) {
      e.preventDefault();
      this.selectWidget(widgetId);
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

    let newX = this.panState.startScrollX + dx;
    let newY = this.panState.startScrollY + dy;

    // Apply pan limits to prevent dragging too far from origin
    // Limit how far the canvas can be panned in any direction
    newX = Math.max(-this.PAN_LIMIT, Math.min(this.PAN_LIMIT, newX));
    newY = Math.max(-this.PAN_LIMIT, Math.min(this.PAN_LIMIT, newY));

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

    // Require Control key to be pressed for mouse wheel zoom
    // This prevents accidental zooming while scrolling
    if (!e.ctrlKey) {
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
    if (e.touches.length === 1) {
      // Store touch start position for swipe detection
      this.touchStartX = e.touches[0].clientX;
      this.touchStartY = e.touches[0].clientY;
      this.touchStartTime = Date.now();
    } else if (e.touches.length === 2) {
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

  private handleTouchEnd(e: TouchEvent): void {
    // Detect swipe gesture for dashboard navigation
    if (e.changedTouches.length === 1 && this.touchStartTime > 0) {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const deltaX = touchEndX - this.touchStartX;
      const deltaY = touchEndY - this.touchStartY;
      const deltaTime = Date.now() - this.touchStartTime;
      
      // Swipe thresholds
      const minSwipeDistance = 100; // minimum distance in pixels
      const maxSwipeTime = 300; // maximum time in milliseconds
      const minHorizontalRatio = 2; // horizontal movement should be at least 2x vertical
      
      // Check if it's a horizontal swipe
      if (
        Math.abs(deltaX) > minSwipeDistance &&
        deltaTime < maxSwipeTime &&
        Math.abs(deltaX) > Math.abs(deltaY) * minHorizontalRatio
      ) {
        if (deltaX > 0) {
          // Swipe right - go to previous dashboard
          this.navigateToPreviousDashboard();
        } else {
          // Swipe left - go to next dashboard
          this.navigateToNextDashboard();
        }
      }
    }
    
    this.lastTouchDistance = 0;
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchStartTime = 0;
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
    // Don't reset viewport position, just apply the zoom
    this.canvasContent.style.transform = `scale(${this.state.zoom})`;
    this.canvasContent.style.transformOrigin = 'top left';
    this.save();
  }

  private resetView(): void {
    // Reset canvas position to top-left (0, 0)
    this.canvasContent.style.left = '0px';
    this.canvasContent.style.top = '0px';
    // Update the viewport state
    this.state.viewport = { x: 0, y: 0 };
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
      // Don't focus - it causes unwanted scrolling when widget is partly out of view
    }
  }

  private async addWidget(type: WidgetType, content: any): Promise<void> {
    // Load the widget module if not already loaded
    await loadWidgetModule(type);

    const id = Date.now().toString(36) + Math.random().toString(36).substr(2);

    // Calculate viewport center based on canvas pan position and zoom
    // The canvas content is positioned using CSS left/top, stored in state.viewport
    // We need to find the center of the visible viewport in canvas coordinates
    const canvasRect = this.canvas.getBoundingClientRect();
    const centerX = (canvasRect.width / 2) / this.state.zoom;
    const centerY = (canvasRect.height / 2) / this.state.zoom;

    // Convert viewport center to canvas coordinates by accounting for pan offset
    const canvasCenterX = centerX - this.state.viewport.x / this.state.zoom;
    const canvasCenterY = centerY - this.state.viewport.y / this.state.zoom;

    // Set size based on widget type
    const size = type === 'clock'
      ? { w: 400, h: 500 }
      : { ...DEFAULT_WIDGET_SIZE };

    const widget: Widget = {
      id,
      type,
      position: {
        x: snapToGrid(canvasCenterX - size.w / 2, this.state.grid),
        y: snapToGrid(canvasCenterY - size.h / 2, this.state.grid)
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

    console.log('updateWidgetContent - Before merge:', JSON.parse(JSON.stringify(widget.content)));
    console.log('updateWidgetContent - New content:', JSON.parse(JSON.stringify(content)));

    // Merge content, but filter out undefined and null values to preserve existing properties
    // This is important for fields like passwords that should persist if not explicitly updated
    const filteredContent = Object.fromEntries(
      Object.entries(content).filter(([_, value]) => value !== undefined && value !== null)
    );

    console.log('updateWidgetContent - Filtered content:', JSON.parse(JSON.stringify(filteredContent)));

    widget.content = { ...widget.content, ...filteredContent };

    console.log('updateWidgetContent - After merge:', JSON.parse(JSON.stringify(widget.content)));

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

  private duplicateWidget(widgetId: string): void {
    const widget = this.state.widgets.find(w => w.id === widgetId);
    if (!widget) return;

    // Create a copy of the widget with a new ID and offset position
    const OFFSET = 20; // pixels to offset the duplicate
    const maxZ = Math.max(...this.state.widgets.map(w => w.z));
    
    const newWidget: Widget = {
      ...widget,
      id: generateUUID(),
      position: {
        x: widget.position.x + OFFSET,
        y: widget.position.y + OFFSET
      },
      z: maxZ + 1, // Place on top
      meta: {
        ...widget.meta,
        title: widget.meta?.title ? `${widget.meta.title} (copy)` : widget.meta?.title,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    };

    // Add to current dashboard
    this.state.widgets.push(newWidget);

    // Create and add the element to DOM
    const element = createWidgetElement(newWidget, 1);
    this.canvasContent.appendChild(element);

    // Select the new widget
    this.selectWidget(newWidget.id);

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

    // Fetch widget metadata from server (no need to load widget code)
    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 
        (typeof window !== 'undefined' ? window.location.origin.replace(':3000', ':3001') : 'http://localhost:3001');
      const response = await fetch(`${apiUrl}/widgets/metadata`);
      const data = await response.json();

      if (!data.success) {
        throw new Error('Failed to fetch widget metadata');
      }

      const widgets = data.widgets;

      widgets.forEach((widgetMeta: any) => {
        const row = document.createElement('button');
        row.className = 'widget-type-row';
        row.tabIndex = 0;

        const icon = document.createElement('div');
        icon.className = 'widget-type-icon';
        icon.textContent = widgetMeta.icon;

        const content = document.createElement('div');
        content.className = 'widget-type-content';

        const name = document.createElement('div');
        name.className = 'widget-type-name';
        name.textContent = widgetMeta.name;

        const description = document.createElement('div');
        description.className = 'widget-type-description';
        description.textContent = widgetMeta.description || '';

        content.appendChild(name);
        content.appendChild(description);

        row.appendChild(icon);
        row.appendChild(content);

        row.addEventListener('click', () => {
          // Add widget with its default content (widget code will be lazy-loaded)
          this.addWidget(widgetMeta.type as WidgetType, widgetMeta.defaultContent || {});
          overlay.remove();
        });

        types.appendChild(row);
      });
    } catch (error) {
      console.error('Failed to load widget metadata:', error);
      types.innerHTML = '<div style="padding: 20px; color: var(--error);">Failed to load widget types. Please try again.</div>';
    }

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

  private updateDashboardSwitcherButton(button: HTMLButtonElement): void {
    if (!this.multiState) return;
    
    const activeDashboard = this.multiState.dashboards.find(
      d => d.id === this.multiState!.activeDashboardId
    );
    
    if (activeDashboard) {
      const textSpan = button.querySelector('.dashboard-switcher-text');
      if (textSpan) {
        textSpan.textContent = activeDashboard.name;
      }
    }
  }

  private updateDashboardSwitcherDropdown(dropdown: HTMLElement): void {
    if (!this.multiState) return;
    
    dropdown.innerHTML = '';
    
    this.multiState.dashboards.forEach(dashboard => {
      const item = document.createElement('button');
      item.className = 'dashboard-switcher-item';
      
      const isActive = dashboard.id === this.multiState!.activeDashboardId;
      if (isActive) {
        item.classList.add('active');
      }
      
      item.innerHTML = `
        <span class="dashboard-switcher-item-icon">${isActive ? '✓' : ''}</span>
        <span class="dashboard-switcher-item-name">${dashboard.name}</span>
      `;
      
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!isActive) {
          await this.switchToDashboard(dashboard.id);
        }
        dropdown.style.display = 'none';
      });
      
      dropdown.appendChild(item);
    });
    
    // Add "Manage Dashboards" option
    const separator = document.createElement('div');
    separator.className = 'dashboard-switcher-separator';
    dropdown.appendChild(separator);
    
    const manageItem = document.createElement('button');
    manageItem.className = 'dashboard-switcher-item manage';
    manageItem.innerHTML = `
      <span class="dashboard-switcher-item-icon">⚙️</span>
      <span class="dashboard-switcher-item-name">Manage Dashboards</span>
    `;
    manageItem.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showDashboardManager();
      dropdown.style.display = 'none';
    });
    
    dropdown.appendChild(manageItem);
  }

  private async switchToDashboard(dashboardId: string): Promise<void> {
    if (!this.multiState) return;
    
    // Clean up current widgets before switching
    this.cleanup();
    
    this.multiState.activeDashboardId = dashboardId;
    
    const dashboard = this.multiState.dashboards.find(d => d.id === dashboardId);
    if (!dashboard) return;
    
    this.state = dashboard.state;
    this.history = createHistoryManager();
    this.render();
    this.setupTheme();
    this.setupBackground();
    
    // Update switcher button
    const button = document.querySelector('.dashboard-switcher-button') as HTMLButtonElement;
    if (button) {
      this.updateDashboardSwitcherButton(button);
    }
    
    // Save the active dashboard change
    if (authService.isAuthenticated()) {
      await dashboardStorage.saveDashboards(this.multiState, true);
    }
  }

  private navigateToNextDashboard(): void {
    if (!this.multiState || this.multiState.dashboards.length <= 1) return;
    
    const currentIndex = this.multiState.dashboards.findIndex(
      d => d.id === this.multiState!.activeDashboardId
    );
    
    const nextIndex = (currentIndex + 1) % this.multiState.dashboards.length;
    this.switchToDashboard(this.multiState.dashboards[nextIndex].id);
  }

  private navigateToPreviousDashboard(): void {
    if (!this.multiState || this.multiState.dashboards.length <= 1) return;
    
    const currentIndex = this.multiState.dashboards.findIndex(
      d => d.id === this.multiState!.activeDashboardId
    );
    
    const prevIndex = currentIndex === 0 
      ? this.multiState.dashboards.length - 1 
      : currentIndex - 1;
    
    this.switchToDashboard(this.multiState.dashboards[prevIndex].id);
  }

  private showCopyWidgetDialog(widgetId: string): void {
    if (!this.multiState) {
      alert('Cannot copy widget: dashboard state not available');
      return;
    }

    const widget = this.state.widgets.find(w => w.id === widgetId);
    if (!widget) {
      alert('Widget not found');
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'dialog';

    const container = document.createElement('div');
    container.className = 'dialog-container';
    container.style.minWidth = '500px';
    container.style.maxWidth = '600px';

    const header = document.createElement('div');
    header.className = 'dialog-header';

    const title = document.createElement('h2');
    title.className = 'dialog-title';
    title.textContent = 'Copy Widget to Dashboard';
    header.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'dialog-close-button';
    closeBtn.innerHTML = '×';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.addEventListener('click', () => overlay.remove());
    header.appendChild(closeBtn);

    container.appendChild(header);

    const description = document.createElement('p');
    description.style.marginBottom = '20px';
    description.style.color = 'var(--muted)';
    description.textContent = `Select a dashboard to copy "${widget.meta?.title || widget.type}" to:`;
    container.appendChild(description);

    // List of dashboards (excluding current one)
    const currentDashboardId = this.multiState.activeDashboardId;
    const otherDashboards = this.multiState.dashboards.filter(d => d.id !== currentDashboardId);

    if (otherDashboards.length === 0) {
      const noDashboards = document.createElement('p');
      noDashboards.style.padding = '40px 20px';
      noDashboards.style.textAlign = 'center';
      noDashboards.style.color = 'var(--muted)';
      noDashboards.textContent = 'No other dashboards available. Create a new dashboard first.';
      container.appendChild(noDashboards);
    } else {
      const dashboardList = document.createElement('div');
      dashboardList.className = 'widget-types';

      otherDashboards.forEach(dashboard => {
        const item = document.createElement('button');
        item.className = 'widget-type-row';

        const icon = document.createElement('div');
        icon.className = 'widget-type-icon';
        icon.textContent = '📊';

        const itemContent = document.createElement('div');
        itemContent.className = 'widget-type-content';

        const dashName = document.createElement('div');
        dashName.className = 'widget-type-name';
        dashName.textContent = dashboard.name;

        const dashInfo = document.createElement('div');
        dashInfo.className = 'widget-type-description';
        dashInfo.textContent = `${dashboard.state.widgets.length} widget${dashboard.state.widgets.length !== 1 ? 's' : ''}`;

        itemContent.appendChild(dashName);
        itemContent.appendChild(dashInfo);
        item.appendChild(icon);
        item.appendChild(itemContent);

        item.addEventListener('click', () => {
          this.copyWidgetToDashboard(widget, dashboard.id);
          overlay.remove();
        });

        dashboardList.appendChild(item);
      });

      container.appendChild(dashboardList);
    }

    overlay.appendChild(container);
    document.body.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });
  }

  private copyWidgetToDashboard(widget: Widget, targetDashboardId: string): void {
    if (!this.multiState) return;

    const targetDashboard = this.multiState.dashboards.find(d => d.id === targetDashboardId);
    if (!targetDashboard) {
      alert('Target dashboard not found');
      return;
    }

    // Create a copy of the widget with a new ID
    const newWidget: Widget = {
      ...widget,
      id: `widget-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      z: targetDashboard.state.widgets.length, // Place on top
      meta: {
        ...widget.meta,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    };

    // Add to target dashboard
    targetDashboard.state.widgets.push(newWidget);

    // Save to server
    if (authService.isAuthenticated()) {
      dashboardStorage.saveDashboards(this.multiState, true);
    }

    alert(`Widget copied to "${targetDashboard.name}" successfully!`);
  }

  private showHelpDialog(): void {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal help-modal';
    modal.style.maxWidth = '800px';

    const header = document.createElement('div');
    header.className = 'modal-header';

    const title = document.createElement('h2');
    title.className = 'modal-title';
    title.textContent = '❓ Dashboard Help';
    header.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.innerHTML = '×';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.addEventListener('click', () => overlay.remove());
    header.appendChild(closeBtn);

    const content = document.createElement('div');
    content.className = 'modal-content help-content';
    
    content.innerHTML = `
      <div class="help-section">
        <h3>🎛️ Dashboard Navigation</h3>
        <ul>
          <li>Click the dashboard name in the top-left corner or use a keyboard shortcut...</li>
          <li>
            <ul>
              <li><kbd>Shift</kbd> + <kbd>1-9</kbd> - Jump to dashboard by number</li>
              <li><kbd>Ctrl</kbd> + <kbd>←</kbd>/<kbd>→</kbd> - Navigate previous/next dashboard</li>
            </ul>
          </li>
          <li><strong>Touch Gestures:</strong> Swipe left/right to switch dashboards</li>
          <li><strong>Arrow Buttons:</strong> Click the arrows on the left/right edges of the screen</li>
        </ul>
      </div>

      <div class="help-section">
        <h3>🎨 Widgets</h3>
        <ul>
          <li><strong>Add Widget:</strong> Click the <strong>+</strong> button (bottom-left)</li>
          <li><kbd>Shift</kbd> + Click to select a widget</li>
          <li><kbd>Shift</kbd> + Click and drag the widget anywhere</li>
          <li><strong>Resize Widget:</strong> Drag the edges or corners (hover to reveal handles)</li>
          <li><strong>Configure:</strong> Click the ⚙️ icon in the widget header</li>
          <li><strong>Copy to Dashboard:</strong> Click the 📋 icon to copy widget to another dashboard</li>
          <li><strong>Delete:</strong> Click the × icon in the widget header</li>
          <li><strong>Keyboard Movement:</strong>
            <ul>
              <li><kbd>Shift</kbd> + Click to select a widget</li>
              <li>Arrow keys to move selected widget (hold <kbd>Shift</kbd> for 10x speed)</li>
              <li><kbd>Esc</kbd> to deselect widget</li>
            </ul>
          </li>
        </ul>
      </div>

      <div class="help-section">
        <h3>🔒 Lock Mode</h3>
        <ul>
          <li><strong>Toggle Lock:</strong> Click the lock icon (top-right)</li>
          <li><strong>Locked Mode:</strong> Prevents moving, resizing, or deleting widgets</li>
          <li><strong>Use Case:</strong> Perfect for viewing dashboards without accidental changes</li>
        </ul>
      </div>

      <div class="help-section">
        <h3>🔍 Canvas Controls</h3>
        <ul>
          <li><strong>Zoom:</strong> <kbd>Ctrl</kbd> + Mouse Wheel or pinch gesture</li>
          <li><strong>Pan:</strong> Click and drag on empty canvas area</li>
          <li><strong>Reset Zoom:</strong> Click the <strong>1:1</strong> button (left menu)</li>
          <li><strong>Reset View:</strong> Click the 🎯 button to center canvas</li>
        </ul>
      </div>

      <div class="help-section">
        <h3>🎭 Themes & Appearance</h3>
        <ul>
          <li><strong>Theme Toggle:</strong> Click the 🌓 button (left menu)</li>
          <li><strong>Background Pattern:</strong> Click the ◫ button to cycle patterns</li>
          <li><strong>Fullscreen:</strong> Click the ⛶ button or press <kbd>F11</kbd></li>
        </ul>
      </div>

      <div class="help-section">
        <h3>🔐 Credentials & Security</h3>
        <ul>
          <li><strong>Credential Manager:</strong> Store API keys and tokens securely</li>
          <li><strong>Access:</strong> User menu → Credentials</li>
          <li><strong>Usage:</strong> Select stored credentials when configuring widgets</li>
        </ul>
      </div>

      <div class="help-section">
        <h3>⌨️ Keyboard Shortcuts Summary</h3>
        <table class="help-shortcuts-table">
          <tr><td><kbd>Ctrl</kbd> + <kbd>Z</kbd></td><td>Undo</td></tr>
          <tr><td><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd></td><td>Redo</td></tr>
          <tr><td><kbd>Shift</kbd> + <kbd>1-9</kbd></td><td>Switch to dashboard</td></tr>
          <tr><td><kbd>Ctrl</kbd> + <kbd>←</kbd>/<kbd>→</kbd></td><td>Navigate dashboards</td></tr>
          <tr><td><kbd>Arrow Keys</kbd></td><td>Move selected widget</td></tr>
          <tr><td><kbd>Alt</kbd> + <kbd>Arrow Keys</kbd></td><td>Resize selected widget</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>Deselect widget</td></tr>
        </table>
      </div>

      <div class="help-section">
        <h3>💡 Tips & Tricks</h3>
        <ul>
          <li>Use <strong>My Dashboards</strong> to organize widgets into separate dashboards</li>
          <li>Lock the dashboard when presenting to prevent accidental edits</li>
          <li>Store credentials once and reuse them across multiple widgets</li>
          <li>Use the grid snap feature for perfectly aligned widgets</li>
        </ul>
      </div>
    `;

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
    title.textContent = 'My Dashboards';
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

    // Get all dashboards from current state
    if (!this.multiState) {
      console.error('No multiState available');
      return;
    }

    const dashboards = this.multiState.dashboards;
    const activeDashboardId = this.multiState.activeDashboardId;

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
      renameBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const newName = prompt('Enter new dashboard name:', dashboard.name);
        if (newName && newName.trim()) {
          // Update in current state
          if (this.multiState) {
            const dash = this.multiState.dashboards.find(d => d.id === dashboard.id);
            if (dash) {
              dash.name = newName.trim();
              dash.updatedAt = Date.now();
            }
          }

          // Save to server
          if (authService.isAuthenticated() && this.multiState) {
            await dashboardStorage.saveDashboards(this.multiState, true); // Immediate save
          }

          overlay.remove();
          this.showDashboardManager();
        }
      });

      // Public toggle button
      const publicBtn = document.createElement('button');
      const isPublic = (dashboard as any).isPublic || false;
      publicBtn.innerHTML = isPublic ? '<i class="fas fa-globe"></i>' : '<i class="fas fa-lock"></i>';
      publicBtn.title = isPublic ? 'Public (click to make private)' : 'Private (click to make public)';
      publicBtn.style.cssText = `
        padding: 6px 10px;
        background: ${isPublic ? '#4CAF50' : 'rgba(255, 255, 255, 0.1)'};
        color: white;
        border: 1px solid ${isPublic ? '#4CAF50' : 'var(--border)'};
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
      `;
      publicBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const newPublicState = !isPublic;
        
        try {
          const result = await authService.toggleDashboardPublic(dashboard.id, newPublicState);
          if (result.success) {
            // Update local state
            if (this.multiState) {
              const dash = this.multiState.dashboards.find(d => d.id === dashboard.id);
              if (dash) {
                (dash as any).isPublic = result.isPublic;
              }
            }
            overlay.remove();
            this.showDashboardManager();
            
            // Show share URL if made public
            if (newPublicState) {
              const shareUrl = `${window.location.origin}/#/public/${dashboard.id}`;
              prompt('Dashboard is now public! Share this URL:', shareUrl);
            }
          } else {
            alert('Failed to update dashboard visibility');
          }
        } catch (error) {
          console.error('Error toggling public status:', error);
          alert('Failed to update dashboard visibility');
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
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const widgetCount = dashboard.state.widgets.length;
          const message = widgetCount > 0
            ? `Delete dashboard "${dashboard.name}"? This will delete ${widgetCount} widget${widgetCount > 1 ? 's' : ''}. This cannot be undone.`
            : `Delete dashboard "${dashboard.name}"? This cannot be undone.`;

          if (confirm(message)) {
            const wasActive = dashboard.id === activeDashboardId;

            // Delete from current state
            if (this.multiState) {
              // Don't delete if it's the last dashboard
              if (this.multiState.dashboards.length <= 1) {
                alert('Cannot delete the last dashboard');
                return;
              }

              // Remove the dashboard
              this.multiState.dashboards = this.multiState.dashboards.filter(d => d.id !== dashboard.id);

              // If we deleted the active dashboard, switch to the first one
              if (this.multiState.activeDashboardId === dashboard.id) {
                this.multiState.activeDashboardId = this.multiState.dashboards[0].id;
              }

              // Save to server if authenticated
              if (authService.isAuthenticated()) {
                await dashboardStorage.deleteDashboard(dashboard.id, this.multiState);
                await dashboardStorage.saveDashboards(this.multiState, true);
              }
            }

            overlay.remove();

            if (wasActive && this.multiState) {
              // Switch to the new active dashboard
              this.switchToDashboard(this.multiState.activeDashboardId);
            } else {
              this.showDashboardManager();
            }
          }
        });
        dashboardRow.appendChild(publicBtn);
        dashboardRow.appendChild(renameBtn);
        dashboardRow.appendChild(deleteBtn);
      } else {
        dashboardRow.appendChild(publicBtn);
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
    addButton.addEventListener('click', async () => {
      const name = prompt('Enter dashboard name:', `Dashboard ${dashboards.length + 1}`);
      if (name && name.trim()) {
        // Create new dashboard and add to current state
        const newDashboard = {
          id: generateUUID(),
          name: name.trim(),
          state: getDefaultState(),
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        // Add to current state and save
        if (authService.isAuthenticated() && this.multiState) {
          this.multiState.dashboards.push(newDashboard);
          await dashboardStorage.saveDashboards(this.multiState, true); // Immediate save
        }

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

  private async render(): Promise<void> {
    // Load all widget modules needed for current dashboard
    const widgetTypes = this.state.widgets.map(w => w.type);
    if (widgetTypes.length > 0) {
      await loadWidgetModules(widgetTypes);
    }

    this.canvasContent.innerHTML = '';
    this.state.widgets.forEach(widget => {
      // Skip widgets with invalid or missing content
      if (!widget || !widget.type) {
        console.warn('⚠️ Skipping invalid widget:', widget);
        return;
      }
      this.renderWidget(widget);
    });
    this.applyZoom();
  }

  private renderWidget(widget: Widget): void {
    try {
      const el = createWidgetElement(widget, this.state.grid);
      this.canvasContent.appendChild(el);
    } catch (error) {
      console.error('❌ Failed to render widget:', widget.type, error);
    }
  }

  private saveHistory(): void {
    if (!shouldCoalesceAction('')) {
      this.history.push(JSON.parse(JSON.stringify(this.state)));
    }
  }

  private save(): void {
    // Update current dashboard in cached multi-state
    if (!this.multiState) {
      console.warn('⚠️  Cannot save - multiState not loaded');
      return;
    }

    const activeDashboard = this.multiState.dashboards.find(
      (d: any) => d.id === this.multiState!.activeDashboardId
    );
    if (activeDashboard) {
      activeDashboard.state = this.state;
      activeDashboard.updatedAt = Date.now();

      console.log('💾 Saving dashboard state - widgets:', this.state.widgets.map((w: any) => ({
        id: w.id,
        type: w.type,
        groups: w.content?.groups?.length || 0,
        entities: w.content?.entities?.length || 0
      })));

      // Save to server if authenticated (immediate save for widget updates)
      if (authService.isAuthenticated()) {
        dashboardStorage.saveDashboards(this.multiState, true).catch((err: any) => {
          console.error('Failed to save dashboard to server:', err);
        });
      }
    }
  }

  private undo(): void {
    const previous = this.history.undo();
    if (previous) {
      this.state = JSON.parse(JSON.stringify(previous));
      this.render(); // No await needed - fire and forget

      // Update cached multi-state
      if (this.multiState) {
        const activeDashboard = this.multiState.dashboards.find(
          (d: any) => d.id === this.multiState!.activeDashboardId
        );
        if (activeDashboard) {
          activeDashboard.state = this.state;
          activeDashboard.updatedAt = Date.now();

          if (authService.isAuthenticated()) {
            dashboardStorage.saveDashboards(this.multiState);
          }
        }
      }
    }
  }

  private redo(): void {
    const next = this.history.redo();
    if (next) {
      this.state = JSON.parse(JSON.stringify(next));
      this.render(); // No await needed - fire and forget

      // Update cached multi-state
      if (this.multiState) {
        const activeDashboard = this.multiState.dashboards.find(
          (d: any) => d.id === this.multiState!.activeDashboardId
        );
        if (activeDashboard) {
          activeDashboard.state = this.state;
          activeDashboard.updatedAt = Date.now();

          if (authService.isAuthenticated()) {
            dashboardStorage.saveDashboards(this.multiState);
          }
        }
      }
    }
  }

  private async loadPublicDashboard(dashboardId: string): Promise<void> {
    try {
      const publicDashboard = await authService.getPublicDashboard(dashboardId);
      
      // Set read-only mode
      this.isLocked = true;
      this.state = publicDashboard.state;
      
      // Setup DOM without user controls
      this.setupDOM();
      
      // Add read-only banner
      const banner = document.createElement('div');
      banner.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: rgba(255, 152, 0, 0.95);
        color: white;
        padding: 12px;
        text-align: center;
        font-weight: 600;
        z-index: 10000;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      `;
      banner.innerHTML = `
        👁️ Viewing public dashboard: "${publicDashboard.name}" by ${publicDashboard.owner} (Read-only)
      `;
      document.body.appendChild(banner);
      
      // Hide controls for public view
      const controls = document.querySelector('.controls');
      if (controls) {
        (controls as HTMLElement).style.display = 'none';
      }
      
      // Load and render widgets
      const widgetTypes = this.state.widgets.map(w => w.type);
      if (widgetTypes.length > 0) {
        await loadWidgetModules(widgetTypes);
      }
      await this.render();
      
    } catch (error) {
      console.error('Failed to load public dashboard:', error);
      const errorDiv = document.createElement('div');
      errorDiv.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        text-align: center;
        padding: 40px;
      `;
      errorDiv.innerHTML = `
        <div style="font-size: 64px; margin-bottom: 20px;"><i class="fas fa-lock"></i></div>
        <h1 style="margin-bottom: 12px;">Dashboard Not Available</h1>
        <p style="color: var(--muted); margin-bottom: 24px;">
          This dashboard is private or doesn't exist.
        </p>
        <button onclick="window.location.href='/'" style="
          padding: 12px 24px;
          background: var(--accent);
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
        ">
          Go to Dashboard
        </button>
      `;
      document.body.appendChild(errorDiv);
    }
  }
}

// Initialize dashboard
const dashboard = new Dashboard();

// Expose helper methods for debugging (development only)
if (typeof window !== 'undefined') {
  (window as any).dashboard = dashboard;
  (window as any).deleteWidgetsByType = (type: string) => {
    const before = (dashboard as any).state.widgets.length;
    (dashboard as any).state.widgets = (dashboard as any).state.widgets.filter((w: any) => w.type !== type);
    const after = (dashboard as any).state.widgets.length;
    console.log(`🗑️ Removed ${before - after} ${type} widget(s)`);
    (dashboard as any).render();
    (dashboard as any).saveHistory();
    (dashboard as any).save();
  };
}
