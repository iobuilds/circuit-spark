// Pin property catalog — shared multi-select properties for board/component pins.
// Stored in public.pin_property_catalog so any admin can add new properties
// once and they become available everywhere.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface PinProperty {
  id: string;
  key: string;
  label: string;
  category: string;
  color: string | null;
  description: string | null;
  builtin: boolean;
  sort_order: number;
}

export const listPinProperties = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("pin_property_catalog")
    .select("id, key, label, category, color, description, builtin, sort_order")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (error) {
    console.error("listPinProperties failed", error);
    return { properties: [] as PinProperty[], error: error.message };
  }
  return { properties: (data ?? []) as PinProperty[], error: null };
});

const CreateSchema = z.object({
  key: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9_-]*$/, "lowercase letters, digits, dash, underscore"),
  label: z.string().min(1).max(64),
  category: z.string().min(1).max(32).default("other"),
  color: z.string().max(32).optional().nullable(),
  description: z.string().max(280).optional().nullable(),
});

export const createPinProperty = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreateSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("pin_property_catalog")
      .insert({
        key: data.key,
        label: data.label,
        category: data.category,
        color: data.color ?? null,
        description: data.description ?? null,
        builtin: false,
        sort_order: 500,
      })
      .select("id, key, label, category, color, description, builtin, sort_order")
      .single();
    if (error) {
      console.error("createPinProperty failed", error);
      return { property: null, error: error.message };
    }
    return { property: row as PinProperty, error: null };
  });

const DeleteSchema = z.object({ id: z.string().uuid() });

export const deletePinProperty = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DeleteSchema.parse(input))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("pin_property_catalog")
      .delete()
      .eq("id", data.id)
      .eq("builtin", false);
    if (error) {
      console.error("deletePinProperty failed", error);
      return { ok: false, error: error.message };
    }
    return { ok: true, error: null };
  });
