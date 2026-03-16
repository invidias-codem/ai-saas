"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

type TransitionType = "sunrise" | "dusk" | null;

export function ThemeTransition() {
  const { resolvedTheme } = useTheme();
  const [transition, setTransition] = useState<TransitionType>(null);
  const [prevTheme, setPrevTheme] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (prevTheme === undefined) {
      setPrevTheme(resolvedTheme);
      return;
    }

    if (prevTheme !== resolvedTheme) {
      if (resolvedTheme === "light") {
        setTransition("sunrise");
      } else if (resolvedTheme === "dark") {
        setTransition("dusk");
      }
      setPrevTheme(resolvedTheme);

      const timer = setTimeout(() => {
        setTransition(null);
      }, 1400);

      return () => clearTimeout(timer);
    }
  }, [resolvedTheme]); // eslint-disable-line react-hooks/exhaustive-deps

  const sunriseGradient =
    "radial-gradient(ellipse at 50% 120%, rgba(251,191,36,0.6) 0%, rgba(251,146,60,0.3) 40%, transparent 70%)";
  const duskGradient =
    "radial-gradient(ellipse at 50% 50%, rgba(79,70,229,0.4) 0%, transparent 70%)";

  return (
    <AnimatePresence>
      {transition === "sunrise" && (
        <motion.div
          key="sunrise"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2, ease: "easeInOut" }}
          style={{ background: sunriseGradient }}
          className="fixed inset-0 z-[9999] pointer-events-none"
        />
      )}
      {transition === "dusk" && (
        <motion.div
          key="dusk"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.8 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2, ease: "easeInOut" }}
          style={{ background: duskGradient }}
          className="fixed inset-0 z-[9999] pointer-events-none"
        />
      )}
    </AnimatePresence>
  );
}
