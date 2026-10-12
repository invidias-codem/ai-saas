import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VideoResult } from '@/components/media/VideoResult';

const previewUrl = '/api/video/artifacts/e482eb32-349e-4174-a639-80a2dbdfcc8a/preview';
const downloadUrl = previewUrl.replace('/preview', '/download');
const render = (playbackError: string | null) => renderToStaticMarkup(createElement(VideoResult, {
  previewUrl, downloadUrl, playbackError, previewAttempt: 0,
  onPlaybackError: () => {}, onPlaybackReady: () => {}, onRetry: () => {},
}));

describe('Quick Clip rendered result', () => {
  test('a preview error keeps the same source and Download MP4 link visible', () => {
    const html = render('Preview unavailable. Try downloading the MP4.');
    expect(html).toContain(`src="${previewUrl}"`);
    expect(html).toContain(`href="${downloadUrl}"`);
    expect(html).toContain('Download MP4');
    expect(html).toContain('Retry preview');
    expect(html).toContain('role="status"');
  });
  test('ready output uses inline metadata playback without a cross-origin download workaround', () => {
    const html = render(null);
    expect(html).toContain('playsinline=""');
    expect(html).toContain('preload="metadata"');
    expect(html).toContain(`href="${downloadUrl}"`);
    expect(html).not.toContain('target="_blank"');
    expect(html).not.toContain('Retry preview');
  });
});
