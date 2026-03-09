import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Shield, Trash2, UserCheck, UserX, ArrowLeft, Users, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminUser {
  id: string;
  username: string;
  isAdmin: boolean;
}

export default function AdminPage() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && (!user || !user.isAdmin)) {
      navigate("/");
    }
  }, [user, isLoading]);

  const { data: users = [], isLoading: usersLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    queryFn: () => fetch("/api/admin/users", { credentials: "include" }).then((r) => r.json()),
    enabled: !!user?.isAdmin,
  });

  const toggleAdminMutation = useMutation({
    mutationFn: ({ id, isAdmin }: { id: string; isAdmin: boolean }) =>
      apiRequest("PATCH", `/api/admin/users/${id}/admin`, { isAdmin }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/users/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }),
  });

  if (isLoading) return null;
  if (!user?.isAdmin) return null;

  const totalUsers = users.length;
  const adminCount = users.filter((u) => u.isAdmin).length;
  const regularCount = totalUsers - adminCount;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/60 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            data-testid="button-back-home"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Chat
          </button>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <span className="font-semibold text-foreground text-sm">Admin Dashboard</span>
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            Signed in as <span className="font-semibold text-foreground">{user.username}</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {[
            { label: "Total Users", value: totalUsers, icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
            { label: "Admins", value: adminCount, icon: ShieldCheck, color: "text-violet-500", bg: "bg-violet-500/10" },
            { label: "Regular Users", value: regularCount, icon: Users, color: "text-emerald-500", bg: "bg-emerald-500/10" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-border bg-card p-5 flex items-center gap-4">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", stat.bg)}>
                <stat.icon className={cn("w-5 h-5", stat.color)} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground font-medium">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Users table */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between">
            <h2 className="font-semibold text-foreground">All Users</h2>
            <span className="text-xs text-muted-foreground">{totalUsers} total</span>
          </div>

          {usersLoading ? (
            <div className="flex items-center justify-center py-16 gap-2">
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">No users found.</div>
          ) : (
            <div className="divide-y divide-border/60">
              {users.map((u) => (
                <div
                  key={u.id}
                  data-testid={`row-user-${u.id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-muted/30 transition-colors"
                >
                  {/* Avatar */}
                  <div className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0",
                    u.isAdmin
                      ? "bg-violet-500/15 text-violet-500 ring-1 ring-violet-500/30"
                      : "bg-muted text-muted-foreground"
                  )}>
                    {u.username[0].toUpperCase()}
                  </div>

                  {/* Name + badge */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground text-sm truncate">{u.username}</span>
                      {u.isAdmin && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-500/15 text-violet-500 ring-1 ring-violet-500/20">
                          <Shield className="w-2.5 h-2.5" />
                          Admin
                        </span>
                      )}
                      {u.id === user.id && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary">
                          You
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">{u.id.slice(0, 8)}…</p>
                  </div>

                  {/* Actions */}
                  {u.id !== user.id && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => toggleAdminMutation.mutate({ id: u.id, isAdmin: !u.isAdmin })}
                        disabled={toggleAdminMutation.isPending}
                        data-testid={`button-toggle-admin-${u.id}`}
                        title={u.isAdmin ? "Remove admin" : "Make admin"}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                          u.isAdmin
                            ? "border-orange-500/30 text-orange-500 hover:bg-orange-500/10"
                            : "border-violet-500/30 text-violet-500 hover:bg-violet-500/10"
                        )}
                      >
                        {u.isAdmin ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                        {u.isAdmin ? "Remove admin" : "Make admin"}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete user "${u.username}"? This cannot be undone.`)) {
                            deleteMutation.mutate(u.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-user-${u.id}`}
                        title="Delete user"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-destructive/30 text-destructive hover:bg-destructive/10 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
