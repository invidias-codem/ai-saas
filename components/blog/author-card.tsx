"use client";

import Image from "next/image";
import { Author } from "@/lib/blog/types";
import { BrandIcon } from "@/lib/icons/brandIcons";

interface AuthorCardProps {
  author: Author;
  coAuthors?: Author[];
}

export function AuthorCard({ author, coAuthors }: AuthorCardProps) {
  const allAuthors = [author, ...(coAuthors || [])];

  return (
    <div className="mt-12 pt-8 border-t border-border">
      <h3 className="text-lg font-semibold text-foreground mb-6">
        {allAuthors.length > 1 ? "Written by" : "About the Author"}
      </h3>
      
      <div className="space-y-6">
        {allAuthors.map((auth) => (
          <div 
            key={auth.id}
            className="flex flex-col sm:flex-row gap-4 p-6 rounded-xl border border-border bg-card shadow-sm dark:shadow-none"
          >
            <div className="flex-shrink-0">
              <div className="relative w-16 h-16 rounded-full overflow-hidden bg-accent">
                {auth.avatar && (
                  <Image
                    src={auth.avatar}
                    alt={auth.name}
                    fill
                    className="object-cover"
                  />
                )}
              </div>
            </div>

            <div className="flex-1">
              <h4 className="text-foreground font-semibold">{auth.name}</h4>
              <p className="text-primary text-sm mb-2">{auth.role}</p>
              <p className="text-muted-foreground text-sm leading-relaxed mb-3">
                {auth.bio}
              </p>

              <div className="flex items-center gap-3">
                {auth.twitter && (
                  <a
                    href={`https://twitter.com/${auth.twitter}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 min-h-[48px] min-w-[48px] inline-flex items-center justify-center rounded-lg bg-chrome hover:bg-accent text-muted-foreground hover:text-primary transition-colors duration-200"
                    aria-label={`Follow ${auth.name} on Twitter`}
                  >
                    <BrandIcon name="Twitter" className="w-4 h-4" size={16} />
                  </a>
                )}
                {auth.linkedin && (
                  <a
                    href={`https://www.linkedin.com/in/${auth.linkedin}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 min-h-[48px] min-w-[48px] inline-flex items-center justify-center rounded-lg bg-chrome hover:bg-accent text-muted-foreground hover:text-primary transition-colors duration-200"
                    aria-label={`Connect with ${auth.name} on LinkedIn`}
                  >
                    <BrandIcon name="Linkedin" className="w-4 h-4" size={16} />
                  </a>
                )}
                {auth.github && (
                  <a
                    href={`https://github.com/${auth.github}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 min-h-[48px] min-w-[48px] inline-flex items-center justify-center rounded-lg bg-chrome hover:bg-accent text-muted-foreground hover:text-primary transition-colors duration-200"
                    aria-label={`View ${auth.name} on GitHub`}
                  >
                    <BrandIcon name="Github" className="w-4 h-4" size={16} />
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
