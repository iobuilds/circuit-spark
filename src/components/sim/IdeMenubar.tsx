import {
  Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarSeparator,
  MenubarShortcut, MenubarSub, MenubarSubContent, MenubarSubTrigger, MenubarTrigger,
} from "@/components/ui/menubar";
import { useState, useRef } from "react";
import { useIdeStore } from "@/sim/ideStore";
import { useSimStore } from "@/sim/store";
import { TEMPLATES } from "@/sim/templates";
import { LIBRARY_PACKAGES } from "@/sim/ideCatalog";
import { BoardManagerDialog } from "./BoardManagerDialog";
import { LibraryManagerDialog } from "./LibraryManagerDialog";
import { PreferencesDialog } from "./PreferencesDialog";
import { FileManagerDialog } from "./FileManagerDialog";
import { toast } from "sonner";

interface Props {
  onCompile: () => void;
  onUpload: () => void;
}

export function IdeMenubar({ onCompile, onUpload }: Props) {
  const [boardMgrOpen, setBoardMgrOpen] = useState(false);
  const [libMgrOpen, setLibMgrOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [fileMgrOpen, setFileMgrOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const addFile = useIdeStore((s) => s.addFile);
  const importFile = useIdeStore((s) => s.importFile);
  const files = useIdeStore((s) => s.files);
  const activeFileId = useIdeStore((s) => s.activeFileId);
  const installedLibraries = useIdeStore((s) => s.installedLibraries);
  const loadProject = useSimStore((s) => s.loadProject);
  const code = useSimStore((s) => s.code);
  const components = useSimStore((s) => s.components);
  const wires = useSimStore((s) => s.wires);
  const boardId = useSimStore((s) => s.boardId);

  function handleNewSketch() {
    addFile(`sketch_${Date.now().toString(36)}.ino`, "ino", "void setup() {\n\n}\n\nvoid loop() {\n\n}\n");
    toast.success("New sketch tab created");
  }

  function handleSave() {
    const data = { code, components, wires, boardId, files };
    localStorage.setItem("embedsim:project", JSON.stringify(data));
    toast.success("Project saved");
  }

  function handleSaveAs() {
    const blob = new Blob([JSON.stringify({ files }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "sketch.json"; a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportBinary() {
    const active = files.find((f) => f.id === activeFileId);
    const blob = new Blob([active?.content ?? ""], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = active?.name ?? "sketch.ino"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Source exported. Compile via backend for .hex output.");
  }

  function triggerFileImport() { fileInputRef.current?.click(); }
  async function onFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      const text = await f.text();
      importFile(f.name, text);
    }
    e.target.value = "";
    toast.success(`${list.length} file(s) imported`);
  }

  function insertInclude(header: string) {
    const f = files.find((x) => x.id === activeFileId);
    if (!f) return;
    const include = `#include <${header}>\n`;
    if (f.content.includes(include)) {
      toast.info(`${header} already included`);
      return;
    }
    useIdeStore.getState().updateFileContent(f.id, include + f.content);
    toast.success(`Included <${header}>`);
  }

  return (
    <>
      <input ref={fileInputRef} type="file" multiple accept=".ino,.h,.hpp,.cpp,.cc,.c,.txt" className="hidden" onChange={onFilesSelected} />

      <Menubar className="rounded-none border-0 border-b border-border h-8 px-1 bg-card">
        <MenubarMenu>
          <MenubarTrigger className="text-xs h-7">File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={handleNewSketch}>New Sketch <MenubarShortcut>⌘N</MenubarShortcut></MenubarItem>
            <MenubarItem onClick={triggerFileImport}>Open File...</MenubarItem>
            <MenubarItem onClick={() => setFileMgrOpen(true)}>File Manager...</MenubarItem>
            <MenubarSub>
              <MenubarSubTrigger>Examples</MenubarSubTrigger>
              <MenubarSubContent>
                {TEMPLATES.map((t) => (
                  <MenubarItem key={t.id} onClick={() => { loadProject(t); toast.success(`Loaded "${t.name}"`); }}>
                    {t.name}
                  </MenubarItem>
                ))}
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSeparator />
            <MenubarItem onClick={handleSave}>Save <MenubarShortcut>⌘S</MenubarShortcut></MenubarItem>
            <MenubarItem onClick={handleSaveAs}>Save As...</MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={() => setPrefsOpen(true)}>Preferences...</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="text-xs h-7">Edit</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={() => document.execCommand("undo")}>Undo <MenubarShortcut>⌘Z</MenubarShortcut></MenubarItem>
            <MenubarItem onClick={() => document.execCommand("redo")}>Redo <MenubarShortcut>⇧⌘Z</MenubarShortcut></MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={() => document.execCommand("cut")}>Cut <MenubarShortcut>⌘X</MenubarShortcut></MenubarItem>
            <MenubarItem onClick={() => document.execCommand("copy")}>Copy <MenubarShortcut>⌘C</MenubarShortcut></MenubarItem>
            <MenubarItem onClick={() => document.execCommand("paste")}>Paste <MenubarShortcut>⌘V</MenubarShortcut></MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={() => window.dispatchEvent(new CustomEvent("ide:find"))}>
              Find... <MenubarShortcut>⌘F</MenubarShortcut>
            </MenubarItem>
            <MenubarItem onClick={() => window.dispatchEvent(new CustomEvent("ide:format"))}>
              Auto Format <MenubarShortcut>⌘T</MenubarShortcut>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="text-xs h-7">Sketch</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={onCompile}>Verify / Compile <MenubarShortcut>⌘R</MenubarShortcut></MenubarItem>
            <MenubarItem onClick={onUpload}>Upload <MenubarShortcut>⌘U</MenubarShortcut></MenubarItem>
            <MenubarItem onClick={handleExportBinary}>Export Compiled Binary</MenubarItem>
            <MenubarSeparator />
            <MenubarSub>
              <MenubarSubTrigger>Include Library</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem onClick={() => setLibMgrOpen(true)}>Manage Libraries...</MenubarItem>
                <MenubarItem onClick={() => { setLibMgrOpen(true); toast.info("Use the upload button in the dialog"); }}>
                  Add .ZIP Library...
                </MenubarItem>
                <MenubarSeparator />
                {installedLibraries.length === 0 ? (
                  <MenubarItem disabled>No libraries installed</MenubarItem>
                ) : (
                  installedLibraries.slice(0, 12).map((l) => {
                    const cat = LIBRARY_PACKAGES.find((x) => x.id === l.id);
                    const header = l.headers?.[0] ?? cat?.headers[0];
                    if (!header) return null;
                    return (
                      <MenubarItem key={l.id} onClick={() => insertInclude(header)}>
                        {cat?.name ?? l.name ?? l.id}
                      </MenubarItem>
                    );
                  })
                )}
              </MenubarSubContent>
            </MenubarSub>
            <MenubarItem onClick={triggerFileImport}>Add File...</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="text-xs h-7">Tools</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={() => setBoardMgrOpen(true)}>Board: Boards Manager...</MenubarItem>
            <MenubarItem onClick={() => setLibMgrOpen(true)}>Manage Libraries...</MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={() => window.dispatchEvent(new CustomEvent("ide:open-serial"))}>
              Serial Monitor
            </MenubarItem>
            <MenubarItem onClick={() => window.dispatchEvent(new CustomEvent("ide:open-plotter"))}>
              Serial Plotter
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={() => window.dispatchEvent(new CustomEvent("ide:format"))}>
              Auto Format <MenubarShortcut>⌘T</MenubarShortcut>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="text-xs h-7">Help</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={() => window.open("/docs", "_blank")}>Documentation</MenubarItem>
            <MenubarItem onClick={() => window.open("/examples", "_blank")}>Browse Examples</MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={() => window.open("https://www.arduino.cc/reference/", "_blank")}>
              Arduino Reference ↗
            </MenubarItem>
            <MenubarItem onClick={() => window.open("/about", "_blank")}>About EmbedSim</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      <BoardManagerDialog open={boardMgrOpen} onOpenChange={setBoardMgrOpen} />
      <LibraryManagerDialog open={libMgrOpen} onOpenChange={setLibMgrOpen} />
      <PreferencesDialog open={prefsOpen} onOpenChange={setPrefsOpen} />
      <FileManagerDialog open={fileMgrOpen} onOpenChange={setFileMgrOpen} />
    </>
  );
}
