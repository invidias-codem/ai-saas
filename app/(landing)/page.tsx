// app/(landing)/page.tsx
import { Button } from "@/components/ui/button"; // Import Shadcn Button
import Link from "next/link";
import Image from "next/image"; // Import Next.js Image component


const LandingPage = () => {
  return (
    // Use a darker, more professional background (adjust as needed)
    // Consider a subtle gradient, pattern, or high-quality background image
    <div className="bg-gray-900 text-white min-h-screen flex flex-col">

      {/* Optional Header/Navbar Placeholder */}
      <header className="py-4 px-6 md:px-10 flex justify-between items-center">
        {/* Simple Logo Placeholder */}
        <div className="flex items-center gap-2">
            {/* You can replace this with your actual logo component or Image */}
             <Image src="/Genie.png" alt="Genie Logo" width={32} height={32} /> 
            <span className="text-xl font-bold">Genie AI</span>
        </div>
        {/* Login Button for Header */}
        <Link href="/sign-in">
           <Button variant="outline" size="sm">Login</Button>
        </Link>
      </header>

      {/* Hero Section */}
      <main className="flex-grow flex items-center justify-center text-center px-4">
        <div className="max-w-3xl"> {/* Increased max-width */}
          {/* Compelling Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold mb-6 leading-tight">
            Unleash Your Potential with AI
          </h1>
          {/* Brief Description/Tagline */}
          <p className="text-lg sm:text-xl text-gray-300 mb-10 max-w-xl mx-auto">
            Genie is your all-in-one platform leveraging cutting-edge AI for content creation, code assistance, and data insights. Streamline your workflow and achieve more.
          </p>
          {/* Call to Action Buttons */}
          <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
            <Link href="/sign-up">
              {/* Use Shadcn Button component */}
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto">
                Get Started Free
              </Button>
            </Link>
             <Link href="/sign-in">
               {/* Optional: Secondary Login button if not in header */}
               <Button variant="secondary" size="lg" className="w-full sm:w-auto">
                 Sign In
               </Button>
             </Link>
          </div>
        </div>
      </main>

       {/* Optional Footer Placeholder */}
       <footer className="text-center py-4 px-6 text-gray-500 text-sm">
         © {new Date().getFullYear()} Genie AI. All rights reserved.
       </footer>
    </div>
  );
};

export default LandingPage;