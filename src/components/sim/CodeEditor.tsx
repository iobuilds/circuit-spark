import Editor, { type Monaco } from "@monaco-editor/react";
import { useSimStore } from "@/sim/store";
import { useIdeStore } from "@/sim/ideStore";
import { useCallback, useEffect, useRef } from "react";
import { LIBRARY_PACKAGES } from "@/sim/ideCatalog";

type IStandaloneCodeEditor = Parameters<NonNullable<Parameters<typeof Editor>[0]["onMount"]>>[0];

export function CodeEditor() {
  const ideLoaded = useIdeStore((s) => s.loaded);
  const hydrate = useIdeStore((s) => s.hydrate);
  const files = useIdeStore((s) => s.files);
  const activeFileId = useIdeStore((s) => s.activeFileId);
  const updateFileContent = useIdeStore((s) => s.updateFileContent);
  const installedLibraries = useIdeStore((s) => s.installedLibraries);
  const prefs = useIdeStore((s) => s.prefs);

  const setSimCode = useSimStore((s) => s.setCode);
  const theme = useSimStore((s) => s.theme);

  const editorRef = useRef<IStandaloneCodeEditor | null>(null);

  useEffect(() => { if (!ideLoaded) hydrate(); }, [ideLoaded, hydrate]);

  const activeFile = files.find((f) => f.id === activeFileId) ?? files[0];

  // Keep the simulator store's `code` mirrored to the active .ino file so the
  // in-browser worker simulation keeps working with the existing pipeline.
  useEffect(() => {
    if (!activeFile) return;
    if (activeFile.kind === "ino") {
      setSimCode(activeFile.content);
    } else {
      // fall back to first .ino file
      const ino = files.find((f) => f.kind === "ino");
      if (ino) setSimCode(ino.content);
    }
  }, [activeFile, files, setSimCode]);

  // Library headers for autocomplete
  const libHeaders = installedLibraries.flatMap((l) => {
    const cat = LIBRARY_PACKAGES.find((c) => c.id === l.id);
    return l.headers ?? cat?.headers ?? [];
  });

  const handleMount = useCallback((editor: IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editor;

    monaco.languages.register({ id: "arduino" });
    monaco.languages.setMonarchTokensProvider("arduino", {
      defaultToken: "",
      tokenPostfix: ".ino",
      keywords: [
        "void","int","long","short","unsigned","signed","float","double","bool","boolean","byte","char","String",
        "if","else","for","while","do","switch","case","default","break","continue","return","true","false",
        "const","static","sizeof","struct","class","public","private","new","delete","include","define",
      ],
      typeKeywords: ["HIGH","LOW","INPUT","OUTPUT","INPUT_PULLUP","LED_BUILTIN","A0","A1","A2","A3","A4","A5"],
      builtins: [
        "setup","loop","pinMode","digitalWrite","digitalRead","analogWrite","analogRead",
        "delay","delayMicroseconds","millis","micros","Serial","tone","noTone","map","constrain","random",
        "abs","min","max","pow","sqrt","sin","cos","tan",
      ],
      operators: ["=","==","!=","<",">","<=",">=","+","-","*","/","%","&","|","^","!","~","&&","||","++","--","<<",">>"],
      symbols: /[=><!~?:&|+\-*/^%]+/,
      tokenizer: {
        root: [
          [/^\s*#\s*\w+/, "keyword.directive"],
          [/\/\/.*$/, "comment"],
          [/\/\*/, "comment", "@comment"],
          [/"([^"\\]|\\.)*$/, "string.invalid"],
          [/"/, "string", "@string"],
          [/'([^'\\]|\\.)*'/, "string"],
          [/\b\d+\.\d+\b/, "number.float"],
          [/\b0[xX][0-9a-fA-F]+\b/, "number.hex"],
          [/\b\d+\b/, "number"],
          [/[A-Z][\w$]*/, { cases: { "@typeKeywords": "type", "@default": "type.identifier" } }],
          [/[a-zA-Z_]\w*/, {
            cases: {
              "@keywords": "keyword",
              "@builtins": "support.function",
              "@default": "identifier",
            },
          }],
          [/[{}()\[\]]/, "@brackets"],
          [/@symbols/, "operator"],
        ],
        comment: [
          [/[^/*]+/, "comment"],
          [/\*\//, "comment", "@pop"],
          [/[/*]/, "comment"],
        ],
        string: [
          [/[^\\"]+/, "string"],
          [/\\./, "string.escape"],
          [/"/, "string", "@pop"],
        ],
      },
    });

    // Library-aware completion provider
    monaco.languages.registerCompletionItemProvider("arduino", {
      triggerCharacters: ["<", " ", "."],
      provideCompletionItems: (
        model: { getWordUntilPosition: (p: { lineNumber: number; column: number }) => { startColumn: number; endColumn: number } },
        position: { lineNumber: number; column: number },
      ) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const builtinSnippets: [string, string][] = [
          ["pinMode", "pinMode(${1:pin}, ${2:OUTPUT});"],
          ["digitalWrite", "digitalWrite(${1:pin}, ${2:HIGH});"],
          ["digitalRead", "digitalRead(${1:pin})"],
          ["analogWrite", "analogWrite(${1:pin}, ${2:value});"],
          ["analogRead", "analogRead(${1:pin})"],
          ["delay", "delay(${1:ms});"],
          ["Serial.begin", "Serial.begin(${1:9600});"],
          ["Serial.print", "Serial.print(${1:value});"],
          ["Serial.println", "Serial.println(${1:value});"],
          ["millis", "millis()"],
          ["setup", "void setup() {\n\t$0\n}"],
          ["loop", "void loop() {\n\t$0\n}"],
          ["if", "if (${1:condition}) {\n\t$0\n}"],
          ["for", "for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t$0\n}"],
        ];
        const builtin = builtinSnippets.map(([label, ins]) => ({
          label,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: ins,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          detail: "Arduino built-in",
        }));
        const includes = libHeaders.map((h) => ({
          label: `#include <${h}>`,
          kind: monaco.languages.CompletionItemKind.Module,
          insertText: `#include <${h}>`,
          range,
          detail: "Library header",
        }));
        return { suggestions: [...builtin, ...includes] };
      },
    });

    // Hover for built-in funcs
    monaco.languages.registerHoverProvider("arduino", {
      provideHover: (
        model: { getWordAtPosition: (p: { lineNumber: number; column: number }) => { word: string } | null },
        position: { lineNumber: number; column: number },
      ) => {
        const word = model.getWordAtPosition(position);
        if (!word) return null;
        const docs: Record<string, string> = {
          pinMode: "**pinMode(pin, mode)**\nConfigure a pin as INPUT, OUTPUT, or INPUT_PULLUP.",
          digitalWrite: "**digitalWrite(pin, value)**\nWrite HIGH (1) or LOW (0) to a digital pin.",
          digitalRead: "**digitalRead(pin)**\nRead the value of a digital pin: HIGH or LOW.",
          analogWrite: "**analogWrite(pin, value)**\nWrite a PWM value (0–255) to a PWM-capable pin.",
          analogRead: "**analogRead(pin)**\nRead an analog value (0–1023) from an analog pin (A0–A5).",
          delay: "**delay(ms)**\nPause the program for the given number of milliseconds.",
          millis: "**millis()**\nReturn milliseconds since the program started (unsigned long).",
          Serial: "**Serial**\nThe serial port object. Common methods: begin(baud), print(v), println(v), available(), read().",
        };
        const text = docs[word.word];
        if (!text) return null;
        return { contents: [{ value: text }] };
      },
    });

    // Themes
    monaco.editor.defineTheme("embedsim-dark", {
      base: "vs-dark", inherit: true,
      rules: [
        { token: "comment", foreground: "5b6378", fontStyle: "italic" },
        { token: "keyword", foreground: "ff79c6" },
        { token: "keyword.directive", foreground: "ffb86c" },
        { token: "support.function", foreground: "8be9fd" },
        { token: "type", foreground: "f1fa8c" },
        { token: "number", foreground: "bd93f9" },
        { token: "string", foreground: "50fa7b" },
      ],
      colors: {
        "editor.background": "#1c2230",
        "editor.foreground": "#e6e9ef",
        "editorLineNumber.foreground": "#4a5366",
        "editor.selectionBackground": "#2c3a55",
        "editor.lineHighlightBackground": "#22293a",
      },
    });
    monaco.editor.defineTheme("monokai", {
      base: "vs-dark", inherit: true,
      rules: [
        { token: "comment", foreground: "75715e", fontStyle: "italic" },
        { token: "keyword", foreground: "f92672" },
        { token: "support.function", foreground: "66d9ef" },
        { token: "string", foreground: "e6db74" },
        { token: "number", foreground: "ae81ff" },
      ],
      colors: { "editor.background": "#272822", "editor.foreground": "#f8f8f2" },
    });
    monaco.editor.defineTheme("dracula", {
      base: "vs-dark", inherit: true,
      rules: [
        { token: "comment", foreground: "6272a4", fontStyle: "italic" },
        { token: "keyword", foreground: "ff79c6" },
        { token: "support.function", foreground: "8be9fd" },
        { token: "string", foreground: "f1fa8c" },
        { token: "number", foreground: "bd93f9" },
      ],
      colors: { "editor.background": "#282a36", "editor.foreground": "#f8f8f2" },
    });

    // Action: format
    editor.addAction({
      id: "ide-auto-format",
      label: "Auto Format",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyT],
      run: () => simpleFormat(editor),
    });

    // Listen for events from menubar
    const onFormat = () => simpleFormat(editor);
    const onFind = () => editor.trigger("kbd", "actions.find", null);
    window.addEventListener("ide:format", onFormat);
    window.addEventListener("ide:find", onFind);

    // Jump to a line/column when the error panel asks for it.
    const onGotoLine = (e: Event) => {
      const detail = (e as CustomEvent<{ line: number; col?: number }>).detail;
      if (!detail || !detail.line) return;
      const line = Math.max(1, detail.line);
      const col = Math.max(1, detail.col ?? 1);
      try {
        editor.revealLineInCenter(line);
        editor.setPosition({ lineNumber: line, column: col });
        editor.focus();
      } catch { /* model may not be ready */ }
    };
    window.addEventListener("ide:goto-line", onGotoLine);

    // Apply compile diagnostics as inline Monaco markers (red squiggles in the
    // editor + entries in the gutter / minimap). Markers are keyed by file
    // name; we resolve the matching open model and set the markers there.
    type Diag = { file: string; line: number; col?: number; severity?: "error" | "warning"; message: string };
    const onDiagnostics = (e: Event) => {
      const detail = (e as CustomEvent<{ errors?: Diag[]; warnings?: Diag[] }>).detail || {};
      const all: Diag[] = [
        ...(detail.errors ?? []).map((d) => ({ ...d, severity: "error" as const })),
        ...(detail.warnings ?? []).map((d) => ({ ...d, severity: "warning" as const })),
      ];
      const byFile = new Map<string, Diag[]>();
      for (const d of all) {
        if (!d.file) continue;
        const arr = byFile.get(d.file) ?? [];
        arr.push(d);
        byFile.set(d.file, arr);
      }

      // Clear markers on every model owned by us, then set fresh ones.
      const owner = "embedsim-compiler";
      for (const model of monaco.editor.getModels()) {
        monaco.editor.setModelMarkers(model, owner, []);
      }
      for (const [fileName, diags] of byFile) {
        const model = monaco.editor
          .getModels()
          .find((m: { uri: { path: string; toString: () => string } }) =>
            m.uri.path.endsWith("/" + fileName) || m.uri.path === fileName || m.uri.toString().endsWith(fileName),
          );
        if (!model) continue;
        const markers = diags.map((d) => {
          const lineLen = (() => {
            try { return model.getLineMaxColumn(d.line); } catch { return 1000; }
          })();
          const startCol = Math.max(1, d.col ?? 1);
          return {
            severity: d.severity === "warning"
              ? monaco.MarkerSeverity.Warning
              : monaco.MarkerSeverity.Error,
            message: d.message,
            startLineNumber: d.line,
            startColumn: startCol,
            endLineNumber: d.line,
            endColumn: lineLen,
            source: "EmbedSim",
          };
        });
        monaco.editor.setModelMarkers(model, owner, markers);
      }
    };
    window.addEventListener("ide:set-diagnostics", onDiagnostics);

    // Cleanup
    editor.onDidDispose(() => {
      window.removeEventListener("ide:format", onFormat);
      window.removeEventListener("ide:find", onFind);
      window.removeEventListener("ide:goto-line", onGotoLine);
      window.removeEventListener("ide:set-diagnostics", onDiagnostics);
    });
  }, [libHeaders]);

  const editorTheme =
    prefs.editorTheme === "embedsim-dark" ? (theme === "dark" ? "embedsim-dark" : "light")
    : prefs.editorTheme;

  if (!activeFile) {
    return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No active file</div>;
  }

  const monacoLang = activeFile.kind === "ino" ? "arduino" : "cpp";

  return (
    <Editor
      height="100%"
      path={activeFile.id}
      defaultLanguage={monacoLang}
      language={monacoLang}
      value={activeFile.content}
      onChange={(v) => updateFileContent(activeFile.id, v ?? "")}
      onMount={handleMount}
      theme={editorTheme}
      options={{
        fontSize: prefs.fontSize,
        minimap: { enabled: true, maxColumn: 80 },
        scrollBeyondLastLine: false,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        lineNumbers: "on",
        renderLineHighlight: "line",
        smoothScrolling: true,
        tabSize: 2,
        glyphMargin: true,
        bracketPairColorization: { enabled: true },
        wordWrap: "off",
        folding: true,
        multiCursorModifier: "alt",
      }}
    />
  );
}

function simpleFormat(editor: IStandaloneCodeEditor) {
  // Simple formatter: re-indents braces. Not as good as clang-format, but works offline.
  const model = editor.getModel?.();
  if (!model) return;
  const text = model.getValue();
  const lines = text.split(/\r?\n/);
  let depth = 0;
  const out = lines.map((raw) => {
    const trimmed = raw.trim();
    if (trimmed.startsWith("}")) depth = Math.max(0, depth - 1);
    const indented = "  ".repeat(depth) + trimmed;
    const opens = (trimmed.match(/{/g) ?? []).length;
    const closes = (trimmed.match(/}/g) ?? []).length;
    depth += opens - closes;
    if (depth < 0) depth = 0;
    return indented;
  });
  model.setValue(out.join("\n"));
}
