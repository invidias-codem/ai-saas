// components/empty.tsx
import React from 'react';
import Image from 'next/image'; // ✅ Import the Image component

interface EmptyProps {
  label: string;
}

export const EmptyState: React.FC<EmptyProps> = ({ label }) => {
  if (!label) {
    throw new Error('EmptyState: label is required');
  }

  return (
    <div className="h-full p-20 flex flex-col items-center justify-center text-center">
      <div className="relative h-72 w-72 mb-4 flex items-center justify-center">
        {/* ✅ Replaced <img> with <Image /> */}
        <Image
          src="/Genie.png"
          alt="Empty state"
          width={192}  // (w-48 -> 12rem -> 192px)
          height={192} // (h-48 -> 12rem -> 192px)
          className="opacity-50"
        />
      </div>
      <p className="text-muted-foreground text-sm"> 
        {label}
      </p>
    </div>
  );
}

EmptyState.displayName = 'EmptyState'; 
export default EmptyState;