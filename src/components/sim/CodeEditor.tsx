import Editor, { type Monaco } from "@monaco-editor/react";
import { useSimStore } from "@/sim/store";
import { useCallback } from "react";

export function CodeEditor() {
  const code = useSimStore((s) => s.code);
  const setCode = useSimStore((s) => s.setCode);
  const theme = useSimStore((s) => s.theme);

  const handleMount = useCallback((_editor: unknown, monaco: Monaco) => {
    monaco.languages.register({ id: "arduino" });
    monaco.languages.setMonarchTokensProvider("arduino", {
      defaultToken: "",
      tokenPostfix: ".ino",
      keywords: [
        "void","int","long","short","unsigned","signed","float","double","bool","boolean","byte","char","String",
        "if","else","for","while","do","switch","case","default","break","continue","return","true","false",
        "const","static","sizeof","struct","class","public","private","new","delete",
      ],
      typeKeywords: ["HIGH","LOW","INPUT","OUTPUT","INPUT_PULLUP","LED_BUILTIN"],
      builtins: [
        "setup","loop","pinMode","digitalWrite","digitalRead","analogWrite","analogRead",
        "delay","delayMicroseconds","millis","micros","Serial","tone","noTone","map","constrain","random",
      ],
      operators: ["=","==","!=","<",">","<=",">=","+","-","*","/","%","&","|","^","!","~","&&","||","++","--","<<",">>"],
      symbols: /[=><!~?:&|+\-*/^%]+/,
      tokenizer: {
        root: [
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
    monaco.languages.registerCompletionItemProvider("arduino", {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const sugg = [
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
        ];
        return {
          suggestions: sugg.map(([label, ins]) => ({
            label,
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: ins,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
          })),
        };
      },
    });
    monaco.editor.defineTheme("embedsim-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "5b6378", fontStyle: "italic" },
        { token: "keyword", foreground: "ff79c6" },
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
  }, []);

  return (
    <Editor
      height="100%"
      defaultLanguage="arduino"
      language="arduino"
      value={code}
      onChange={(v) => setCode(v ?? "")}
      onMount={handleMount}
      theme={theme === "dark" ? "embedsim-dark" : "light"}
      options={{
        fontSize: 13,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        lineNumbers: "on",
        renderLineHighlight: "line",
        smoothScrolling: true,
        tabSize: 2,
      }}
    />
  );
}
