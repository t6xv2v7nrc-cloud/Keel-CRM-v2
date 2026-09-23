// Property lists saved in this browser (localStorage) rather than the database.
// Stock lists go stale within weeks, so they live on the device and can be
// purged in bulk from the Properties tab. They only exist in this browser:
// another device or a cleared browser will not have them.

import { useSyncExternalStore } from 'react';
import type { Property } from './types';
import type { NewProperty } from './hooks';

const KEY = 'keel.properties.v1';
const listeners = new Set<() => void>();
let cache: Property[] | null = null;

export const isLocalProperty = (id: string) => id.startsWith('local-');

function read(): Property[] {
  if (cache) return cache;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    cache = Array.isArray(parsed) ? (parsed as Property[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

/** Returns false when the browser would not store it (private window, storage full). */
function write(next: Property[]): boolean {
  cache = next;
  let saved = true;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { saved = false; }
  listeners.forEach((l) => l());
  return saved;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // keep other tabs in step
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cache = null; listener(); } };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage); };
}

export function useLocalProperties(): Property[] {
  return useSyncExternalStore(subscribe, read, () => []);
}

const newId = () => `local-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

export const localProperties = {
  add(rows: NewProperty[]): { added: Property[]; saved: boolean } {
    const now = new Date().toISOString();
    const added: Property[] = rows.map((r) => ({
      ...r, id: newId(), status: 'void', lha_rate_pcm: null, landlord_id: null, created_at: now, updated_at: now,
    }));
    return { added, saved: write([...added, ...read()]) };
  },
  setStatus(ids: string[], status: Property['status']): boolean {
    const now = new Date().toISOString();
    return write(read().map((p) => (ids.includes(p.id) ? { ...p, status, updated_at: now } : p)));
  },
  remove(ids: string[]): boolean {
    return write(read().filter((p) => !ids.includes(p.id)));
  },
};
