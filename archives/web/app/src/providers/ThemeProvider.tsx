import { useLocalStorageState } from "ahooks";
import { createContext, useContext, useEffect } from "react";

const initializeTheme = () => {
  try {
    const storedTheme = localStorage.getItem("nuwa-theme");
    // useLocalStorageState store as JSON format
    let theme = null;
    if (storedTheme) {
      const parsed = JSON.parse(storedTheme);
      theme = parsed;
    }
    const systemPrefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;

    document.documentElement.className =
      theme || (systemPrefersDark ? "dark" : "light");
  } catch (e) {
    console.error("Failed to initialize theme:", e);
    document.documentElement.className = "light";
  }
};

if (typeof window !== "undefined") {
  initializeTheme();
}

interface ThemeContextType {
  theme: "dark" | "light";
  setTheme: (value: "dark" | "light") => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useLocalStorageState<"dark" | "light">(
    "nuwa-theme",
    {
      defaultValue: window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light",
    },
  );

  useEffect(() => {
    document.documentElement.className = theme || "light";
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme: theme || "light", setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
