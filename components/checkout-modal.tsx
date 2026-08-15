"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { KoFiWidget } from "@/components/kofi-widget";
import { PayPalButton } from "@/components/paypal-button";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";

interface CheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CheckoutModal({ open, onOpenChange }: CheckoutModalProps) {
  const { isSignedIn, isLoaded } = useUser();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b border-border shrink-0">
          <DialogTitle className="text-xl font-bold text-foreground">
            Complete Your Support
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Choose an amount below to top up your compute credits.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-6">
          {/* Ko-fi iframe widget */}
          <div className="w-full bg-[#f9f9f9] rounded-xl overflow-hidden border border-border">
            <KoFiWidget />
          </div>

          {/* Post-payment instructions */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">After payment</h2>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              <li>
                Complete your payment in the widget above using the{" "}
                <strong className="text-foreground">same email</strong> as your account.
              </li>
              <li>
                {isLoaded && isSignedIn ? (
                  <>
                    Refresh this page or go to <strong className="text-foreground">Dashboard</strong> — your credits will appear automatically once the payment webhook confirms.
                  </>
                ) : (
                  <>
                    Click <strong className="text-foreground">Sign in</strong> below and log in with the same email you used for payment — your credits will appear automatically once the webhook confirms.
                  </>
                )}
              </li>
              <li>
                Credits are granted at a rate of{" "}
                <strong className="text-foreground">50 credits per USD</strong>.
              </li>
            </ol>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              {isLoaded && !isSignedIn && (
                <Link
                  href="/sign-in"
                  className="inline-flex items-center justify-center rounded-xl px-4 py-2 bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
                  onClick={() => onOpenChange(false)}
                >
                  Sign in
                </Link>
              )}
              <Link
                href={isSignedIn ? "/dashboard" : "/sign-up"}
                className="inline-flex items-center justify-center rounded-xl px-4 py-2 border border-border bg-card hover:bg-accent transition-colors font-medium"
                onClick={() => onOpenChange(false)}
              >
                {isSignedIn ? "Go to Dashboard" : "Create account"}
              </Link>
            </div>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            Having trouble?{" "}
            <Link href="/support" className="underline hover:text-primary" onClick={() => onOpenChange(false)}>
              Contact support
            </Link>{" "}
            with your payment email and transaction ID.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
