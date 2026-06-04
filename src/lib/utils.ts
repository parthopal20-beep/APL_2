import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Compresses an image to be roughly under a certain size in KB.
 * Works by resizing and adjusting quality.
 */
export async function compressImage(
  file: File | Blob, 
  targetSizeKB: number = 45, 
  maxWidth: number = 800
): Promise<Blob> {
  // Hard cap targetSizeKB at 45 to strictly satisfy under 50KB requirement
  const enforcedTarget = Math.min(targetSizeKB, 45);
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

        // Resize
        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Failed to get canvas context'));

        ctx.drawImage(img, 0, 0, width, height);

        // Quality adjustment loop to get under target size
        let quality = 0.9;
        const step = 0.05;
        
        const tryCompress = () => {
          canvas.toBlob(
            (blob) => {
              if (!blob) return reject(new Error('Blob creation failed'));
              
              if (blob.size / 1024 > enforcedTarget && quality > 0.1) {
                quality -= step;
                tryCompress();
              } else {
                resolve(blob);
              }
            },
            'image/jpeg',
            quality
          );
        };

        tryCompress();
      };
      img.onerror = () => reject(new Error('Image load error'));
    };
    reader.onerror = () => reject(new Error('File reader error'));
  });
}
