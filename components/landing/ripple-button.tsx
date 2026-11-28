"use client";

import { useRef, useState, type ReactNode, type ButtonHTMLAttributes, type PointerEvent } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

interface RippleButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  golden?: boolean;
}

const RIPPLE_SIZE = 100;

export function RippleButton({
  children,
  golden = false,
  className = "",
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
  ...props
}: RippleButtonProps) {
  const [ripples, setRipples] = useState<{ x: number; y: number; id: number }[]>([]);
  const [isHovered, setIsHovered] = useState(false);
  const idCounter = useRef(0);
  const reducedMotion = useReducedMotion();

  const handlePointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (reducedMotion) {
      onPointerDown?.(e);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setRipples((prev) => [
      ...prev,
      { x: e.clientX - rect.left, y: e.clientY - rect.top, id: idCounter.current++ },
    ]);
    onPointerDown?.(e);
  };

  return (
    <button
      {...props}
      onPointerDown={handlePointerDown}
      onPointerEnter={(e) => {
        setIsHovered(true);
        onPointerEnter?.(e);
      }}
      onPointerLeave={(e) => {
        setIsHovered(false);
        onPointerLeave?.(e);
      }}
      className={`relative overflow-hidden rounded-full ${className}`}
    >
      {/* Glimmer sweep — hover handled at the button root, span stays pointer-events-none */}
      {golden && (
        <span
          aria-hidden
          className={`absolute inset-0 rounded-full pointer-events-none transition-opacity duration-300 ${
            isHovered ? "opacity-100" : "opacity-0"
          }`}
          style={{
            background:
              "linear-gradient(105deg, transparent 40%, rgba(251,191,36,0.2) 45%, rgba(251,191,36,0.35) 50%, rgba(251,191,36,0.2) 55%, transparent 60%)",
            backgroundSize: "200% 100%",
            backgroundPosition: isHovered ? "100% 0" : "-100% 0",
            transition: "background-position 0.6s ease, opacity 0.3s ease",
          }}
        />
      )}

      {/* Ripples — lifecycle fully owned by framer-motion */}
      <AnimatePresence>
        {ripples.map((ripple) => (
          <motion.span
            key={ripple.id}
            className={`absolute rounded-full pointer-events-none ${
              golden ? "bg-amber-300/30 dark:bg-amber-400/20" : "bg-white/20 dark:bg-white/10"
            }`}
            style={{
              width: RIPPLE_SIZE,
              height: RIPPLE_SIZE,
              left: ripple.x - RIPPLE_SIZE / 2,
              top: ripple.y - RIPPLE_SIZE / 2,
              willChange: "transform, opacity",
            }}
            initial={{ scale: 0, opacity: 0.35 }}
            animate={{ scale: 2, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            onAnimationComplete={() =>
              setRipples((prev) => prev.filter((r) => r.id !== ripple.id))
            }
          />
        ))}
      </AnimatePresence>

      <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
    </button>
  );
}
