function createCanvas(width, height) {
  return new OffscreenCanvas(width, height);
}

function dataUrlToBlob(dataUrl) {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) throw new Error('Invalid image data');
  const header = dataUrl.slice(0, commaIdx);
  const b64 = dataUrl.slice(commaIdx + 1);
  const mimeMatch = header.match(/:(.*?);/);
  if (!mimeMatch) throw new Error('Invalid image data');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeMatch[1] });
}

async function blobToDataUrl(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(binary)}`;
}

async function loadImage(source) {
  if (source instanceof ImageBitmap) return source;
  if (source instanceof Blob) return createImageBitmap(source);
  if (typeof source === 'string') {
    if (source.startsWith('data:')) {
      const blob = dataUrlToBlob(source);
      return createImageBitmap(blob);
    }
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Failed to fetch image: HTTP ${response.status}`);
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

function otsuThreshold(imageData) {
  const data = imageData.data;
  const hist = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) hist[data[i]]++;
  const total = data.length / 4;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, threshold = 0;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
}

function binarize(imageData) {
  const t = otsuThreshold(imageData);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i] >= t ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = v;
  }
  return imageData;
}

async function generateThumbnail(bitmap, maxWidth = 200) {
  if (bitmap.width < 1 || bitmap.height < 1) {
    throw new Error('Cannot generate thumbnail for zero-dimension image');
  }
  const ratio = Math.min(1, maxWidth / bitmap.width);
  const w = Math.max(1, Math.round(bitmap.width * ratio));
  const h = Math.max(1, Math.round(bitmap.height * ratio));
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.6 });
  return blobToDataUrl(blob);
}

const imagePreprocessor = {
  async preprocess(source, { gentle = false } = {}) {
    let bitmap = await loadImage(source);
    let w = bitmap.width;
    let h = bitmap.height;
    if (w < 1 || h < 1) {
      bitmap.close();
      throw new Error('Image has zero dimensions and cannot be processed');
    }

    const MIN_HEIGHT = 800;
    let scale = 1;
    if (h < MIN_HEIGHT) {
      scale = Math.min(3, MIN_HEIGHT / h);
      const sw = Math.round(w * scale);
      const sh = Math.round(h * scale);
      const upCanvas = createCanvas(sw, sh);
      const upCtx = upCanvas.getContext('2d');
      upCtx.imageSmoothingEnabled = true;
      upCtx.imageSmoothingQuality = 'high';
      upCtx.drawImage(bitmap, 0, 0, sw, sh);
      bitmap.close();
      bitmap = await createImageBitmap(await upCanvas.convertToBlob({ type: 'image/png' }));
      w = sw;
      h = sh;
    }

    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    let imageData = ctx.getImageData(0, 0, w, h);
    imageData = grayscale(imageData);
    imageData = adjustContrast(imageData, gentle ? 1.2 : 1.5);
    if (!gentle) {
      imageData = sharpen(imageData, w);
    }
    imageData = binarize(imageData);
    ctx.putImageData(imageData, 0, 0);

    return canvas.convertToBlob({ type: 'image/png' });
  },

  async thumbnail(source) {
    const bitmap = await loadImage(source);
    const result = await generateThumbnail(bitmap);
    bitmap.close();
    return result;
  },

  async toDataUrl(source, { maxWidth = 2000, quality = 0.85 } = {}) {
    const bitmap = await loadImage(
      typeof source === 'string' && source.startsWith('data:') ? dataUrlToBlob(source) : source
    );
    const scale = Math.min(1, maxWidth / bitmap.width);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    return blobToDataUrl(blob);
  },
};

export default imagePreprocessor;
