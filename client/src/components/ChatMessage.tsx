import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check, User, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/chat-storage";

interface CopyButtonProps {
  text: string;
}

function CopyButton({ text }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={handleCopy}
      data-testid="button-copy-code"
      className="h-7 w-7 absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-700 text-zinc-200"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
    </Button>
  );
}

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      data-testid={`message-${message.id}`}
      className={cn(
        "flex gap-3 px-4 py-5 group",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        )}
        data-testid={`avatar-${message.role}`}
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      <div
        className={cn(
          "flex flex-col gap-1 max-w-[80%] min-w-0",
          isUser ? "items-end" : "items-start"
        )}
      >
        <div
          className={cn(
            "rounded-xl px-4 py-3 text-sm leading-relaxed",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-card border border-card-border text-card-foreground"
          )}
          data-testid={`content-${message.role}`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none break-words">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ node, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "");
                    const codeString = String(children).replace(/\n$/, "");
                    const isInline = !match;

                    if (isInline) {
                      return (
                        <code
                          className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs"
                          {...props}
                        >
                          {children}
                        </code>
                      );
                    }

                    return (
                      <div className="relative group rounded-lg overflow-hidden my-3">
                        <div className="flex items-center justify-between bg-zinc-800 px-4 py-1.5">
                          <span className="text-xs text-zinc-400 font-mono">
                            {match[1]}
                          </span>
                          <CopyButton text={codeString} />
                        </div>
                        <SyntaxHighlighter
                          style={oneDark}
                          language={match[1]}
                          PreTag="div"
                          customStyle={{
                            margin: 0,
                            borderRadius: 0,
                            fontSize: "0.8125rem",
                            background: "#1e1e2e",
                          }}
                        >
                          {codeString}
                        </SyntaxHighlighter>
                      </div>
                    );
                  },
                  pre({ children }) {
                    return <>{children}</>;
                  },
                  p({ children }) {
                    return <p className="mb-3 last:mb-0">{children}</p>;
                  },
                  ul({ children }) {
                    return <ul className="mb-3 last:mb-0 ml-4 list-disc space-y-1">{children}</ul>;
                  },
                  ol({ children }) {
                    return <ol className="mb-3 last:mb-0 ml-4 list-decimal space-y-1">{children}</ol>;
                  },
                  h1({ children }) {
                    return <h1 className="text-xl font-bold mb-3 mt-4 first:mt-0">{children}</h1>;
                  },
                  h2({ children }) {
                    return <h2 className="text-lg font-semibold mb-2 mt-4 first:mt-0">{children}</h2>;
                  },
                  h3({ children }) {
                    return <h3 className="text-base font-semibold mb-2 mt-3 first:mt-0">{children}</h3>;
                  },
                  blockquote({ children }) {
                    return (
                      <blockquote className="border-l-2 border-muted-foreground/30 pl-4 italic text-muted-foreground my-3">
                        {children}
                      </blockquote>
                    );
                  },
                  table({ children }) {
                    return (
                      <div className="overflow-x-auto my-3">
                        <table className="min-w-full border-collapse text-sm">{children}</table>
                      </div>
                    );
                  },
                  th({ children }) {
                    return (
                      <th className="border border-border px-3 py-1.5 bg-muted text-left font-semibold">
                        {children}
                      </th>
                    );
                  },
                  td({ children }) {
                    return (
                      <td className="border border-border px-3 py-1.5">{children}</td>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
              {isStreaming && (
                <span className="inline-block w-2 h-4 bg-current opacity-70 ml-0.5 animate-pulse align-middle" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
