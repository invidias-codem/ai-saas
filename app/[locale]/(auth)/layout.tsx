'use client';

import './lattice-auth.css';

const AuthLayout = ({
    children
}: {
    children: React.ReactNode;
}) => {
    return (
        <div className="relative flex items-center justify-center h-full min-h-screen overflow-hidden">
            {/* Background image */}
            <div 
                className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-60"
                style={{ backgroundImage: 'url(/auth/lattice-login-bg.png)' }}
            />
            
            {/* Overlay gradient for better contrast */}
            <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/50 to-transparent" />
            
            {/* Animated particles/glitch effect */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-1 h-1 bg-cyan-400 rounded-full animate-pulse opacity-60" />
                <div className="absolute top-3/4 right-1/4 w-1 h-1 bg-purple-400 rounded-full animate-pulse opacity-60" style={{ animationDelay: '1s' }} />
                <div className="absolute top-1/2 right-1/3 w-1 h-1 bg-blue-400 rounded-full animate-pulse opacity-60" style={{ animationDelay: '2s' }} />
            </div>
            
            {/* Content */}
            <div className="relative z-10 w-full max-w-md px-4 lattice-auth">
                {children}
            </div>
        </div>
    );
}

export default AuthLayout;