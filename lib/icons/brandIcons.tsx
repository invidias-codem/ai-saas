"use client";

import {
  Share2,
  Copy,
  Check,
  Mail,
  MessageCircle,
  Send,
  Link2,
  Smartphone,
  RefreshCcw,
  ArrowDown,
  X,
  Paperclip,
  AlertCircle,
  ArrowRight,
  Code,
  Sparkles,
  Layers3,
  Cpu,
  Search,
  Zap,
  FileText,
  Brain,
  Activity,
  Wrench,
  Shield,
  Users,
  ImageIcon,
  Presentation,
  Calendar,
  Bot,
  ExternalLink,
  Settings,
  Database,
  Archive,
  Key,
  Loader2,
  CheckCircle,
  XCircle,
  FolderGit2,
  Globe,
  MessageSquare,
  Hash,
} from "lucide-react";
import { siFacebook, siGithub, siTrello } from "simple-icons";

type IconProps = {
  className?: string;
  size?: number | string;
};

const brandPaths: Record<string, { path: string; color: string }> = {
  Facebook: { path: siFacebook.path, color: siFacebook.hex },
  Github: { path: siGithub.path, color: siGithub.hex },
  GitHub: { path: siGithub.path, color: siGithub.hex },
  Trello: { path: siTrello.path, color: siTrello.hex },
  Twitter: {
    path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
    color: "#000000",
  },
  Linkedin: {
    path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
    color: "#0A66C2",
  },
  Slack: {
    path: "M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.315A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.52v-6.315zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm9.974 3.259a2.528 2.528 0 0 1 2.52-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.52V8.834zm-1.271 0a2.528 2.528 0 0 1-2.521 2.521 2.527 2.527 0 0 1-2.521-2.521V2.522A2.527 2.527 0 0 1 15.166 0a2.528 2.528 0 0 1 2.521 2.522v6.315zm-2.521 9.974a2.528 2.528 0 0 1 2.521 2.52 2.528 2.528 0 0 1-2.521 2.523 2.529 2.529 0 0 1-2.521-2.523v-2.52h2.521zm0-1.271a2.527 2.527 0 0 1-2.521-2.521 2.526 2.526 0 0 1 2.521-2.521h6.315A2.527 2.527 0 0 1 24 15.166a2.528 2.528 0 0 1-2.522 2.521h-6.312z",
    color: "#4A154B",
  },
};

const lucideMap: Record<string, React.ComponentType<IconProps>> = {
  Share2,
  Copy,
  Check,
  Mail,
  MessageCircle,
  Send,
  Link2,
  Smartphone,
  Twitter: Globe,
  Linkedin: Link2,
  LinkedIn: Link2,
  Slack: MessageSquare,
  FolderGit2,
  Loader2,
  CheckCircle,
  XCircle,
  RefreshCcw,
  ArrowDown,
  X,
  Paperclip,
  AlertCircle,
  ArrowRight,
  Code,
  Sparkles,
  Layers3,
  Cpu,
  Search,
  Zap,
  FileText,
  Brain,
  Activity,
  Wrench,
  Shield,
  Users,
  ImageIcon,
  Presentation,
  Calendar,
  Bot,
  ExternalLink,
  Settings,
  Database,
  Archive,
  Key,
};

export const getIcon = (name: string): React.ComponentType<IconProps> | null => {
  if (name in lucideMap) return lucideMap[name];
  return null;
};

export const BrandIcon = ({ name, className, size = 18, ...rest }: IconProps & { name: string }) => {
  const brand = brandPaths[name];
  if (brand) {
    return (
      <svg viewBox="0 0 24 24" fill={brand.color} className={className} width={size} height={size} {...rest}>
        <path d={brand.path} />
      </svg>
    );
  }
  const Component = getIcon(name);
  if (!Component) return null;
  return <Component className={className} size={size} {...rest} />;
};
