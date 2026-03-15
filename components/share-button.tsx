"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Share2,
  Copy,
  Check,
  Twitter,
  Facebook,
  Linkedin,
  Mail,
  MessageCircle,
  Send,
  Link2,
  Smartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ShareContent {
  title: string;
  text: string;
  url?: string;
}

interface ShareButtonProps {
  content: ShareContent;
  className?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  showLabel?: boolean;
}

// Social media share URLs
const getShareUrls = (content: ShareContent) => {
  const encodedText = encodeURIComponent(content.text);
  const encodedTitle = encodeURIComponent(content.title);
  // Safely access window.location.href — only available client-side
  const currentUrl = typeof window !== "undefined" ? window.location.href : "";
  const encodedUrl = encodeURIComponent(content.url || currentUrl);
  const fullText = encodeURIComponent(`${content.title}\n\n${content.text}`);

  return {
    twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    whatsapp: `https://wa.me/?text=${fullText}%20${encodedUrl}`,
    telegram: `https://t.me/share/url?url=${encodedUrl}&text=${fullText}`,
    email: `mailto:?subject=${encodedTitle}&body=${fullText}%0A%0A${encodedUrl}`,
    sms: `sms:?body=${fullText}%20${encodedUrl}`,
    reddit: `https://reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`,
  };
};

export function ShareButton({
  content,
  className,
  variant = "outline",
  size = "default",
  showLabel = true,
}: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Check if Web Share API is available (primarily mobile)
  const canUseNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  // Handle native share (mobile devices)
  const handleNativeShare = useCallback(async () => {
    if (!canUseNativeShare) return;

    try {
      await navigator.share({
        title: content.title,
        text: content.text,
        url: content.url || window.location.href,
      });
    } catch (error) {
      // User cancelled or share failed - this is normal
      if ((error as Error).name !== "AbortError") {
        console.error("Share failed:", error);
      }
    }
  }, [content, canUseNativeShare]);

  // Copy to clipboard
  const handleCopyLink = useCallback(async () => {
    try {
      const textToCopy = content.url || window.location.href;
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  }, [content.url]);

  // Copy full content to clipboard
  const handleCopyContent = useCallback(async () => {
    try {
      const textToCopy = `${content.title}\n\n${content.text}${content.url ? `\n\n${content.url}` : ""}`;
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  }, [content]);

  // Open share URL in new window
  const handleShareClick = useCallback((url: string) => {
    window.open(url, "_blank", "width=600,height=400,noopener,noreferrer");
    setIsOpen(false);
  }, []);

  const shareUrls = getShareUrls(content);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className={cn("gap-2", className)}>
          <Share2 className="h-4 w-4" />
          {showLabel && size !== "icon" && <span>Share</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Share via</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Native Share (Mobile) */}
        {canUseNativeShare && (
          <>
            <DropdownMenuItem onClick={handleNativeShare} className="cursor-pointer">
              <Smartphone className="mr-2 h-4 w-4 text-blue-500" />
              <span>Share...</span>
              <span className="ml-auto text-xs text-muted-foreground">Native</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {/* Social Media */}
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Social Media
        </DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => handleShareClick(shareUrls.twitter)}
          className="cursor-pointer"
        >
          <Twitter className="mr-2 h-4 w-4 text-sky-500" />
          <span>Twitter / X</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleShareClick(shareUrls.facebook)}
          className="cursor-pointer"
        >
          <Facebook className="mr-2 h-4 w-4 text-blue-600" />
          <span>Facebook</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleShareClick(shareUrls.linkedin)}
          className="cursor-pointer"
        >
          <Linkedin className="mr-2 h-4 w-4 text-blue-700" />
          <span>LinkedIn</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleShareClick(shareUrls.reddit)}
          className="cursor-pointer"
        >
          <svg
            className="mr-2 h-4 w-4 text-orange-500"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
          </svg>
          <span>Reddit</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Messaging Apps */}
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Messaging
        </DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => handleShareClick(shareUrls.whatsapp)}
          className="cursor-pointer"
        >
          <MessageCircle className="mr-2 h-4 w-4 text-green-500" />
          <span>WhatsApp</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleShareClick(shareUrls.telegram)}
          className="cursor-pointer"
        >
          <Send className="mr-2 h-4 w-4 text-blue-400" />
          <span>Telegram</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => window.open(shareUrls.sms, "_self")}
          className="cursor-pointer"
        >
          <svg
            className="mr-2 h-4 w-4 text-green-600"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>SMS / Text</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => window.open(shareUrls.email, "_self")}
          className="cursor-pointer"
        >
          <Mail className="mr-2 h-4 w-4 text-red-500" />
          <span>Email</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Copy Options */}
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Copy
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={handleCopyLink} className="cursor-pointer">
          {copied ? (
            <Check className="mr-2 h-4 w-4 text-green-500" />
          ) : (
            <Link2 className="mr-2 h-4 w-4" />
          )}
          <span>{copied ? "Copied!" : "Copy Link"}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCopyContent} className="cursor-pointer">
          {copied ? (
            <Check className="mr-2 h-4 w-4 text-green-500" />
          ) : (
            <Copy className="mr-2 h-4 w-4" />
          )}
          <span>{copied ? "Copied!" : "Copy Content"}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Simplified share button for inline use (e.g., next to messages)
export function ShareIconButton({
  content,
  className,
}: {
  content: ShareContent;
  className?: string;
}) {
  return (
    <ShareButton
      content={content}
      variant="ghost"
      size="icon"
      showLabel={false}
      className={cn("h-8 w-8", className)}
    />
  );
}

// Hook for programmatic sharing
export function useShare() {
  const share = useCallback(async (content: ShareContent) => {
    // Try native share first
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: content.title,
          text: content.text,
          url: content.url || window.location.href,
        });
        return { success: true, method: "native" };
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return { success: false, method: "cancelled" };
        }
      }
    }

    // Fallback to clipboard
    try {
      const textToCopy = `${content.title}\n\n${content.text}${content.url ? `\n\n${content.url}` : ""}`;
      await navigator.clipboard.writeText(textToCopy);
      return { success: true, method: "clipboard" };
    } catch (error) {
      return { success: false, method: "failed", error };
    }
  }, []);

  return { share };
}

export default ShareButton;
