"use client";

import { useState, type ReactNode, type ButtonHTMLAttributes } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface RippleButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  golden?: boolean;
}

export function RippleButton({ children, golden = false, className = "", ...props }: RippleButtonProps) {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number; size: number }[]>([]);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    const id = Date.now() + Math.random();
    setRipples((prev) => [...prev, { id, x, y, size }]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 900);
  };

  return (
    <button
      {...props}
      onPointerDown={handlePointerDown}
      className={`relative overflow-hidden rounded-full ${className}`}
    >
      <AnimatePresence>
        {ripples.map((ripple) => (
          <motion.span
            key={ripple.id}
            className={`absolute rounded-full pointer-events-none ${
              golden
                ? "bg-amber-300/40 dark:bg-amber-400/30"
                : "bg-white/20 dark:bg-white/10"
            }`}
            style={{
              left: ripple.x,
              top: ripple.y,
              width: ripple.size,
              height: ripple.size,
            }}
            initial={{ scale: 0, opacity: 0.7 }}
            animate={{ scale: 1, opacity: 0 }}
            transition={{ duration: 0.9, ease: [0.23, 1, 0.32, 1] }}
          />
        ))}
      </AnimatePresence>

      {/* Golden glimmer sweep on primary button */}
      {golden && (
        <span
          className="absolute inset-0 rounded-full pointer-events-none opacity-0 transition-opacity duration-300"
          style={{
            background:
              "linear-gradient(105deg, transparent 40%, rgba(251,191,36,0.25) 45%, rgba(251,191,36,0.45) 50%, rgba(251,191,36,0.25) 55%, transparent 60%)",
            backgroundSize: "200% 100%",
          }}
          onPointerEnter={(e) => {
            const el = e.currentTarget;
            el.style.opacity = "1";
            el.style.backgroundPosition = "100% 0";
            el.style.transition = "background-position 0.6s ease, opacity 0.3s ease";
          }}
          onPointerLeave={(e) => {
            const el = e.currentTarget;
            el.style.opacity = "0";
            el.style.backgroundPosition = "0% 0";
          }}
        />
      )}

      <span className="relative z-10">{children}</span>
    </button>
  );
}
