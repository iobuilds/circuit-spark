import { Link, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAdminStore } from "@/sim/adminStore";
import { Toaster } from "@/components/ui/sonner";
import { ArrowLeft, Cpu, LibraryBig, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — EmbedSim" },
      { name: "description", content: "Manage boards and components for the EmbedSim simulator." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  const hydrate = useAdminStore((s) => s.hydrate);
  const loaded = useAdminStore((s) => s.loaded);
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => { if (!loaded) hydrate(); }, [hydrate, loaded]);

  return (
    <div className="light min-h-screen bg-background text-foreground">
      <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Simulator
        </Link>
        <div className="h-5 w-px bg-border mx-2" />
        <Link to="/admin" className="flex items-center gap-2 font-semibold">
          <Cpu className="h-5 w-5 text-primary" /> EmbedSim Admin
        </Link>
        <div className="flex-1" />
        <Crumbs path={path} />
      </header>

      <div className="grid grid-cols-[220px_1fr] min-h-[calc(100vh-3.5rem)]">
        <aside className="border-r border-border bg-card/50 p-3 space-y-1">
          <SideLink to="/admin" exact icon={<LibraryBig className="h-4 w-4" />} label="Library Manager" />
        </aside>
        <main className="p-6 overflow-x-auto">
          {loaded ? <Outlet /> : <div className="text-muted-foreground text-sm">Loading…</div>}
        </main>
      </div>
      <Toaster />
    </div>
  );
}

function SideLink({ to, label, icon, exact }: { to: string; label: string; icon: React.ReactNode; exact?: boolean }) {
  return (
    <Link
      to={to}
      activeProps={{ className: "bg-accent text-foreground" }}
      activeOptions={{ exact }}
      className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
    >
      {icon} {label}
    </Link>
  );
}

function Crumbs({ path }: { path: string }) {
  const parts = path.split("/").filter(Boolean);
  return (
    <nav className="text-xs text-muted-foreground flex items-center gap-1.5">
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="h-3 w-3" />}
          <span className={i === parts.length - 1 ? "text-foreground" : ""}>{p}</span>
        </span>
      ))}
    </nav>
  );
}
