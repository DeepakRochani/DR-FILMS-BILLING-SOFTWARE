/**
 * Compresses an image File to a max dimension of 800px and exports as a JPEG data URL.
 * Stored directly in IndexedDB without bloating storage.
 */
export async function compressReceiptImage(file, maxDimension = 800, quality = 0.8) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return reject(new Error('Selected file is not an image'));
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read receipt image file'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Could not get canvas context for image compression'));
        }

        // Draw white background for transparent images
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);

        ctx.drawImage(img, 0, 0, width, height);

        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve({
          dataUrl: compressedDataUrl,
          width,
          height,
          originalName: file.name
        });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}
