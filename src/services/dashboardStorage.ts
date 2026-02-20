import type { MultiDashboardState } from '../types/types';
import { authService } from './auth';
import { getDefaultMultiDashboardState } from '../components/storage';
import { sanitizeDashboardState } from '../utils/sanitizeWidgets';
import { dashboardSyncService } from './dashboardSync';

/**
 * Dashboard storage service - server only (no localStorage).
 * Server storage is the single source of truth when authenticated.
 */
class DashboardStorageService {
  private saveTimeout: number | undefined;
  private lastSaveTime: number = 0;
  private dashboardVersions: Map<string, number> = new Map(); // Per-dashboard versions
  private readonly SAVE_DEBOUNCE_MS = 1000; // 1 second (reduced from 2)
  private readonly MIN_SAVE_INTERVAL_MS = 3000; // Minimum 3 seconds between saves (reduced from 5)

  /**
   * Load dashboard state from server (no localStorage fallback)
   */
  async loadDashboards(): Promise<MultiDashboardState> {
    if (authService.isAuthenticated()) {
      try {
        const serverData = await authService.loadDashboard();
        
        if (serverData && serverData.dashboards && serverData.dashboards.length > 0) {
          // Store per-dashboard versions from server
          if (serverData.dashboards) {
            for (const dashboard of serverData.dashboards) {
              if (dashboard.updatedAt) {
                const version = dashboard.updatedAt / 1000; // Convert ms to seconds (keep precision)
                this.dashboardVersions.set(dashboard.id, version);
                dashboardSyncService.updateDashboardVersion(dashboard.id, version);
              }
            }
          }
          console.log('📥 Loaded dashboards with versions:', 
                      Array.from(this.dashboardVersions.entries()).map(([id, v]) => `${id}:${v}`).join(', '));
          return serverData;
        } else {
          console.log('⚠️  No dashboards on server, creating default');
          const defaultState = getDefaultMultiDashboardState();
          // Save the default to server
          await this.saveDashboards(defaultState, true);
          return defaultState;
        }
      } catch (error) {
        console.error('❌ Failed to load from server:', error);
        return getDefaultMultiDashboardState();
      }
    } else {
      console.log('⚠️  Not authenticated, returning default state');
      return getDefaultMultiDashboardState();
    }
  }

  /**
   * Save dashboard state to server only (no localStorage)
   * Will refuse to save if the sync service indicates we are out of sync.
   * @param modifiedDashboardId - If provided, broadcasts an update for this specific dashboard
   *   to other tabs. Only pass this when the dashboard CONTENT was actually changed 
   *   (not for metadata-only changes like switching the active dashboard).
   */
  async saveDashboards(state: MultiDashboardState, immediate: boolean = false, modifiedDashboardId?: string): Promise<void> {
    // Block saves if this tab is out of sync for the active dashboard
    if (dashboardSyncService.isOutOfSync()) {
      console.warn('⚠️  Blocked save - dashboard is out of sync with another tab');
      return;
    }

    // Deduplicate dashboards before saving
    const dashboardMap = new Map();
    for (const dashboard of state.dashboards) {
      dashboardMap.set(dashboard.id, dashboard);
    }
    const uniqueDashboards = Array.from(dashboardMap.values());
    
    // Log if we found duplicates
    if (uniqueDashboards.length !== state.dashboards.length) {
      console.warn('⚠️  Found and removed', state.dashboards.length - uniqueDashboards.length, 'duplicate dashboards before saving');
    }
    
    const deduplicatedState = {
      ...state,
      dashboards: uniqueDashboards
    };
    
    // Sanitize sensitive data before saving (remove API keys, tokens, cached data, etc.)
    const cleanState = sanitizeDashboardState(deduplicatedState);
    
    // Save to server if authenticated
    if (authService.isAuthenticated()) {
      if (immediate) {
        await this.saveToServerNow(cleanState, modifiedDashboardId);
      } else {
        this.debouncedSaveToServer(cleanState, modifiedDashboardId);
      }
    } else {
      console.warn('⚠️  Not authenticated, cannot save to server');
    }
  }

