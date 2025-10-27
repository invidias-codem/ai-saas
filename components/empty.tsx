// components/empty.tsx
import React from 'react'; // Import React if not already

interface EmptyProps {
  label: string;
}

// Use React.FC for functional components with props
export const EmptyState: React.FC<EmptyProps> = ({ label }) => {
  // The check for label existence is good, keep it.
  if (!label) {
    // You might want to return null or a default message instead of throwing an error
    // depending on desired behavior. For now, we keep the throw.
    throw new Error('EmptyState: label is required');
  }

  return (
    <div className="h-full p-20 flex flex-col items-center justify-center text-center"> {/* Added text-center */}
      <div className="relative h-72 w-72 mb-4 flex items-center justify-center"> {/* Adjusted layout */}
        {/* You could add an icon or image here if desired */}
        <img src="/Genie.png" alt="Empty state" className="w-48 h-48 opacity-50" /> {/* Example image */}
      </div>
      {/* ✅ Use the label prop here */}
      <p className="text-muted-foreground text-sm"> 
        {label}
      </p>
    </div>
  );
}

EmptyState.displayName = 'EmptyState'; 

// Simpler export if not using forwardRef explicitly here
export default EmptyState;