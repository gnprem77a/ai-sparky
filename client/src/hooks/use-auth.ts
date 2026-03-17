import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export interface AuthUser {
  id: string;
  username: string;
  isAdmin: boolean;
  plan: "free" | "pro";
  planExpiresAt: string | null;
  createdAt: string | null;
  apiEnabled: boolean;
}

export function useAuth() {
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: Infinity,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: (data: { username: string; password: string }) =>
      apiRequest("POST", "/api/auth/login", data).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }),
  });

  const registerMutation = useMutation({
    mutationFn: (data: { username: string; password: string }) =>
      apiRequest("POST", "/api/auth/register", data).then((r) => r.json()),
    onSuccess: () => {
      sessionStorage.setItem("justRegistered", "1");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout"),
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.clear();
    },
  });

  return {
    user: user ?? null,
    isLoading,
    login: loginMutation,
    register: registerMutation,
    logout: logoutMutation,
  };
}
