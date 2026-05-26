function createCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

async function loadImage(source) {
  if (source instanceof ImageBitmap) return source;
  if (source instanceof Blob) return createImageBitmap(source);
  if (typeof source === 'string') {
    if (source.startsWith('data:')) {
      const response = await fetch(source);
      const blob = await response.blob();
      return createImageBitmap(blob);
    }
    const response = await fetch(source);
    const blob = await response.blob();
    return createImageBitmap(blob);
  }
  throw new Error('Unsupported image source');
}

function grayscale(imageData) {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const avg = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    data[i] = data[i + 1] = data[i + 2] = avg;
  }
  return imageData;
}

function adjustContrast(imageData, factor = 1.5) {
  const data = imageData.data;
  const intercept = 128 * (1 - factor);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, data[i] * factor + intercept));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] * factor + intercept));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] * factor + intercept));
  }
  return imageData;
}

function sharpen(imageData, width) {
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  const src = new Uint8ClampedArray(imageData.data);
  const dst = imageData.data;
  const height = dst.length / 4 / width;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let val = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4 + c;
            val += src[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
          }
        }
        dst[(y * width + x) * 4 + c] = Math.min(255, Math.max(0, val));
      }
    }
  }
  return imageData;
}

async function generateThumbnail(bitmap, maxWidth = 200) {
  const ratio = maxWidth / bitmap.width;
  const w = Math.min(maxWidth, bitmap.width);
  const h = Math.round(bitmap.height * ratio);
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  if (canvas.convertToBlob) {
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.6 });
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }
  return canvas.toDataURL('image/jpeg', 0.6);
}

const imagePreprocessor = {
  async preprocess(source) {
    const bitmap = await loadImage(source);
    const canvas = createCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);

    let imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    imageData = grayscale(imageData);
    imageData = adjustContrast(imageData, 1.5);
    imageData = sharpen(imageData, bitmap.width);
    ctx.putImageData(imageData, 0, 0);

    if (canvas.convertToBlob) {
      return canvas.convertToBlob({ type: 'image/png' });
    }
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  },

  async thumbnail(source) {
    const bitmap = await loadImage(source);
    return generateThumbnail(bitmap);
  },
};

export default imagePreprocessor;