  /**
   * Debounced save to server to avoid excessive API calls
   */
  private debouncedSaveToServer(state: MultiDashboardState, modifiedDashboardId?: string): void {
    // Clear existing timeout
    if (this.saveTimeout !== undefined) {
      clearTimeout(this.saveTimeout);
    }

    // Check if enough time has passed since last save
    const now = Date.now();
    const timeSinceLastSave = now - this.lastSaveTime;
    
    if (timeSinceLastSave < this.MIN_SAVE_INTERVAL_MS) {
      // Too soon, schedule for later
      const delay = this.MIN_SAVE_INTERVAL_MS - timeSinceLastSave + this.SAVE_DEBOUNCE_MS;
      this.saveTimeout = window.setTimeout(() => {
        this.saveToServerNow(state, modifiedDashboardId);
        this.saveTimeout = undefined;
      }, delay);
    } else {
      // Enough time has passed, schedule with normal debounce
      this.saveTimeout = window.setTimeout(() => {
        this.saveToServerNow(state, modifiedDashboardId);
        this.saveTimeout = undefined;
      }, this.SAVE_DEBOUNCE_MS);
    }
  }

  /**
   * Immediate save to server
   */
  private async saveToServerNow(state: MultiDashboardState, modifiedDashboardId?: string): Promise<void> {
    try {
      this.lastSaveTime = Date.now();
      
      // Build per-dashboard version map for conflict detection
      const dashboardVersions: Record<string, number> = {};
      for (const dashboard of state.dashboards) {
        const version = this.dashboardVersions.get(dashboard.id);
        if (version !== undefined) {
          dashboardVersions[dashboard.id] = version;
        }
      }
      
      const result = await authService.saveDashboard(state, undefined);
      
      if (result.success) {
        // Update versions using server-returned timestamps (accurate, no clock drift)
        if (result.dashboardVersions) {
          for (const [dashboardId, version] of Object.entries(result.dashboardVersions)) {
            this.dashboardVersions.set(dashboardId, version);
            dashboardSyncService.updateDashboardVersion(dashboardId, version);
          }
        }
        
        console.log('📤 Saved dashboards successfully');
        
        // Only broadcast if a specific dashboard's content was modified
        // (not for metadata-only saves like switching the active dashboard)
        if (modifiedDashboardId) {
          const version = this.dashboardVersions.get(modifiedDashboardId);
          dashboardSyncService.broadcastDashboardUpdate(modifiedDashboardId, version);
        }
      } else if (result.conflict) {
        console.warn('⚠️  Version conflict detected! Dashboard was modified elsewhere.');
        // Don't reload the page - let the Dashboard class handle this via sync service
        // The other tab that made the change has already broadcast the update
      } else {
        console.warn('⚠️  Failed to save dashboards to server');
      }
    } catch (error) {
      console.error('❌ Error saving dashboards to server:', error);
    }
  }

  /**
   * Delete a dashboard from server only (no localStorage)
   */
  async deleteDashboard(dashboardId: string, state: MultiDashboardState): Promise<boolean> {
    // Delete from server if authenticated
    if (authService.isAuthenticated()) {
      try {
        const success = await authService.deleteDashboard(dashboardId);
        if (!success) {
          console.warn('⚠️  Failed to delete dashboard from server');
        }
        // Remove version tracking for deleted dashboard
        this.dashboardVersions.delete(dashboardId);
        return success;
      } catch (error) {
        console.error('❌ Error deleting dashboard from server:', error);
        return false;
      }
    }
    
    return false; // Cannot delete without authentication
  }

  /**
   * Get the version for a specific dashboard
   */
  getDashboardVersion(dashboardId: string): number | undefined {
    return this.dashboardVersions.get(dashboardId);
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.saveTimeout !== undefined) {
      clearTimeout(this.saveTimeout);
    }
  }
}

export const dashboardStorage = new DashboardStorageService();
