"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { FileTextIcon } from "@radix-ui/react-icons";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

interface BlogNavLinkProps {
  href: string;
  label: string;
}

export function BlogNavLink({ href, label }: BlogNavLinkProps) {
  const [hovered, setHovered] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  const handlePointerEnter = useCallback(() => {
    setHovered(true);
    if (!hasInteracted) {
      setHasInteracted(true);
    }
  }, [hasInteracted]);

  const handlePointerLeave = useCallback(() => {
    setHovered(false);
  }, []);

  return (
    <Link
      href={href}
      className="group relative block"
      onMouseEnter={handlePointerEnter}
      onMouseLeave={handlePointerLeave}
      onFocus={handlePointerEnter}
      onBlur={handlePointerLeave}
    >
      {/* 44px minimum hit area */}
      <span className="absolute inset-0 -m-2 block min-h-[48px] min-w-[48px] rounded-full" aria-hidden="true" />

      <motion.span
        animate={{
          scale: hovered && !hasInteracted ? [1, 1.05, 1] : 1,
          rotate: hovered && !hasInteracted ? [0, -3, 3, 0] : 0,
        }}
        transition={{
          duration: hovered && !hasInteracted ? 0.5 : 0.2,
          ease: EASE_OUT,
        }}
        style={{ willChange: "transform" }}
        className="relative flex items-center gap-2 transition-transform duration-200 active:scale-[0.97]"
      >
        <FileTextIcon className="h-4 w-4 text-indigo-500 dark:text-indigo-400 transition-colors duration-200" />
        <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors duration-200">
          {label}
        </span>

        {/* Attention dot — subtle pulse to draw eyes to blog */}
        <motion.span
          animate={{
            opacity: hovered ? [0.4, 1, 0.4] : 0.4,
            scale: hovered ? [1, 1.2, 1] : 1,
          }}
          transition={{
            duration: 1.2,
            repeat: hovered && !hasInteracted ? Infinity : 0,
            ease: "easeInOut",
          }}
          className="absolute -right-2 -top-1 h-2 w-2 rounded-full bg-amber-400 dark:bg-amber-500"
          aria-hidden="true"
        />
      </motion.span>
    </Link>
  );
}
