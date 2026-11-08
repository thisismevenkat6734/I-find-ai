
import * as ort from "onnxruntime-web";

function resamplePIL(src, dw, dh) {
  const pass = (data, sw, sh, dsize, horizontal) => {
    const srcSize = horizontal ? sw : sh;
    const scale = srcSize / dsize;
    const filterScale = Math.max(scale, 1);
    const support = filterScale;

    const ow = horizontal ? dsize : sw;
    const oh = horizontal ? sh : dsize;
    const output = new Float32Array(ow * oh * 4);
    const bounds = [];

    for (let i = 0; i < dsize; i++) {
      const center = (i + 0.5) * scale;
      const lo = Math.max(0, Math.floor(center - support));
      const hi = Math.min(srcSize, Math.ceil(center + support));
      const weights = new Float32Array(hi - lo);
      let sum = 0;

      for (let k = lo; k < hi; k++) {
        const distance = Math.abs(
          (k + 0.5 - center) / filterScale
        );

        const weight = distance < 1 ? 1 - distance : 0;
        weights[k - lo] = weight;
        sum += weight;
      }

      if (sum > 0) {
        for (let k = 0; k < weights.length; k++) {
          weights[k] /= sum;
        }
      }

      bounds.push([lo, weights]);
    }

    for (let y = 0; y < oh; y++) {
      for (let x = 0; x < ow; x++) {
        const [lo, weights] = bounds[horizontal ? x : y];

        let r = 0;
        let g = 0;
        let b = 0;

        for (let k = 0; k < weights.length; k++) {
          const index = horizontal
            ? (y * sw + lo + k) * 4
            : ((lo + k) * sw + x) * 4;

          r += data[index] * weights[k];
          g += data[index + 1] * weights[k];
          b += data[index + 2] * weights[k];
        }

        const offset = (y * ow + x) * 4;

        output[offset] = r;
        output[offset + 1] = g;
        output[offset + 2] = b;
        output[offset + 3] = 255;
      }
    }

    return output;
  };

  let data = pass(src.data, src.width, src.height, dw, true);
  data = pass(data, dw, src.height, dh, false);

  const result = new Uint8ClampedArray(dw * dh * 4);

  for (let i = 0; i < data.length; i++) {
    result[i] = Math.round(data[i]);
  }

  return {
    data: result,
    width: dw,
    height: dh
  };
}

function cropRGBA(source, x, y, size) {
  const output = new Uint8ClampedArray(size * size * 4);

  for (let row = 0; row < size; row++) {
    const start = ((y + row) * source.width + x) * 4;
    const end = start + size * 4;

    output.set(
      source.data.subarray(start, end),
      row * size * 4
    );
  }

  return output;
}

function imageDataToTensor(data, size, meta) {
  const [meanR, meanG, meanB] = meta.norm_mean;
  const [stdR, stdG, stdB] = meta.norm_std;

  const pixels = size * size;
  const output = new Float32Array(3 * pixels);

  for (let i = 0; i < pixels; i++) {
    const j = i * 4;

    output[i] =
      (data[j] / 255 - meanR) / stdR;

    output[pixels + i] =
      (data[j + 1] / 255 - meanG) / stdG;

    output[2 * pixels + i] =
      (data[j + 2] / 255 - meanB) / stdB;
  }

  return new ort.Tensor(
    "float32",
    output,
    [1, 3, size, size]
  );
}

export function preprocessImage(image, meta) {
  const size = meta.input_size;
  const resizeSide = meta.resize_shorter_side;

  const scale = resizeSide / Math.min(
    image.width,
    image.height
  );

  const resizedWidth = Math.max(
    size,
    Math.round(image.width * scale)
  );

  const resizedHeight = Math.max(
    size,
    Math.round(image.height * scale)
  );

  const resized = resamplePIL(
    image,
    resizedWidth,
    resizedHeight
  );

  const x = Math.floor((resizedWidth - size) / 2);
  const y = Math.floor((resizedHeight - size) / 2);

  const cropped = cropRGBA(resized, x, y, size);

  return imageDataToTensor(cropped, size, meta);
}

