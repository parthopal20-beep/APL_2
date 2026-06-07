import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Compresses an image to be strictly under a certain size in KB.
 * Works by resizing and adjusting quality.
 */
export async function compressImage(
  file: File | Blob, 
  targetSizeKB: number = 48, // Slightly below 50 for safety margin
  maxWidth: number = 800
): Promise<Blob> {
  const enforcedTarget = Math.min(targetSizeKB, 48); 
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Smart Resize: If image is massive, downscale immediately to save memory and size
        if (width > 2000 || height > 2000) {
           const factor = 1000 / Math.max(width, height);
           width *= factor;
           height *= factor;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Failed to get canvas context'));

        ctx.drawImage(img, 0, 0, width, height);

        // Recursive aggressive compression
        let quality = 0.7;
        let currentIter = 0;
        const maxIter = 5;
        
        const tryCompress = (currentWidth: number, currentHeight: number, currentQuality: number) => {
          currentIter++;
          
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = currentWidth;
          tempCanvas.height = currentHeight;
          const tempCtx = tempCanvas.getContext('2d');
          if (!tempCtx) return;
          tempCtx.drawImage(img, 0, 0, currentWidth, currentHeight);

          tempCanvas.toBlob(
            (blob) => {
              if (!blob) return reject(new Error('Blob creation failed'));
              
              const currentSizeKB = blob.size / 1024;
              
              // If under target, we are done
              if (currentSizeKB <= enforcedTarget) {
                resolve(blob);
                return;
              }

              // If still too large and we haven't exhausted retries
              if (currentIter < maxIter) {
                // Reduce quality and dimension by 25% each step
                tryCompress(currentWidth * 0.75, currentHeight * 0.75, Math.max(0.1, currentQuality - 0.2));
              } else {
                // Final effort: tiny dimensions + lowest quality
                const tinyCanvas = document.createElement('canvas');
                tinyCanvas.width = Math.min(currentWidth, 400);
                tinyCanvas.height = Math.min(currentHeight, 400);
                const tinyCtx = tinyCanvas.getContext('2d');
                if (tinyCtx) {
                   tinyCtx.drawImage(img, 0, 0, tinyCanvas.width, tinyCanvas.height);
                   tinyCanvas.toBlob((tinyBlob) => {
                      resolve(tinyBlob || blob);
                   }, 'image/jpeg', 0.1);
                } else {
                   resolve(blob);
                }
              }
            },
            'image/jpeg',
            currentQuality
          );
        };

        tryCompress(width, height, quality);
      };
      img.onerror = () => reject(new Error('Image load error'));
    };
    reader.onerror = () => reject(new Error('File reader error'));
  });
}
