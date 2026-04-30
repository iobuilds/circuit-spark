// Client-side cache of the shared pin property catalog. Components subscribe
// via useSyncExternalStore-style getters; we keep it tiny by using zustand.

import { create } from "zustand";
import {
  listPinProperties,
  createPinProperty,
  deletePinProperty,
  type PinProperty,
} from "@/server/pinProperties.functions";

interface PinPropertyState {
  properties: PinProperty[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  load: () => Promise<void>;
  add: (input: {
    key: string;
    label: string;
    category?: string;
    color?: string | null;
    description?: string | null;
  }) => Promise<PinProperty | null>;
  remove: (id: string) => Promise<boolean>;
}

export const usePinPropertyStore = create<PinPropertyState>((set, get) => ({
  properties: [],
  loading: false,
  loaded: false,
  error: null,

  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const res = await listPinProperties();
      set({
        properties: res.properties,
        loaded: true,
        loading: false,
        error: res.error,
      });
    } catch (e) {
      set({ loading: false, loaded: true, error: (e as Error).message });
    }
  },

  add: async (input) => {
    try {
      const res = await createPinProperty({
        data: {
          key: input.key,
          label: input.label,
          category: input.category ?? "custom",
          color: input.color ?? null,
          description: input.description ?? null,
        },
      });
      if (res.property) {
        set({ properties: [...get().properties, res.property] });
        return res.property;
      }
      set({ error: res.error });
      return null;
    } catch (e) {
      set({ error: (e as Error).message });
      return null;
    }
  },

  remove: async (id) => {
    try {
      const res = await deletePinProperty({ data: { id } });
      if (res.ok) {
        set({ properties: get().properties.filter((p) => p.id !== id) });
        return true;
      }
      set({ error: res.error });
      return false;
    } catch (e) {
      set({ error: (e as Error).message });
      return false;
    }
  },
}));

export type { PinProperty };
