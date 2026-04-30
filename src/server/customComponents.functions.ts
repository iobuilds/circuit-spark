import { createServerFn } from "@tanstack/react-start";
import {
  dbDeleteComponent,
  dbGetComponent,
  dbListComponents,
  dbSaveComponent,
  runBuilderChat,
  type ComponentSpec,
} from "./customComponents.server";
import { searchArduinoLibraries } from "./arduinoLibs.server";

interface ChatMessageInput {
  role: "user" | "assistant";
  content: string;
}

export const aiBuilderChat = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { history: ChatMessageInput[]; message: string; images?: string[] }) => {
      if (!input || typeof input.message !== "string") {
        throw new Error("message required");
      }
      const history = Array.isArray(input.history) ? input.history.slice(-30) : [];
      const images = Array.isArray(input.images)
        ? input.images.filter((s) => typeof s === "string" && s.startsWith("data:image/")).slice(0, 4)
        : undefined;
      return { history, message: input.message, images };
    },
  )
  .handler(async ({ data }) => {
    return runBuilderChat(data.history, data.message, data.images);
  });

export const listCustomComponents = createServerFn({ method: "GET" }).handler(async () => {
  const rows = await dbListComponents();
  return { items: rows };
});

export const getCustomComponent = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("id required");
    return input;
  })
  .handler(async ({ data }) => {
    return dbGetComponent(data.id);
  });

export const saveCustomComponent = createServerFn({ method: "POST" })
  .inputValidator((input: { spec: ComponentSpec & { svg: string } }) => {
    if (!input?.spec?.slug) throw new Error("spec.slug required");
    return input;
  })
  .handler(async ({ data }) => {
    const row = await dbSaveComponent(data.spec);
    return row;
  });

export const deleteCustomComponent = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("id required");
    return input;
  })
  .handler(async ({ data }) => {
    return dbDeleteComponent(data.id);
  });

export const findArduinoLibraries = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      name?: string;
      slug?: string;
      description?: string;
      keywords?: string[];
      limit?: number;
    }) => ({
      name: typeof input?.name === "string" ? input.name.slice(0, 200) : undefined,
      slug: typeof input?.slug === "string" ? input.slug.slice(0, 200) : undefined,
      description:
        typeof input?.description === "string" ? input.description.slice(0, 1000) : undefined,
      keywords: Array.isArray(input?.keywords)
        ? input.keywords.filter((k) => typeof k === "string").slice(0, 10)
        : undefined,
      limit: typeof input?.limit === "number" ? Math.min(20, Math.max(1, input.limit)) : 8,
    }),
  )
  .handler(async ({ data }) => {
    try {
      const matches = await searchArduinoLibraries(data);
      return { matches, error: null };
    } catch (e) {
      return { matches: [], error: (e as Error).message };
    }
  });
