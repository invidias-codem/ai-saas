'use client';

import React from 'react';

interface StereoBarsProps {
  active?: boolean;
  bars?: number;
}

const StereoBars: React.FC<StereoBarsProps> = ({ active = false, bars = 24 }) => {
  const seed = React.useMemo(() => Array.from({ length: bars }).map(() => Math.random()), [bars]);

  return (
    <div className="flex items-end gap-1 h-14">
      {seed.map((v, i) => (
        <div
          key={i}
          className="w-2 rounded-full bg-gradient-to-t from-emerald-600 to-teal-400"
          style={{
            height: active ? `${20 + v * 80}%` : '20%',
            opacity: active ? 0.9 : 0.35,
            transition: 'height 180ms ease-out, opacity 180ms ease-out',
            animation: active ? `none` : 'none',
            transformOrigin: 'bottom',
          }}
        />
      ))}
      <style jsx>{`
        @keyframes barpulse {
          0%,
          100% {
            transform: scaleY(0.4);
          }
          50% {
            transform: scaleY(1.05);
          }
        }
      `}</style>
    </div>
  );
};

export default StereoBars;
