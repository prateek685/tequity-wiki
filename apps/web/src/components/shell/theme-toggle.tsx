import { Moon, Sun } from "lucide-react";
import { useState } from "react";
import { saveTheme, storedTheme } from "@/lib/theme";

/** Top-bar icon button: switches between the light (default) and dark theme. */
export function ThemeToggle() {
  const [theme, setTheme] = useState(storedTheme);
  const dark = theme === "dark";
  return (
    <button
      type="button"
      aria-label="Dark mode"
      aria-pressed={dark}
      className="grid size-8 shrink-0 place-items-center rounded-ctl border border-line bg-surface text-fg-2 hover:bg-subtle"
      onClick={() => {
        const next = dark ? "light" : "dark";
        saveTheme(next);
        setTheme(next);
      }}
    >
      {dark ? <Sun aria-hidden="true" className="size-4" /> : <Moon aria-hidden="true" className="size-4" />}
    </button>
  );
}
