"use client"

import { MoonIcon } from "@radix-ui/react-icons"
import { Button } from "@/components/ui/button"

export function ModeToggle() {
  return (
    <Button
      variant="outline"
      size="icon"
      className="bg-transparent border-0 text-white/70 hover:text-white hover:bg-white/5"
      disabled
      aria-label="Dark mode enabled"
    >
      <MoonIcon className="h-[1.2rem] w-[1.2rem]" />
      <span className="sr-only">Dark mode enabled</span>
    </Button>
  )
}
