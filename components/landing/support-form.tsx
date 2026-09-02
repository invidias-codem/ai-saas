"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircledIcon, ExclamationTriangleIcon } from "@radix-ui/react-icons";
import { Send, Loader2 } from "lucide-react";

export function SupportForm() {
  const [formData, setFormData] = useState({ name: "", email: "", subject: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus("idle");

    try {
      // Honeypot lives in form too — read via FormData so it posts automatically
      const fd = new FormData(e.currentTarget as HTMLFormElement);
      const body: Record<string, string> = Object.fromEntries(
        Array.from(fd.entries()).map(([k, v]) => [k, String(v)])
      );

      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) throw new Error("Failed to send message");

      setSubmitStatus("success");
      setFormData({ name: "", email: "", subject: "", message: "" });
    } catch (error) {
      console.error(error);
      setSubmitStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitStatus === "success") {
    return (
      <div className="p-8 rounded-2xl border border-green-500/30 bg-green-500/10 text-center">
        <CheckCircledIcon className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-foreground mb-2">Message sent</h3>
        <p className="text-muted-foreground mb-6">
          Thanks for reaching out — we'll respond as soon as we can.
        </p>
        <Button
          onClick={() => setSubmitStatus("idle")}
          variant="outline"
          className="border-border text-foreground hover:bg-accent min-h-[48px] transition"
        >
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Honeypot — hidden from humans, visible to bots */}
      <div aria-hidden="true" className="absolute left-[-9999px] top-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor="company_website">Company Website</label>
        <input
          id="company_website"
          name="company_website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-card-foreground mb-2">Your name</label>
          <Input
            type="text"
            name="name"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="bg-card border-border text-foreground placeholder:text-muted-foreground focus:border-purple-500 min-h-[48px]"
            placeholder="Jane Doe"
            maxLength={200}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-card-foreground mb-2">Email address</label>
          <Input
            type="email"
            name="email"
            required
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="bg-card border-border text-foreground placeholder:text-muted-foreground focus:border-purple-500 min-h-[48px]"
            placeholder="jane@example.com"
            maxLength={254}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-card-foreground mb-2">Subject</label>
        <Input
          type="text"
          name="subject"
          required
          value={formData.subject}
          onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
          className="bg-card border-border text-foreground placeholder:text-muted-foreground focus:border-purple-500 min-h-[48px]"
          placeholder="What can we help with?"
          maxLength={300}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-card-foreground mb-2">Message</label>
        <Textarea
          name="message"
          required
          rows={6}
          value={formData.message}
          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
          className="bg-card border-border text-foreground placeholder:text-muted-foreground focus:border-purple-500 resize-none"
          placeholder="Describe the issue, question, or behavior you need help with..."
          maxLength={10000}
        />
      </div>

      {submitStatus === "error" && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-3" role="alert">
          <ExclamationTriangleIcon className="w-5 h-5 text-red-500 dark:text-red-400" />
          <p className="text-red-600 dark:text-red-400 text-sm">Something went wrong. Please try again.</p>
        </div>
      )}

      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-6 rounded-xl text-lg min-h-[48px] transition"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Sending...
          </>
        ) : (
          <>
            <Send className="w-5 h-5 mr-2" />
            Send message
          </>
        )}
      </Button>
    </form>
  );
}
