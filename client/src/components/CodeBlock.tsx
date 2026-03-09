import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";

const codeTheme = {
  'code[class*="language-"]': { color: "#e2e8f0", background: "none", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.8125rem", lineHeight: "1.6", tabSize: 2, hyphens: "none" as const },
  'pre[class*="language-"]': { color: "#e2e8f0", background: "#0a0a12", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.8125rem", textAlign: "left" as const, whiteSpace: "pre" as const, wordBreak: "normal" as const, lineHeight: "1.6", padding: "1.25rem", margin: "0", overflow: "auto" },
  comment: { color: "#6b7280", fontStyle: "italic" as const },
  punctuation: { color: "#94a3b8" },
  property: { color: "#86efac" },
  tag: { color: "#f9a8d4" },
  boolean: { color: "#fda4af" },
  number: { color: "#fdba74" },
  constant: { color: "#fdba74" },
  symbol: { color: "#a78bfa" },
  deleted: { color: "#fca5a5" },
  selector: { color: "#86efac" },
  "attr-name": { color: "#7dd3fc" },
  string: { color: "#6ee7b7" },
  char: { color: "#6ee7b7" },
  builtin: { color: "#a78bfa" },
  inserted: { color: "#bbf7d0" },
  operator: { color: "#94a3b8" },
  url: { color: "#7dd3fc" },
  variable: { color: "#e2e8f0" },
  atrule: { color: "#a78bfa" },
  "attr-value": { color: "#6ee7b7" },
  function: { color: "#93c5fd" },
  keyword: { color: "#f9a8d4" },
  regex: { color: "#fde68a" },
  important: { color: "#fde68a", fontWeight: "bold" as const },
  bold: { fontWeight: "bold" as const },
  italic: { fontStyle: "italic" as const },
};

interface CodeBlockProps {
  code: string;
  language: string;
}

export default function CodeBlock({ code, language }: CodeBlockProps) {
  return (
    <SyntaxHighlighter
      style={codeTheme as Record<string, React.CSSProperties>}
      language={language}
      PreTag="div"
      customStyle={{ margin: 0, borderRadius: 0, background: "#0a0a12", overflowX: "auto" }}
    >
      {code}
    </SyntaxHighlighter>
  );
}
