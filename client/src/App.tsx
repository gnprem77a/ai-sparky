import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { lazy, Suspense, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import type { CSSProperties } from "react";
import { LanguageProvider } from "@/lib/i18n";

const ChatPage = lazy(() => import("@/pages/ChatPage"));
const AuthPage = lazy(() => import("@/pages/AuthPage"));
const AdminPage = lazy(() => import("@/pages/AdminPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const GalleryPage = lazy(() => import("@/pages/GalleryPage"));
const SharedConversationPage = lazy(() => import("@/pages/SharedConversationPage"));
const ApiAccessPage = lazy(() => import("@/pages/ApiAccessPage"));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPasswordPage"));
const VerifyEmailPage = lazy(() => import("@/pages/VerifyEmailPage"));
const AboutPage = lazy(() => import("@/pages/AboutPage"));
const ContactPage = lazy(() => import("@/pages/ContactPage"));
const PrivacyPage = lazy(() => import("@/pages/PrivacyPage"));
const TermsPage = lazy(() => import("@/pages/TermsPage"));

(function initTheme() {
  const stored = localStorage.getItem("theme");
  if (stored === "light") {
    document.documentElement.classList.remove("dark");
  } else {
    document.documentElement.classList.add("dark");
    if (!stored) localStorage.setItem("theme", "dark");
  }

  const storedThemeColor = localStorage.getItem("theme-color");
  if (storedThemeColor && storedThemeColor !== "default") {
    document.documentElement.classList.add(`theme-${storedThemeColor}`);
  }
})();

const style: CSSProperties = {
  "--sidebar-width": "18rem",
  "--sidebar-width-icon": "3.5rem",
} as CSSProperties;

function PageLoader() {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-background">
      <div className="flex gap-1.5">
        <span className="typing-dot w-2 h-2 rounded-full bg-muted-foreground inline-block" />
        <span className="typing-dot w-2 h-2 rounded-full bg-muted-foreground inline-block" />
        <span className="typing-dot w-2 h-2 rounded-full bg-muted-foreground inline-block" />
      </div>
    </div>
  );
}

function AppInner() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  useEffect(() => {
    (window as any).__hideBootScreen?.();
  }, []);

  if (location.startsWith("/reset-password")) {
    return (
      <Suspense fallback={null}>
        <ResetPasswordPage />
      </Suspense>
    );
  }

  if (location.startsWith("/verify-email")) {
    return (
      <Suspense fallback={null}>
        <VerifyEmailPage />
      </Suspense>
    );
  }

  if (location === "/about") {
    return <Suspense fallback={null}><AboutPage /></Suspense>;
  }
  if (location === "/contact") {
    return <Suspense fallback={null}><ContactPage /></Suspense>;
  }
  if (location === "/privacy") {
    return <Suspense fallback={null}><PrivacyPage /></Suspense>;
  }
  if (location === "/terms") {
    return <Suspense fallback={null}><TermsPage /></Suspense>;
  }

  if (location.startsWith("/share/")) {
    return (
      <Suspense fallback={null}>
        <SharedConversationPage />
      </Suspense>
    );
  }


  if (isLoading) {
    return <PageLoader />;
  }

  if (!user) {
    if (location === "/login" || location.startsWith("/login?")) {
      return (
        <Suspense fallback={null}>
          <AuthPage />
        </Suspense>
      );
    }
    return (
      <Suspense fallback={<PageLoader />}>
        <SidebarProvider style={style} defaultOpen={window.innerWidth > 768}>
          <div className="flex h-dvh w-full overflow-hidden bg-background">
            <ChatPage />
          </div>
        </SidebarProvider>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/admin">
          <AdminPage />
        </Route>
        <Route path="/profile">
          <ProfilePage />
        </Route>
        <Route path="/gallery">
          <GalleryPage />
        </Route>
        <Route path="/api-access">
          <ApiAccessPage />
        </Route>
        <Route>
          <SidebarProvider style={style} defaultOpen={window.innerWidth > 768}>
            <div className="flex h-dvh w-full overflow-hidden bg-background">
              <ChatPage />
            </div>
          </SidebarProvider>
        </Route>
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <TooltipProvider>
          <AppInner />
          <Toaster />
        </TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
