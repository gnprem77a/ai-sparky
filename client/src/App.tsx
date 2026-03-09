import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import ChatPage from "@/pages/ChatPage";
import { useEffect } from "react";

function initTheme() {
  const stored = localStorage.getItem("theme");
  if (stored === "light") {
    document.documentElement.classList.remove("dark");
  } else {
    document.documentElement.classList.add("dark");
    if (!stored) localStorage.setItem("theme", "dark");
  }
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={ChatPage} />
      <Route component={ChatPage} />
    </Switch>
  );
}

const style = {
  "--sidebar-width": "18rem",
  "--sidebar-width-icon": "3.5rem",
};

function App() {
  useEffect(() => {
    initTheme();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider style={style as React.CSSProperties} defaultOpen={true}>
          <div className="flex h-screen w-full overflow-hidden bg-background">
            <Router />
          </div>
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
