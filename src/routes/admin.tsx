import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAdminStore } from "@/sim/adminStore";

// Pathless layout for the /admin section. The actual pages live in:
//   admin.index.tsx                 -> /admin           (Library Manager)
//   admin.ai.tsx                    -> /admin/ai        (AI Component Builder)
//   admin.boards.$boardId.edit.tsx  -> /admin/boards/:id/edit
//   admin.components.$componentId.edit.tsx -> /admin/components/:id/edit
export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const loaded = useAdminStore((s) => s.loaded);
  const hydrate = useAdminStore((s) => s.hydrate);

  useEffect(() => {
    if (!loaded) hydrate();
  }, [loaded, hydrate]);

  if (!loaded) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading library…</div>
    );
  }

  return (
    <div className="p-6">
      <Outlet />
    </div>
  );
}
