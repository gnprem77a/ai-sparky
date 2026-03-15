import { useEffect, useState } from "react";
import {
  CommandDialog as CommandDialogUI,
  CommandEmpty as CommandEmptyUI,
  CommandGroup as CommandGroupUI,
  CommandInput as CommandInputUI,
  CommandItem as CommandItemUI,
  CommandList as CommandListUI,
  CommandSeparator as CommandSeparatorUI,
} from "@/components/ui/command";
import { 
  Plus, 
  Settings, 
  Shield, 
  MessageSquare,
  Clock
} from "lucide-react";
import { type Conversation } from "@/lib/chat-storage";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversations: Conversation[];
  onSelectConversation: (id: string) => void;
  onAction: (action: string) => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  conversations,
  onSelectConversation,
  onAction,
}: CommandPaletteProps) {

  const recentConversations = conversations
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
    .slice(0, 10);

  return (
    <CommandDialogUI open={open} onOpenChange={onOpenChange}>
      <CommandInputUI placeholder="Type a command or search chats..." data-testid="input-command-palette" />
      <CommandListUI>
        <CommandEmptyUI>No results found.</CommandEmptyUI>
        <CommandGroupUI heading="Actions">
          <CommandItemUI
            onSelect={() => {
              onAction("new-chat");
              onOpenChange(false);
            }}
            data-testid="command-item-new-chat"
          >
            <Plus className="mr-2 h-4 w-4" />
            <span>New Chat</span>
          </CommandItemUI>
          <CommandItemUI
            onSelect={() => {
              onAction("open-settings");
              onOpenChange(false);
            }}
            data-testid="command-item-settings"
          >
            <Settings className="mr-2 h-4 w-4" />
            <span>Open Settings</span>
          </CommandItemUI>
          <CommandItemUI
            onSelect={() => {
              onAction("go-to-admin");
              onOpenChange(false);
            }}
            data-testid="command-item-admin"
          >
            <Shield className="mr-2 h-4 w-4" />
            <span>Go to Admin</span>
          </CommandItemUI>
        </CommandGroupUI>
        <CommandSeparatorUI />
        <CommandGroupUI heading="Recent Conversations">
          {recentConversations.map((conv) => (
            <CommandItemUI
              key={conv.id}
              onSelect={() => {
                onSelectConversation(conv.id);
                onOpenChange(false);
              }}
              data-testid={`command-item-conversation-${conv.id}`}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{conv.title}</span>
                {conv.model && (
                  <Badge variant="outline" className="text-[10px] px-1 h-4">
                    {conv.model}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0 ml-2">
                <Clock className="h-3 w-3" />
                <span>
                  {formatDistanceToNow(new Date(conv.updatedAt || conv.createdAt), { addSuffix: true })}
                </span>
              </div>
            </CommandItemUI>
          ))}
        </CommandGroupUI>
      </CommandListUI>
    </CommandDialogUI>
  );
}
