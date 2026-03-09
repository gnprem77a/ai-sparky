import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { lazy, Suspense, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";

const ChatPage = lazy(() => import("@/pages/ChatPage"));
const AuthPage = lazy(() => import("@/pages/AuthPage"));
const AdminPage = lazy(() => import("@/pages/AdminPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const SharedConversationPage = lazy(() => import("@/pages/SharedConversationPage"));

function initTheme() {
  const stored = localStorage.getItem("theme");
  if (stored === "light") {
    document.documentElement.classList.remove("dark");
  } else {
    document.documentElement.classList.add("dark");
    if (!stored) localStorage.setItem("theme", "dark");
  }
}

const style = {
  "--sidebar-width": "18rem",
  "--sidebar-width-icon": "3.5rem",
};

function AppInner() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  /* Share pages are public — no auth required */
  if (location.startsWith("/share/")) {
    return (
      <Suspense fallback={null}>
        <SharedConversationPage />
      </Suspense>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex gap-1.5">
          <span className="typing-dot w-2 h-2 rounded-full bg-muted-foreground inline-block" />
          <span className="typing-dot w-2 h-2 rounded-full bg-muted-foreground inline-block" />
          <span className="typing-dot w-2 h-2 rounded-full bg-muted-foreground inline-block" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={null}>
        <AuthPage />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={null}>
      <Switch>
        <Route path="/admin">
          <AdminPage />
        </Route>
        <Route path="/profile">
          <ProfilePage />
        </Route>
        <Route>
          <SidebarProvider style={style as React.CSSProperties} defaultOpen={true}>
            <div className="flex h-screen w-full overflow-hidden bg-background">
              <ChatPage />
            </div>
          </SidebarProvider>
        </Route>
      </Switch>
    </Suspense>
  );
}

function App() {
  useEffect(() => {
    initTheme();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppInner />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
