/**
 * Component for displaying a message when there is no content.
 * @param label The message to display.
 */
interface EmptyProps {
  label: string;
}

export const EmptyState = ({ label }: EmptyProps) => {
  if (!label) {
    throw new Error('EmptyState: label is required');
  }

  return (
    <div className="h-full p-20 flex flex-col items-center justify-center">
      <div className="relative h-72 w-72">
        Generating Content...
      </div>
    </div>
  );
}

EmptyState.displayName = 'EmptyState'; // Move this line below the function declaration

/**
 * Export the component with the display name so that it can be used in the HTML output.
 */
export default EmptyState as React.ForwardRefExoticComponent<EmptyProps & React.RefAttributes<{}>>;

