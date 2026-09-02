"use client";

import { useState, useRef, type ReactNode, type ButtonHTMLAttributes } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface RippleButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  golden?: boolean;
}

export function RippleButton({
  children,
  golden = false,
  className = "",
  onPointerDown,
  ...props
}: RippleButtonProps) {
  const [ripples, setRipples] = useState<
    { id: number; x: number; y: number; size: number; originX: number; originY: number }[]
  >([]);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;

    const size = Math.max(rect.width, rect.height) * 2;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    const originX = ((e.clientX - rect.left) / rect.width) * 100;
    const originY = ((e.clientY - rect.top) / rect.height) * 100;
    const id = Date.now() + Math.random();

    setRipples((prev) => [...prev, { id, x, y, size, originX, originY }]);

    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 900);
  };

  return (
    <button
      {...props}
      ref={buttonRef}
      onPointerDown={(e) => {
        handlePointerDown(e);
        onPointerDown?.(e);
      }}
      className={`relative overflow-hidden rounded-full ${className}`}
    >
      <AnimatePresence>
        {ripples.map((ripple) => (
          <motion.span
            key={ripple.id}
            className={`absolute rounded-full pointer-events-none ${
              golden ? "bg-amber-300/30 dark:bg-amber-400/20" : "bg-white/20 dark:bg-white/10"
            }`}
            style={{
              left: ripple.x,
              top: ripple.y,
              width: ripple.size,
              height: ripple.size,
              transformOrigin: `${ripple.originX}% ${ripple.originY}%`,
              willChange: "transform, opacity",
            }}
            initial={{ scale: 0, opacity: 0.6 }}
            animate={{ scale: 1, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: [0.23, 1, 0.32, 1] }}
          />
        ))}
      </AnimatePresence>

      {/* Golden glimmer sweep on primary button */}
      {golden && (
        <span
          className="absolute inset-0 rounded-full pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background:
              "linear-gradient(105deg, transparent 40%, rgba(251,191,36,0.2) 45%, rgba(251,191,36,0.35) 50%, rgba(251,191,36,0.2) 55%, transparent 60%)",
            backgroundSize: "200% 100%",
          }}
          onPointerEnter={(e) => {
            const el = e.currentTarget;
            el.style.backgroundPosition = "100% 0";
            el.style.transition = "background-position 0.6s ease, opacity 0.3s ease";
          }}
          onPointerLeave={(e) => {
            const el = e.currentTarget;
            el.style.backgroundPosition = "0% 0";
          }}
        />
      )}

      <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
    </button>
  );
}
