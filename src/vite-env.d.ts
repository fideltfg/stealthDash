/// <reference types="vite/client" />

// Fallback: if vite/client types are not installed locally, declare import.meta.glob
interface ImportMeta {
  glob(pattern: string, options?: Record<string, any>): Record<string, () => Promise<any>>;
}
