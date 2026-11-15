import { scrubImageMetadata } from './imageScrubber';

export const MAX_INLINE_CHAT_IMAGE_BYTES = 2 * 1024 * 1024;

const imageTypes: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
};

export function getChatImageMimeType(file: Pick<File, 'name' | 'type'>): string | undefined {
  const type = file.type.toLowerCase();
  if (type.startsWith('image/')) return type;
  if (type && type !== 'application/octet-stream') return undefined;
  const extension = file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  return extension && Object.hasOwn(imageTypes, extension) ? imageTypes[extension] : undefined;
}

export async function prepareChatImage(file: File, mimeType: string): Promise<File> {
  const image = file.type === mimeType ? file : new File([file], file.name, { type: mimeType });
  try {
    // Reuse the existing client-side resize and metadata scrubber. The smaller
    // image can usually travel with the message in one request.
    const jpeg = await scrubImageMetadata(image);
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([jpeg], name, { type: 'image/jpeg' });
  } catch (error) {
    // Some browsers cannot decode HEIC/HEIF locally. Gemini accepts both.
    if (mimeType === 'image/heic' || mimeType === 'image/heif') return image;
    throw error;
  }
}
