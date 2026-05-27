export async function scrubImageMetadata(file: File, maxDimension: number = 2048): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // 1. Create an Object URL for the file
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      // Free memory
      URL.revokeObjectURL(url);

      // 2. Calculate scaling to preserve aspect ratio and respect maxDimension
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      // 3. Draw to canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context not available'));
        return;
      }

      // 4. Fill with white (prevents transparent PNG issues if converted to JPEG)
      // We will export to JPEG by default for best LLM compatibility and size
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      // 5. Export as blob (scrubs EXIF, resizes)
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Canvas export failed'));
          }
        },
        'image/jpeg',
        0.85 // 85% quality is a good balance for LLM vision tasks
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for scrubbing'));
    };

    img.src = url;
  });
}
