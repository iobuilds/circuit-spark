import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useIdeStore } from "@/sim/ideStore";
import { useSimStore } from "@/sim/store";
import { HAS_BACKEND, API_BASE } from "@/sim/compileApi";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PreferencesDialog({ open, onOpenChange }: Props) {
  const prefs = useIdeStore((s) => s.prefs);
  const setPrefs = useIdeStore((s) => s.setPrefs);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Preferences</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label htmlFor="font-size">Editor font size</Label>
            <Input
              id="font-size"
              type="number"
              min={10}
              max={28}
              value={prefs.fontSize}
              onChange={(e) => setPrefs({ fontSize: Math.max(10, Math.min(28, Number(e.target.value) || 13)) })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="editor-theme">Editor theme</Label>
            <Select value={prefs.editorTheme} onValueChange={(v) => setPrefs({ editorTheme: v as typeof prefs.editorTheme })}>
              <SelectTrigger id="editor-theme"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="embedsim-dark">Dark (default)</SelectItem>
                <SelectItem value="vs-dark">VS Dark</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="hc-black">High Contrast</SelectItem>
                <SelectItem value="monokai">Monokai</SelectItem>
                <SelectItem value="dracula">Dracula</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="auto-include">Auto-#include on library install</Label>
              <p className="text-xs text-muted-foreground">Inserts the primary header at the top of the active sketch.</p>
            </div>
            <Switch
              id="auto-include"
              checked={prefs.autoIncludeOnInstall}
              onCheckedChange={(v) => setPrefs({ autoIncludeOnInstall: v })}
            />
          </div>
          <div className="rounded-md bg-muted/40 border p-3 text-xs space-y-1">
            <div className="font-medium">Compile backend</div>
            <div className="text-muted-foreground">
              {HAS_BACKEND ? <>Connected to <span className="font-mono">{API_BASE}</span></> : "No backend configured. Set VITE_API_URL to point at your VPS."}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
