"use client";

import Image from "next/image";
import Link from "next/link";
import { BlogPost, BLOG_CATEGORIES } from "@/lib/blog/types";
import { formatDate } from "@/lib/blog/utils";
import { Clock, Calendar, ArrowLeft, Twitter, Linkedin, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface BlogHeaderProps {
  post: BlogPost;
}

export function BlogHeader({ post }: BlogHeaderProps) {
  const category = BLOG_CATEGORIES[post.category] ?? {
    name: 'General',
    bgColor: 'bg-gray-500/10',
    color: 'text-gray-600 dark:text-gray-400'
  };
  const [copied, setCopied] = useState(false);

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/blog/${post.slug}`
    : `/blog/${post.slug}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const shareOnTwitter = () => {
    const text = encodeURIComponent(`${post.title} by @genieai`);
    const url = encodeURIComponent(shareUrl);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
  };

  const shareOnLinkedIn = () => {
    const url = encodeURIComponent(shareUrl);
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, '_blank');
  };

  return (
    <header className="mb-10">
      <Link
        href="/blog"
        className="inline-flex items-center gap-2 text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors mb-8"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Blog
      </Link>

      <div className="mb-4">
        <Link
          href={`/blog?category=${post.category}`}
          className={cn(
            "inline-flex px-3 py-1 rounded-full text-sm font-medium transition-colors",
            category.bgColor,
            category.color,
            "hover:opacity-80"
          )}
        >
          {category.name}
        </Link>
      </div>

      <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight mb-4 sm:mb-6">
        {post.title}
      </h1>

      <p className="text-base sm:text-lg md:text-xl text-slate-600 dark:text-gray-400 mb-6 sm:mb-8 leading-relaxed">
        {post.description}
      </p>

      <div className="flex flex-wrap items-center gap-3 sm:gap-6 pb-6 sm:pb-8 border-b border-slate-200 dark:border-white/10">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-full overflow-hidden bg-gradient-to-tr from-purple-500 to-blue-500">
            {post.author.avatar && (
              <Image
                src={post.author.avatar}
                alt={post.author.name}
                fill
                className="object-cover"
              />
            )}
          </div>
          <div>
            <p className="text-slate-900 dark:text-white font-medium">{post.author.name}</p>
            <p className="text-slate-500 dark:text-gray-500 text-sm">{post.author.role}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-slate-600 dark:text-gray-400">
          <Calendar className="w-4 h-4" />
          <span>{formatDate(post.publishedAt)}</span>
          {post.updatedAt && post.updatedAt !== post.publishedAt && (
            <span className="text-slate-500 dark:text-gray-500 text-sm">
              (Updated {formatDate(post.updatedAt)})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-slate-600 dark:text-gray-400">
          <Clock className="w-4 h-4" />
          <span>{post.readingTime} min read</span>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-slate-500 dark:text-gray-500 text-sm mr-2">Share:</span>
          <button
            onClick={shareOnTwitter}
            className="p-2 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            aria-label="Share on Twitter"
          >
            <Twitter className="w-4 h-4" />
          </button>
          <button
            onClick={shareOnLinkedIn}
            className="p-2 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            aria-label="Share on LinkedIn"
          >
            <Linkedin className="w-4 h-4" />
          </button>
          <button
            onClick={handleCopyLink}
            className={cn(
              "p-2 rounded-lg transition-colors",
              copied
                ? "bg-green-500/20 text-green-600 dark:text-green-400"
                : "bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white"
            )}
            aria-label="Copy link"
          >
            <Link2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {post.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-6">
          {post.tags.map((tag) => (
            <Link
              key={tag}
              href={`/blog?tag=${encodeURIComponent(tag)}`}
              className="px-3 py-1 rounded-full text-xs bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
