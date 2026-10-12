"use client";

import { DownloadIcon } from '@radix-ui/react-icons';
import { Button } from '@/components/ui/button';

interface VideoResultProps {
  previewUrl: string;
  downloadUrl: string | null;
  playbackError: string | null;
  previewAttempt: number;
  onPlaybackError: () => void;
  onPlaybackReady: () => void;
  onRetry: () => void;
}

/** Playback failure never changes the artifact's preview or download identity. */
export function VideoResult({ previewUrl, downloadUrl, playbackError, previewAttempt,
  onPlaybackError, onPlaybackReady, onRetry }: VideoResultProps) {
  return (
    <div className="w-full max-w-2xl rounded-2xl overflow-hidden border border-pink-700/20 bg-gradient-to-br from-background to-pink-700/5 p-2 sm:p-4 shadow-2xl shadow-pink-700/10">
      <video
        key={previewAttempt}
        controls
        playsInline
        preload="metadata"
        controlsList="nodownload noremoteplayback"
        className="w-full rounded-xl shadow-lg mb-2 sm:mb-4"
        src={previewUrl}
        onError={onPlaybackError}
        onLoadedData={onPlaybackReady}
      >
        Your browser does not support the video tag.
      </video>
      {playbackError && <p role="status" className="mb-4 text-sm text-amber-600">{playbackError}</p>}
      <div className="flex flex-col sm:flex-row gap-2 w-full">
        {downloadUrl && (
          <a
            href={downloadUrl}
            className="flex-1 inline-flex items-center justify-center px-4 py-3 bg-gradient-to-r from-pink-700 to-rose-600 hover:from-pink-600 hover:to-rose-500 text-white shadow-lg shadow-pink-700/30 hover:shadow-pink-700/50 transition-all duration-300 rounded-xl font-semibold text-sm"
          >
            <DownloadIcon className="mr-2 h-4 w-4" /> Download MP4
          </a>
        )}
        {playbackError && <Button
          onClick={onRetry}
          variant="outline"
          className="bg-background/50 backdrop-blur-sm border-pink-700/20 hover:border-pink-700/40 rounded-xl"
        >Retry preview</Button>}
      </div>
    </div>
  );
}
