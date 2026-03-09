import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, FileJson, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface ImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ImportedConversation {
  title: string;
  messages: {
    role: string;
    content: string;
  }[];
}

export function ImportModal({ open, onOpenChange }: ImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [previewConversations, setPreviewConversations] = useState<ImportedConversation[]>([]);
  const [progress, setProgress] = useState(0);
  const [successCount, setSuccessCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const reset = () => {
    setFile(null);
    setPreviewConversations([]);
    setProgress(0);
    setSuccessCount(0);
    setIsImporting(false);
    setIsParsing(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      parseFile(selectedFile);
    }
  };

  const parseFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsParsing(true);
    setPreviewConversations([]);

    try {
      const text = await selectedFile.text();
      const json = JSON.parse(text);
      let conversations: ImportedConversation[] = [];

      // ChatGPT format (conversations.json)
      if (Array.isArray(json) && json.length > 0 && json[0].mapping) {
        conversations = json.map((conv: any) => {
          const messages: { role: string; content: string }[] = [];
          // Simple linear message extraction from mapping
          Object.values(conv.mapping).forEach((node: any) => {
            if (node.message && node.message.content && node.message.content.parts) {
              const content = node.message.content.parts.join("\n");
              if (content.trim()) {
                messages.push({
                  role: node.message.author.role === "assistant" ? "assistant" : "user",
                  content: content,
                });
              }
            }
          });
          return {
            title: conv.title || "Imported ChatGPT Chat",
            messages,
          };
        });
      } 
      // Claude format (claude_conversations.json)
      else if (Array.isArray(json) && json.length > 0 && json[0].chat_messages) {
        conversations = json.map((conv: any) => ({
          title: conv.name || "Imported AI Sparky",
          messages: conv.chat_messages.map((msg: any) => ({
            role: msg.sender === "assistant" ? "assistant" : "user",
            content: msg.text || "",
          })),
        }));
      } else {
        throw new Error("Unsupported format. Please upload ChatGPT (conversations.json) or Claude.ai export.");
      }

      setPreviewConversations(conversations);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Import Error",
        description: err.message || "Failed to parse file",
      });
      setFile(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleImport = async () => {
    if (previewConversations.length === 0) return;

    setIsImporting(true);
    let successful = 0;

    for (let i = 0; i < previewConversations.length; i++) {
      const conv = previewConversations[i];
      try {
        // 1. Create conversation
        const res = await apiRequest("POST", "/api/conversations", {
          title: conv.title,
          model: "auto",
        });
        const newConv = await res.json();

        // 2. Add messages
        for (const msg of conv.messages) {
          await apiRequest("POST", `/api/conversations/${newConv.id}/messages`, msg);
        }

        successful++;
        setSuccessCount(successful);
      } catch (err) {
        console.error("Failed to import conversation", conv.title, err);
      }
      setProgress(Math.round(((i + 1) / previewConversations.length) * 100));
    }

    queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    toast({
      title: "Import Complete",
      description: `Successfully imported ${successful} conversations.`,
    });
    
    if (successful === previewConversations.length) {
      setTimeout(() => onOpenChange(false), 1500);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!isImporting) {
        onOpenChange(val);
        if (!val) reset();
      }
    }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Import Chats</DialogTitle>
          <DialogDescription>
            Import your conversation history from ChatGPT or Claude.ai.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {!file ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Upload className="w-6 h-6 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">Click to upload or drag and drop</p>
                <p className="text-xs text-muted-foreground mt-1">
                  conversations.json (ChatGPT) or claude_conversations.json
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleFileChange}
                data-testid="input-import-file"
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                <FileJson className="w-8 h-8 text-primary" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {previewConversations.length} conversations found
                  </p>
                </div>
                {!isImporting && (
                  <Button variant="ghost" size="sm" onClick={reset}>
                    Change
                  </Button>
                )}
              </div>

              {isParsing && (
                <div className="flex items-center justify-center py-4 gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Parsing file...
                </div>
              )}

              {previewConversations.length > 0 && !isImporting && (
                <div className="max-h-[200px] overflow-y-auto border rounded-lg divide-y">
                  {previewConversations.slice(0, 5).map((conv, i) => (
                    <div key={i} className="p-2 text-xs truncate">
                      {conv.title} ({conv.messages.length} messages)
                    </div>
                  ))}
                  {previewConversations.length > 5 && (
                    <div className="p-2 text-xs text-muted-foreground text-center bg-muted/20">
                      And {previewConversations.length - 5} more...
                    </div>
                  )}
                </div>
              )}

              {isImporting && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs mb-1">
                    <span>Importing...</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                  <p className="text-[11px] text-muted-foreground text-center">
                    Successfully imported {successCount} of {previewConversations.length}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isImporting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!file || previewConversations.length === 0 || isImporting || isParsing}
            data-testid="button-confirm-import"
            className="gap-2"
          >
            {isImporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            Confirm Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
