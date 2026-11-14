"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { List } from "lucide-react";

interface TOCItem {
  id: string;
  title: string;
  level: number;
}

interface TableOfContentsProps {
  items: TOCItem[];
}

export function TableOfContents({ items }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      {
        rootMargin: "-100px 0px -80% 0px",
        threshold: 0,
      }
    );

    items.forEach((item) => {
      const element = document.getElementById(item.id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => {
      items.forEach((item) => {
        const element = document.getElementById(item.id);
        if (element) {
          observer.unobserve(element);
        }
      });
    };
  }, [items]);

  const handleClick = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 100;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      });
    }
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Table of contents" className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto">
      <div className="p-4 rounded-xl border border-border bg-card shadow-sm dark:shadow-none">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
          <List className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Table of Contents</h3>
        </div>
        
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              style={{ paddingLeft: `${(item.level - 2) * 12}px` }}
            >
              <button
                onClick={() => handleClick(item.id)}
                className={cn(
                  "w-full rounded px-2 py-1 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                  activeId === item.id
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground"
                )}
              >
                {item.title}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

export function MobileTableOfContents({ items }: TableOfContentsProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (items.length === 0) {
    return null;
  }

  const handleClick = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 100;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      });
      setIsOpen(false);
    }
  };

  return (
    <div className="lg:hidden mb-8">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 rounded-xl border border-border bg-card text-foreground shadow-sm dark:shadow-none"
      >
        <div className="flex items-center gap-2">
          <List className="w-4 h-4 text-primary" />
          <span className="font-medium">Table of Contents</span>
        </div>
        <span className="text-muted-foreground">{isOpen ? "−" : "+"}</span>
      </button>

      {isOpen && (
        <div className="mt-2 p-4 rounded-xl border border-border bg-card shadow-sm dark:shadow-none">
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                style={{ paddingLeft: `${(item.level - 2) * 12}px` }}
              >
                <button
                  onClick={() => handleClick(item.id)}
                  className="text-left text-sm text-muted-foreground hover:text-primary w-full transition-colors"
                >
                  {item.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
