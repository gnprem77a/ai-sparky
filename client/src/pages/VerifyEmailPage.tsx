import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CheckCircle, XCircle, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function VerifyEmailPage() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) {
      setStatus("error");
      setMessage("No verification token found in the URL.");
      return;
    }
    apiRequest("POST", "/api/auth/verify-email", { token })
      .then(async (res) => {
        if (res.ok) {
          setStatus("success");
          await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        } else {
          const data = await res.json();
          setStatus("error");
          setMessage(data.error ?? "Verification failed. The link may be expired.");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Something went wrong. Please try again.");
      });
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
            <Mail className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Email Verification</h1>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-8 shadow-sm text-center">
          {status === "loading" && (
            <>
              <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Verifying your email address…</p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
                <CheckCircle className="w-9 h-9 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Email verified!</h2>
              <p className="text-muted-foreground mb-6">
                Your email address has been confirmed. Welcome to AI Sparky — you're all set!
              </p>
              <Button
                className="w-full"
                onClick={() => navigate("/")}
                data-testid="button-go-to-chat"
              >
                Start chatting →
              </Button>
            </>
          )}

          {status === "error" && (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
                <XCircle className="w-9 h-9 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Verification failed</h2>
              <p className="text-muted-foreground mb-6">{message}</p>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate("/")}
                  data-testid="button-go-home"
                >
                  Back to AI Sparky
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
