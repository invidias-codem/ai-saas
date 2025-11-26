import { useEffect, useState } from "react";
import { Brain } from "lucide-react";
import Link from "next/link";

export function MemoryIndicator() {
  const [factsCount, setFactsCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFactsCount = async () => {
      try {
        const response = await fetch("/api/memory/analytics");
        if (response.ok) {
          const data = await response.json();
          setFactsCount(data.totalFacts);
        }
      } catch (error) {
        console.error("Error fetching facts count:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchFactsCount();
  }, []);

  if (loading || factsCount === null) {
    return null;
  }

  return (
    <Link
      href="/settings"
      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 transition-colors"
      title="View your stored memories"
    >
      <Brain className="w-3.5 h-3.5" />
      <span>{factsCount} memories</span>
    </Link>
  );
}
