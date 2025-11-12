import type { DashboardState } from '../types/types';

export interface HistoryManager {
  past: DashboardState[];
  future: DashboardState[];
  push(state: DashboardState): void;
  undo(): DashboardState | null;
  redo(): DashboardState | null;
  clear(): void;
}

const MAX_HISTORY = 50;

export function createHistoryManager(): HistoryManager {
  const past: DashboardState[] = [];
  const future: DashboardState[] = [];

  return {
    past,
    future,

    push(state: DashboardState) {
      // Deep clone the state
      const cloned = JSON.parse(JSON.stringify(state)) as DashboardState;
      
      past.push(cloned);
      
      // Limit history size
      if (past.length > MAX_HISTORY) {
        past.shift();
      }
      
      // Clear future when new action is performed
      future.length = 0;
    },

    undo(): DashboardState | null {
      if (past.length === 0) return null;
      
      const previous = past.pop()!;
      future.push(previous);
      
      return past.length > 0 ? past[past.length - 1] : null;
    },

    redo(): DashboardState | null {
      if (future.length === 0) return null;
      
      const next = future.pop()!;
      past.push(next);
      
      return next;
    },

    clear() {
      past.length = 0;
      future.length = 0;
    }
  };
}

// Helper to determine if an action should be coalesced
let lastActionTime = 0;
const COALESCE_DELAY = 300; // ms

export function shouldCoalesceAction(actionType: string): boolean {
  const now = Date.now();
  const shouldCoalesce = 
    (actionType === 'drag' || actionType === 'resize') && 
    (now - lastActionTime) < COALESCE_DELAY;
  
  lastActionTime = now;
  return shouldCoalesce;
}
