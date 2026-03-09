import { useState } from "react";
import { Plus, Trash2, MessageSquareDashed } from "lucide-react";
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
      <SidebarHeader className="px-3 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-violet-400 flex items-center justify-center flex-shrink-0 shadow-lg">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-white">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" fill="currentColor" opacity="0.3"/>
                <path d="M21 12c0-4.97-4.03-9-9-9s-9 4.03-9 9 4.03 9 9 9 9-4.03 9-9zM8 8h2.5l1.5 4 1.5-4H16l-2.5 8H11L8 8z" fill="currentColor"/>
              </svg>
            </div>
            <span className="font-semibold text-sm text-foreground tracking-tight">Claude Chat</span>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={onNewChat}
            data-testid="button-new-chat"
            title="New chat"
            className="h-8 w-8 text-muted-foreground"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 custom-scrollbar">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-14 text-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-1">
              <MessageSquareDashed className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground/80">No conversations</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Start a new chat to get going
              </p>
            </div>
          </div>
        ) : (
          Object.entries(grouped).map(([label, convs]) => (
            <SidebarGroup key={label} className="py-0.5">
              <SidebarGroupLabel className="text-[10px] px-2 py-1.5 text-muted-foreground/60 uppercase tracking-widest font-semibold">
                {label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {convs.map((conv) => (
                    <SidebarMenuItem key={conv.id}>
                      <SidebarMenuButton
                        isActive={conv.id === activeId}
                        onClick={() => onSelectConversation(conv.id)}
                        onMouseEnter={() => setHoveredId(conv.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        data-testid={`button-conversation-${conv.id}`}
                        className={cn(
                          "relative flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm w-full transition-colors",
                          conv.id === activeId
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/70"
                        )}
                      >
                        <span className="flex-1 truncate text-left text-[13px] font-normal leading-snug">
                          {conv.title}
                        </span>
                        <span
                          role="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteConversation(conv.id);
                          }}
                          data-testid={`button-delete-${conv.id}`}
                          title="Delete"
                          style={{
                            visibility: hoveredId === conv.id || conv.id === activeId ? "visible" : "hidden",
                          }}
                          className="flex-shrink-0 p-0.5 rounded-md text-muted-foreground/60 hover-elevate"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))
        )}
      </SidebarContent>

      <SidebarFooter className="px-3 py-3">
        <div className="flex items-center gap-2 px-2 py-2 rounded-lg bg-muted/40">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary/80 to-violet-400/80 flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-bold text-white">P</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground/80 truncate">Personal</p>
            <p className="text-[10px] text-muted-foreground truncate">Private workspace</p>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

const GROUP_ORDER = ["Today", "Yesterday", "Last 7 days", "Last 30 days", "Older"];

function groupByDate(conversations: Conversation[]): Record<string, Conversation[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const sevenDays = new Date(today);
  sevenDays.setDate(sevenDays.getDate() - 7);
  const thirtyDays = new Date(today);
  thirtyDays.setDate(thirtyDays.getDate() - 30);

  const rawGroups: Record<string, Conversation[]> = {};

  for (const conv of conversations) {
    const date = new Date(conv.updatedAt);
    let label: string;
    if (date >= today) label = "Today";
    else if (date >= yesterday) label = "Yesterday";
    else if (date >= sevenDays) label = "Last 7 days";
    else if (date >= thirtyDays) label = "Last 30 days";
    else label = "Older";

    if (!rawGroups[label]) rawGroups[label] = [];
    rawGroups[label].push(conv);
  }

  const ordered: Record<string, Conversation[]> = {};
  for (const key of GROUP_ORDER) {
    if (rawGroups[key]) ordered[key] = rawGroups[key];
  }
  return ordered;
}
