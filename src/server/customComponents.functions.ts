import { createServerFn } from "@tanstack/react-start";
import {
  dbDeleteComponent,
  dbGetComponent,
  dbListComponents,
  dbSaveComponent,
  runBuilderChat,
  type ComponentSpec,
} from "./customComponents.server";

interface ChatMessageInput {
  role: "user" | "assistant";
  content: string;
}

export const aiBuilderChat = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { history: ChatMessageInput[]; message: string }) => {
      if (!input || typeof input.message !== "string") {
        throw new Error("message required");
      }
      const history = Array.isArray(input.history) ? input.history.slice(-30) : [];
      return { history, message: input.message };
    },
  )
  .handler(async ({ data }) => {
    return runBuilderChat(data.history, data.message);
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
