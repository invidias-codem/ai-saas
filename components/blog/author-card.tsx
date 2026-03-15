"use client";

import Image from "next/image";
import { Author } from "@/lib/blog/types";
import { Twitter, Linkedin, Github } from "lucide-react";

interface AuthorCardProps {
  author: Author;
  coAuthors?: Author[];
}

export function AuthorCard({ author, coAuthors }: AuthorCardProps) {
  const allAuthors = [author, ...(coAuthors || [])];

  return (
    <div className="mt-12 pt-8 border-t border-white/10">
      <h3 className="text-lg font-semibold text-white mb-6">
        {allAuthors.length > 1 ? "Written by" : "About the Author"}
      </h3>
      
      <div className="space-y-6">
        {allAuthors.map((auth) => (
          <div 
            key={auth.id}
            className="flex flex-col sm:flex-row gap-4 p-6 rounded-xl border border-white/10 bg-white/5"
          >
            {/* Avatar */}
            <div className="flex-shrink-0">
              <div className="relative w-16 h-16 rounded-full overflow-hidden bg-gradient-to-tr from-purple-500 to-blue-500">
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

            {/* Info */}
            <div className="flex-1">
              <h4 className="text-white font-semibold">{auth.name}</h4>
              <p className="text-purple-400 text-sm mb-2">{auth.role}</p>
              <p className="text-gray-400 text-sm leading-relaxed mb-3">
                {auth.bio}
              </p>

              {/* Social Links */}
              <div className="flex items-center gap-3">
                {auth.twitter && (
                  <a
                    href={`https://twitter.com/${auth.twitter}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                    aria-label={`Follow ${auth.name} on Twitter`}
                  >
                    <Twitter className="w-4 h-4" />
                  </a>
                )}
                {auth.linkedin && (
                  <a
                    href={`https://linkedin.com/company/${auth.linkedin}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                    aria-label={`Connect with ${auth.name} on LinkedIn`}
                  >
                    <Linkedin className="w-4 h-4" />
                  </a>
                )}
                {auth.github && (
                  <a
                    href={`https://github.com/${auth.github}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                    aria-label={`View ${auth.name} on GitHub`}
                  >
                    <Github className="w-4 h-4" />
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
