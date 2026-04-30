// Browser-side registry of custom components loaded from Lovable Cloud.
// Lets the simulator render AI-generated SVGs at runtime alongside built-in kinds.

import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";
import type { CustomComponentRow, ImportedComponent } from "./componentPack";

interface State {
  loaded: boolean;
  loading: boolean;
  items: CustomComponentRow[];
  bySlug: Record<string, CustomComponentRow>;
  load: () => Promise<void>;
  upsertLocal: (row: CustomComponentRow) => void;
  removeLocal: (id: string) => void;
}

export const useCustomComponentRegistry = create<State>((set, get) => ({
  loaded: false,
  loading: false,
  items: [],
  bySlug: {},
  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    const { data, error } = await supabase
      .from("custom_components")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) {
      console.error("custom_components load failed", error);
      set({ loading: false });
      return;
    }
    const items = (data ?? []) as unknown as CustomComponentRow[];
    const bySlug: Record<string, CustomComponentRow> = {};
    for (const it of items) bySlug[it.slug] = it;
    set({ items, bySlug, loaded: true, loading: false });
  },
  upsertLocal: (row) => {
    const items = [row, ...get().items.filter((i) => i.id !== row.id)];
    const bySlug = { ...get().bySlug, [row.slug]: row };
    set({ items, bySlug });
  },
  removeLocal: (id) => {
    const items = get().items.filter((i) => i.id !== id);
    const bySlug = { ...get().bySlug };
    for (const k of Object.keys(bySlug)) if (bySlug[k].id === id) delete bySlug[k];
    set({ items, bySlug });
  },
}));

export function getCustomBySlug(slug: string) {
  return useCustomComponentRegistry.getState().bySlug[slug];
}

export function importedToRow(imp: ImportedComponent): CustomComponentRow {
  return {
    id: `local-${imp.slug}`,
    name: imp.name,
    slug: imp.slug,
    kind: imp.kind,
    description: imp.description,
    svg: imp.svg,
    spec: {
      width: imp.width,
      height: imp.height,
      pins: imp.pins,
      defaults: imp.defaults,
      behaviorNotes: imp.behaviorNotes,
      behavior: imp.behavior,
    },
    behavior: imp.behaviorNotes ?? "",
    version: 1,
  };
}
