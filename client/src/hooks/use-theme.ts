import { useEffect } from "react";

export function useTheme() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
    localStorage.setItem("theme", "dark");
  }, []);

  return { theme: "dark" as const, setTheme: () => {}, toggleTheme: () => {} };
}
