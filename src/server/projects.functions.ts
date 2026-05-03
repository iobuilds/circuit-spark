import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Id = z.string().uuid();

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("projects").select("*").order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { name: string; description?: string; board?: string }) =>
    z.object({
      name: z.string().min(1).max(120),
      description: z.string().max(500).optional(),
      board: z.string().max(40).optional(),
    }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("projects").insert({ ...data, user_id: userId }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => ({ id: Id.parse(i.id) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("projects").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listProjectFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { projectId: string }) => ({ projectId: Id.parse(i.projectId) }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("project_files").select("*").eq("project_id", data.projectId).order("path");
    if (error) throw new Error(error.message);
    return { items: rows ?? [] };
  });

export const upsertProjectFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: {
    projectId: string; path: string; kind?: "source" | "asset" | "lib_zip";
    mime?: string; content?: string; storagePath?: string; size?: number;
  }) => z.object({
    projectId: Id, path: z.string().min(1).max(255),
    kind: z.enum(["source", "asset", "lib_zip"]).default("source"),
    mime: z.string().max(120).optional(),
    content: z.string().max(2_000_000).optional(),
    storagePath: z.string().max(500).optional(),
    size: z.number().int().min(0).max(20_000_000).default(0),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase.from("project_files").upsert({
      project_id: data.projectId, user_id: userId, path: data.path,
      kind: data.kind, mime: data.mime, content: data.content ?? null,
      storage_path: data.storagePath ?? null, size: data.size,
    }, { onConflict: "project_id,path" }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteProjectFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => ({ id: Id.parse(i.id) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("project_files").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listProjectLibraries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { projectId: string }) => ({ projectId: Id.parse(i.projectId) }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("project_libraries").select("*").eq("project_id", data.projectId).order("name");
    if (error) throw new Error(error.message);
    return { items: rows ?? [] };
  });

export const addProjectLibrary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { projectId: string; name: string; source?: "manual" | "auto" }) =>
    z.object({
      projectId: Id, name: z.string().min(1).max(120),
      source: z.enum(["manual", "auto"]).default("manual"),
    }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase.from("project_libraries").upsert({
      project_id: data.projectId, user_id: userId, name: data.name, source: data.source,
    }, { onConflict: "project_id,name" }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const removeProjectLibrary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => ({ id: Id.parse(i.id) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("project_libraries").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
