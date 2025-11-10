import type { MultiDashboardState } from '../types';
import { authService } from './auth';
import { 
  loadMultiDashboardState as loadFromLocalStorage,
  saveMultiDashboardState as saveToLocalStorage
} from '../storage';

/**
 * Unified dashboard storage service that manages both server and local storage.
 * Server storage is the primary source of truth when authenticated.
 * Local storage is used as a fallback and for offline support.
 */
class DashboardStorageService {
  private saveTimeout: number | undefined;
  private lastSaveTime: number = 0;
  private readonly SAVE_DEBOUNCE_MS = 2000; // 2 seconds
  private readonly MIN_SAVE_INTERVAL_MS = 5000; // Minimum 5 seconds between saves

  /**
   * Load dashboard state from server if authenticated, otherwise from local storage
   */
  async loadDashboards(): Promise<MultiDashboardState> {
    if (authService.isAuthenticated()) {
      try {
        console.log('🔄 Loading dashboards from server...');
        const serverData = await authService.loadDashboard();
        
        if (serverData && serverData.dashboards && serverData.dashboards.length > 0) {
          console.log('✅ Loaded', serverData.dashboards.length, 'dashboards from server');
          
          // Save to localStorage as backup
          saveToLocalStorage(serverData);
          
          return serverData;
        } else {
          console.log('⚠️  No dashboards on server, checking localStorage...');
          const localData = loadFromLocalStorage();
          
          // If we have local data, upload it to server
          if (localData.dashboards.length > 0) {
            console.log('📤 Uploading', localData.dashboards.length, 'dashboards from localStorage to server');
            await this.saveDashboards(localData, true); // Force immediate save
          }
          
          return localData;
        }
      } catch (error) {
        console.error('❌ Failed to load from server, falling back to localStorage:', error);
        return loadFromLocalStorage();
      }
    } else {
      console.log('📂 Loading dashboards from localStorage (not authenticated)');
      return loadFromLocalStorage();
    }
  }

  /**
   * Save dashboard state to both server (if authenticated) and local storage
   */
  async saveDashboards(state: MultiDashboardState, immediate: boolean = false): Promise<void> {
    // Always save to localStorage immediately
    saveToLocalStorage(state);
    
    // Save to server if authenticated
    if (authService.isAuthenticated()) {
      if (immediate) {
        await this.saveToServerNow(state);
      } else {
        this.debouncedSaveToServer(state);
      }
    }
  }

  /**
   * Debounced save to server to avoid excessive API calls
   */
  private debouncedSaveToServer(state: MultiDashboardState): void {
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
        this.saveToServerNow(state);
        this.saveTimeout = undefined;
      }, delay);
    } else {
      // Enough time has passed, schedule with normal debounce
      this.saveTimeout = window.setTimeout(() => {
        this.saveToServerNow(state);
        this.saveTimeout = undefined;
      }, this.SAVE_DEBOUNCE_MS);
    }
  }

  /**
   * Immediate save to server
   */
  private async saveToServerNow(state: MultiDashboardState): Promise<void> {
    try {
      this.lastSaveTime = Date.now();
      const success = await authService.saveDashboard(state);
      
      if (!success) {
        console.warn('⚠️  Failed to save dashboards to server (saved to localStorage only)');
      }
    } catch (error) {
      console.error('❌ Error saving dashboards to server:', error);
    }
  }

  /**
   * Delete a dashboard from both server and local storage
   */
  async deleteDashboard(dashboardId: string, state: MultiDashboardState): Promise<boolean> {
    // Save updated state locally first
    saveToLocalStorage(state);
    
    // Delete from server if authenticated
    if (authService.isAuthenticated()) {
      try {
        const success = await authService.deleteDashboard(dashboardId);
        if (!success) {
          console.warn('⚠️  Failed to delete dashboard from server (deleted from localStorage only)');
        }
        return success;
      } catch (error) {
        console.error('❌ Error deleting dashboard from server:', error);
        return false;
      }
    }
    
    return true; // Local-only mode
  }

  /**
   * Force synchronization with server
   */
  async syncWithServer(): Promise<boolean> {
    if (!authService.isAuthenticated()) {
      return false;
    }

    try {
      console.log('🔄 Syncing with server...');
      const localState = loadFromLocalStorage();
      await this.saveToServerNow(localState);
      console.log('✅ Sync complete');
      return true;
    } catch (error) {
      console.error('❌ Sync failed:', error);
      return false;
    }
  }
}

export const dashboardStorage = new DashboardStorageService();
