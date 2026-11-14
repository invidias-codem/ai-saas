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
      <div className="rounded-2xl border border-border bg-accent p-5 text-center sm:p-8">
        <CheckCircledIcon className="w-12 h-12 text-primary mx-auto mb-4" />
        <h3 role="status" className="mb-2 text-xl font-semibold text-accent-foreground">Message sent</h3>
        <p className="text-muted-foreground mb-6">
          Thanks for reaching out — we&apos;ll respond as soon as we can.
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
          <label htmlFor="support-name" className="mb-2 block text-sm font-medium text-foreground">Your name</label>
          <Input
            type="text"
            id="support-name"
            name="name"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="bg-card min-h-[48px]"
            placeholder="Jane Doe"
            maxLength={200}
          />
        </div>
        <div>
          <label htmlFor="support-email" className="mb-2 block text-sm font-medium text-foreground">Email address</label>
          <Input
            type="email"
            id="support-email"
            name="email"
            required
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="bg-card min-h-[48px]"
            placeholder="jane@example.com"
            maxLength={254}
          />
        </div>
      </div>

      <div>
        <label htmlFor="support-subject" className="mb-2 block text-sm font-medium text-foreground">Subject</label>
        <Input
          type="text"
          id="support-subject"
          name="subject"
          required
          value={formData.subject}
          onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
          className="bg-card min-h-[48px]"
          placeholder="What can we help with?"
          maxLength={300}
        />
      </div>

      <div>
        <label htmlFor="support-message" className="mb-2 block text-sm font-medium text-foreground">Message</label>
        <Textarea
          id="support-message"
          name="message"
          required
          rows={6}
          value={formData.message}
          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
          className="bg-card resize-none"
          placeholder="Describe the issue, question, or behavior you need help with..."
          maxLength={10000}
        />
      </div>

      {submitStatus === "error" && (
        <div className="p-4 rounded-lg bg-danger-surface border border-destructive/30 flex items-center gap-3" role="alert">
          <ExclamationTriangleIcon className="w-5 h-5 text-destructive" />
          <p className="text-destructive text-sm">Something went wrong. Please try again.</p>
        </div>
      )}

      <Button
        type="submit"
        variant="action"
        disabled={isSubmitting}
        className="w-full py-6 rounded-xl text-lg min-h-[48px] transition"
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
