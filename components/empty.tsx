import Image from "next/image";

interface EmptyProps {
  label: string;
}

const EmptyState = () => ({  // Display name assigned
  label
}: EmptyProps) => {
  return (
    <div className="h-full p-20 flex flex-col items-center justify-center">
      <div className="relative h-72 w-72">
        <Image 
          alt="Empty"
          fill
          src="/genie.png"
        />
      </div>
      <p className="text-muted-forground text-sm text-center">
        {label}
      </p>
    </div>
  );
};

export default EmptyState;  // Export the component with the display name

