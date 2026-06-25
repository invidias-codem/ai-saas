// components/empty.tsx
import React from 'react';
import Image from 'next/image';

interface EmptyProps {
  label: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyProps> = ({ label, description, actionLabel, onAction }) => {
  if (!label) {
    throw new Error('EmptyState: label is required');
  }

  return (
    <div className="h-full p-8 md:p-12 flex flex-col items-center justify-center text-center">
      <div className="relative h-40 w-40 md:h-52 md:w-52 mb-6 flex items-center justify-center">
        <Image
          src="/Genie.png"
          alt="Empty state"
          width={192}
          height={192}
          className="opacity-60"
        />
      </div>

      <h3 className="text-lg md:text-xl font-semibold text-foreground mb-2">
        {label}
      </h3>

      {description && (
        <p className="text-muted-foreground text-sm md:text-base max-w-md leading-relaxed mb-6">
          {description}
        </p>
      )}

      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="rounded-full border border-border bg-secondary hover:bg-accent px-5 py-2 text-sm font-medium text-foreground transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

EmptyState.displayName = 'EmptyState';
export default EmptyState;
