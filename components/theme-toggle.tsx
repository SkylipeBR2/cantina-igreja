"use client";

import { Moon, Sun } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const shouldReduceMotion = useReducedMotion();

  const isDark = resolvedTheme === "dark";
  return (
    <motion.button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="theme-toggle"
      aria-label={isDark ? "Usar tema claro" : "Usar tema escuro"}
      whileTap={shouldReduceMotion ? undefined : { scale: 0.92 }}
      transition={{ type: "spring", stiffness: 420, damping: 24 }}
    >
      <motion.span
        key={isDark ? "moon" : "sun"}
        initial={shouldReduceMotion ? false : { opacity: 0, rotate: -35, scale: 0.72 }}
        animate={{ opacity: 1, rotate: 0, scale: 1 }}
        exit={{ opacity: 0, rotate: 35, scale: 0.72 }}
        transition={{ duration: 0.18 }}
      >
        {isDark ? <Moon size={18} /> : <Sun size={18} />}
      </motion.span>
    </motion.button>
  );
}
