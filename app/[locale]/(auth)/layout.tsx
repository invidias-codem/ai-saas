import Image from "next/image";
import Link from "next/link";
import "./lattice-auth.css";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="lattice-auth min-h-dvh bg-background px-3 py-8 text-foreground sm:px-6 sm:py-12">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-sm flex-col items-center justify-center gap-6 sm:min-h-[calc(100dvh-6rem)]">
        <Link href="/" className="inline-flex items-center gap-2.5 rounded-lg text-xl font-bold tracking-tight">
          <Image src="/lattice-logo.png" alt="" width={36} height={36} className="rounded-lg" />
          <span>Lattice OS</span>
        </Link>
        <main className="w-full min-w-0">{children}</main>
      </div>
    </div>
  );
}
