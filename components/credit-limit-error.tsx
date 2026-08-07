'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export interface CreditLimitErrorPayload {
  error?: string;
  message?: string;
  remaining?: number;
  topUpUrl?: string;
  code?: string;
}

export function CreditLimitError({ payload, onTopUp }: { payload: CreditLimitErrorPayload; onTopUp?: () => void }) {
  const t = useTranslations();

  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
      <p className="text-sm font-semibold text-red-600">{payload.error ?? 'Insufficient credits'}</p>
      <p className="mt-1 text-xs text-muted-foreground">{payload.message}</p>
      {typeof payload.remaining === 'number' && (
        <p className="mt-1 text-xs text-muted-foreground">
          Remaining: <span className="font-mono">{payload.remaining}</span>
        </p>
      )}
      <Button
        size="sm"
        className="mt-3 bg-yellow-500 text-black hover:bg-yellow-600"
        onClick={() => {
          if (onTopUp) {
            onTopUp();
          } else if (payload.topUpUrl) {
            window.location.href = payload.topUpUrl;
          }
        }}
      >
        {t('Settings.topUp', 'Top Up')}
      </Button>
    </div>
  );
}
