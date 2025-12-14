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

    // Observe all headings
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
        behavior: "smooth",
      });
    }
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <nav className="sticky top-24">
      <div className="p-4 rounded-xl border border-white/10 bg-white/5">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/10">
          <List className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-white">Table of Contents</h3>
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
                  "text-left text-sm transition-colors duration-200 hover:text-white w-full truncate",
                  activeId === item.id
                    ? "text-purple-400 font-medium"
                    : "text-gray-400"
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

// Mobile TOC (collapsible)
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
        behavior: "smooth",
      });
      setIsOpen(false);
    }
  };

  return (
    <div className="lg:hidden mb-8">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/5 text-white"
      >
        <div className="flex items-center gap-2">
          <List className="w-4 h-4 text-purple-400" />
          <span className="font-medium">Table of Contents</span>
        </div>
        <span className="text-gray-400">{isOpen ? "−" : "+"}</span>
      </button>

      {isOpen && (
        <div className="mt-2 p-4 rounded-xl border border-white/10 bg-white/5">
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                style={{ paddingLeft: `${(item.level - 2) * 12}px` }}
              >
                <button
                  onClick={() => handleClick(item.id)}
                  className="text-left text-sm text-gray-400 hover:text-white transition-colors w-full truncate"
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
