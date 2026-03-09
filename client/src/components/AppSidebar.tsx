import { useState } from "react";
import { Plus, MessageSquare, Trash2 } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/chat-storage";

interface AppSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void;
}

export function AppSidebar({
  conversations,
  activeId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
}: AppSidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const grouped = groupByDate(conversations);

  return (
    <Sidebar>
      <SidebarHeader className="px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 flex-1">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
              <MessageSquare className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm tracking-tight">AI Chat</span>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={onNewChat}
            data-testid="button-new-chat"
            title="New chat"
            className="h-8 w-8"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No chats yet</p>
              <p className="text-xs text-muted-foreground mt-0.5">Start a new conversation</p>
            </div>
            <Button size="sm" onClick={onNewChat} data-testid="button-new-chat-empty">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New Chat
            </Button>
          </div>
        ) : (
          Object.entries(grouped).map(([label, convs]) => (
            <SidebarGroup key={label} className="py-1">
              <SidebarGroupLabel className="text-xs px-2 py-1 text-muted-foreground/70 uppercase tracking-wider font-medium">
                {label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {convs.map((conv) => (
                    <SidebarMenuItem key={conv.id}>
                      <SidebarMenuButton
                        isActive={conv.id === activeId}
                        onClick={() => onSelectConversation(conv.id)}
                        onMouseEnter={() => setHoveredId(conv.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        data-testid={`button-conversation-${conv.id}`}
                        className={cn(
                          "relative flex items-center gap-2 px-2 py-2 rounded-md text-sm w-full group",
                          conv.id === activeId && "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        )}
                      >
                        <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate text-left">{conv.title}</span>
                        {(hoveredId === conv.id || conv.id === activeId) && (
                          <span
                            role="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteConversation(conv.id);
                            }}
                            data-testid={`button-delete-${conv.id}`}
                            className="flex-shrink-0 p-0.5 rounded text-muted-foreground hover-elevate"
                            title="Delete conversation"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))
        )}
      </SidebarContent>

      <SidebarFooter className="px-3 py-2">
        <p className="text-xs text-muted-foreground/50 text-center">Personal AI Chat</p>
      </SidebarFooter>
    </Sidebar>
  );
}

function groupByDate(conversations: Conversation[]): Record<string, Conversation[]> {
  const now = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const sevenDays = new Date(today);
  sevenDays.setDate(sevenDays.getDate() - 7);
  const thirtyDays = new Date(today);
  thirtyDays.setDate(thirtyDays.getDate() - 30);

  const groups: Record<string, Conversation[]> = {};

  for (const conv of conversations) {
    const date = new Date(conv.updatedAt);
    let label: string;

    if (date >= today) {
      label = "Today";
    } else if (date >= yesterday) {
      label = "Yesterday";
    } else if (date >= sevenDays) {
      label = "Last 7 days";
    } else if (date >= thirtyDays) {
      label = "Last 30 days";
    } else {
      label = "Older";
    }

    if (!groups[label]) groups[label] = [];
    groups[label].push(conv);
  }

  return groups;
}
