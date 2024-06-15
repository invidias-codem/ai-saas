import Image from "next/image";

interface EmptyProps {
  label: string; // ' can be escaped with &apos;, &lsquo;, &#39;, &rsquo;
}

const EmptyState = ({ label }: EmptyProps) => {
  if (!label) {
    throw new Error('EmptyState: label is required');
  }

  return (
    <div className="h-full p-20 flex flex-col items-center justify-center">
      <div className="relative h-72 w-72">
        <Image 
          alt="Empty"
          fill
          src="/genie.png"
        />
      </div>
      <p className="text-muted-foreground text-sm text-center">
        {label}
      </p>
    </div>
  );
};

export default EmptyState;  // Export the component with the display name

