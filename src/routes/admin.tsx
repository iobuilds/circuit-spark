import { createFileRoute, Outlet } from "@tanstack/react-router";

// Pathless layout for the /admin section. The actual pages live in:
//   admin.index.tsx                 -> /admin           (Library Manager)
//   admin.ai.tsx                    -> /admin/ai        (AI Component Builder)
//   admin.boards.$boardId.edit.tsx  -> /admin/boards/:id/edit
//   admin.components.$componentId.edit.tsx -> /admin/components/:id/edit
export const Route = createFileRoute("/admin")({
  component: () => <Outlet />,
});