export function preprocessFit(image, meta) {
  const size = meta.input_size;

  const scale = size / Math.min(
    image.width,
    image.height
  );

  const resizedWidth = Math.max(
    size,
    Math.round(image.width * scale)
  );

  const resizedHeight = Math.max(
    size,
    Math.round(image.height * scale)
  );

  const resized = resamplePIL(
    image,
    resizedWidth,
    resizedHeight
  );

  const x = Math.floor((resizedWidth - size) / 2);
  const y = Math.floor((resizedHeight - size) / 2);

  const cropped = cropRGBA(resized, x, y, size);

  return imageDataToTensor(cropped, size, meta);
}

export function preprocessNative(image, meta) {
  const size = meta.input_size;

  if (image.width < size || image.height < size) {
    throw new Error("Image is too small for native crop.");
  }

  const x = Math.floor((image.width - size) / 2);
  const y = Math.floor((image.height - size) / 2);

  const cropped = cropRGBA(image, x, y, size);

  return imageDataToTensor(cropped, size, meta);
}

export function degradationStats(image) {
  const { data, width, height } = image;

  if (width < 24 || height < 24) {
    return { block: 1, d12: 1 };
  }

  const luminance = (i) =>
    0.299 * data[i] +
    0.587 * data[i + 1] +
    0.114 * data[i + 2];

  const stepY = Math.max(1, Math.floor(height / 192));

  let dxAll = 0;
  let dxN = 0;
  let dxBlock = 0;
  let dxBlockN = 0;

  let dyAll = 0;
  let dyN = 0;
  let dyBlock = 0;
  let dyBlockN = 0;

  let d2All = 0;

  for (let y = 1; y < height - 1; y += stepY) {
    const row = y * width * 4;
    const nextRow = (y + 1) * width * 4;

    let previous = luminance(row);

    for (let x = 1; x < width - 1; x++) {
      const i = row + x * 4;

      const current = luminance(i);
      const right = luminance(i + 4);
      const down = luminance(nextRow + x * 4);

      const dx = Math.abs(right - current);
      const dy = Math.abs(down - current);

      dxAll += dx;
      dxN++;

      dyAll += dy;
      dyN++;

      d2All += Math.abs(right - previous);

      if (x % 8 === 7) {
        dxBlock += dx;
        dxBlockN++;
      }

      if (y % 8 === 7) {
        dyBlock += dy;
        dyBlockN++;
      }

      previous = current;
    }
  }

  const blockX = dxBlockN
    ? (dxBlock / dxBlockN) / (dxAll / dxN + 1e-6)
    : 1;

  const blockY = dyBlockN
    ? (dyBlock / dyBlockN) / (dyAll / dyN + 1e-6)
    : 1;

  return {
    block: (blockX + blockY) / 2,
    d12: (dxAll / dxN) / (d2All / dxN + 1e-6)
  };
}

export function degenerateReason(image) {
  const { data, width, height } = image;

  const stepY = Math.max(1, height >> 7);

  let count = 0;
  let sum = 0;
  let sumSquared = 0;

  let pairs = 0;
  let sumA = 0;
  let sumB = 0;
  let sumAB = 0;
  let sumA2 = 0;
  let sumB2 = 0;

  for (let y = 0; y < height; y += stepY) {
    const row = y * width * 4;
    let previous = -1;

    for (let x = 0; x < width; x++) {
      const i = row + x * 4;

      const value =
        0.299 * data[i] +
        0.587 * data[i + 1] +
        0.114 * data[i + 2];

      count++;
      sum += value;
      sumSquared += value * value;

      if (previous >= 0) {
        pairs++;
        sumA += previous;
        sumB += value;
        sumAB += previous * value;
        sumA2 += previous * previous;
        sumB2 += value * value;
      }

      previous = value;
    }
  }

  const variance =
    sumSquared / count - (sum / count) ** 2;

  if (variance < 4) return "flat";

  const covariance =
    sumAB / pairs - (sumA / pairs) * (sumB / pairs);

  const denominator = Math.sqrt(
    Math.max(
      (sumA2 / pairs - (sumA / pairs) ** 2) *
      (sumB2 / pairs - (sumB / pairs) ** 2),
      1e-9
    )
  );

  if (covariance / denominator < 0.15) {
    return "noise";
  }

  return null;
}
