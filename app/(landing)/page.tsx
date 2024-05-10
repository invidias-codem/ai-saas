import { Button } from "@/components/ui/button";
import Link from "next/link";

const LandingPage = () => {
    return (
      <div className="bg-gradient-to-r from-cyan-500 to-blue-500 h-screen flex items-center justify-center">
        <div className="max-w-md text-center">
          <h1 className="text-4xl font-bold mb-8 text-white">Landing Page (Unprotected)</h1>
          <div className="flex justify-center gap-4">
            <Link href="/sign-in">
              <button className="py-2 px-4 bg-white rounded-lg shadow-md hover:bg-opacity-80 text-black font-medium">
                Login
              </button>
            </Link>
            <Link href="/sign-up">
              <button className="py-2 px-4 border border-white rounded-lg hover:border-opacity-80 text-white font-medium">
                Join
              </button>
            </Link>
          </div>
        </div>
      </div>
    );
  };
  

export default LandingPage;