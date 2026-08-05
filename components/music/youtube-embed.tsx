'use client';

import React from 'react';

interface YouTubeEmbedProps {
  videoId: string;
  title?: string;
}

const YouTubeEmbed: React.FC<YouTubeEmbedProps> = ({ videoId, title }) => {
  return (
    <div className="mt-4 w-full">
      <div
        className="relative w-full overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-background to-emerald-500/5 shadow-2xl shadow-emerald-500/10"
        style={{ paddingTop: '56.25%' }}
      >
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}`}
          title={title || 'YouTube embed'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full rounded-2xl"
        />
      </div>
    </div>
  );
};

export default YouTubeEmbed;
