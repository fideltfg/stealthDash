/**
 * Dashboard Synchronization Service
 * 
 * Handles cross-tab communication for dashboard updates using BroadcastChannel.
 * When a dashboard is updated in one tab, other tabs viewing the SAME dashboard
 * are notified and prevented from making conflicting changes.
 */

export type DashboardUpdateMessage = {
  type: 'dashboard-updated';
  dashboardId: string;
  updatedAt: number;
  version?: number;
  sourceTabId: string;
};

export type SyncStatus = {
  isOutOfSync: boolean;
  lastServerUpdate?: number;
  conflictingDashboardId?: string;
};

export class DashboardSyncService {
  private channel: BroadcastChannel | null = null;
  private tabId: string;
  private currentDashboardId: string | null = null;
  private syncStatus: SyncStatus = { isOutOfSync: false };
  private listeners: Set<(status: SyncStatus) => void> = new Set();
  private dashboardVersions: Map<string, number> = new Map();

  constructor() {
    // Generate unique tab ID
    this.tabId = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Initialize BroadcastChannel if supported
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('dashboard-sync');
      this.setupMessageListener();
    } else {
      console.warn('⚠️ BroadcastChannel not supported in this browser');
    }

    console.log('🔄 Dashboard sync service initialized, tab ID:', this.tabId);
  }

  /**
   * Set the current dashboard being viewed/edited in this tab
   */
  setCurrentDashboard(dashboardId: string, version?: number): void {
    console.log('📍 Current dashboard set to:', dashboardId, 'version:', version);
    this.currentDashboardId = dashboardId;
    
    // Store version if provided
    if (version !== undefined) {
      this.dashboardVersions.set(dashboardId, version);
    }
    
    // Reset sync status when switching dashboards
    this.updateSyncStatus({ isOutOfSync: false });
  }

  /**
   * Update the version for a specific dashboard
   */
  updateDashboardVersion(dashboardId: string, version: number): void {
    this.dashboardVersions.set(dashboardId, version);
  }

  /**
   * Get the version for a specific dashboard
   */
  getDashboardVersion(dashboardId: string): number | undefined {
    return this.dashboardVersions.get(dashboardId);
  }

  /**
   * Broadcast that a dashboard has been updated
   */
  broadcastDashboardUpdate(dashboardId: string, version?: number): void {
    if (!this.channel) return;

    const message: DashboardUpdateMessage = {
      type: 'dashboard-updated',
      dashboardId,
      updatedAt: Date.now(),
      version,
      sourceTabId: this.tabId
    };

    console.log('📤 Broadcasting dashboard update:', dashboardId);
    this.channel.postMessage(message);

    // Update local version
    if (version !== undefined) {
      this.dashboardVersions.set(dashboardId, version);
    }
  }

  /**
   * Listen for sync status changes
   */
  onSyncStatusChange(callback: (status: SyncStatus) => void): () => void {
    this.listeners.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Get current sync status
   */
  getSyncStatus(): SyncStatus {
    return { ...this.syncStatus };
  }

  /**
   * Check if the current dashboard is out of sync
   */
  isOutOfSync(): boolean {
    return this.syncStatus.isOutOfSync;
  }

  /**
   * Mark the current dashboard as in sync (after reload)
   */
  markInSync(): void {
    this.updateSyncStatus({ isOutOfSync: false });
  }

  /**
   * Setup message listener for BroadcastChannel
   */
  private setupMessageListener(): void {
    if (!this.channel) return;

    this.channel.addEventListener('message', (event) => {
      const message = event.data as DashboardUpdateMessage;

      // Ignore messages from this tab
      if (message.sourceTabId === this.tabId) {
        return;
      }

      // Check if this message is about the dashboard currently being viewed
      if (message.type === 'dashboard-updated' && 
          message.dashboardId === this.currentDashboardId) {
        
        console.warn('⚠️ Dashboard', message.dashboardId, 'was updated in another tab');
        
        // Mark this tab as out of sync
        this.updateSyncStatus({
          isOutOfSync: true,
          lastServerUpdate: message.updatedAt,
          conflictingDashboardId: message.dashboardId
        });
      }
    });
  }

  /**
   * Update sync status and notify listeners
   */
  private updateSyncStatus(status: Partial<SyncStatus>): void {
    this.syncStatus = {
      ...this.syncStatus,
      ...status
    };

    // Notify all listeners
    this.listeners.forEach(callback => {
      try {
        callback(this.syncStatus);
      } catch (error) {
        console.error('Error in sync status listener:', error);
      }
    });
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.listeners.clear();
  }
}

// Export singleton instance
export const dashboardSyncService = new DashboardSyncService();
