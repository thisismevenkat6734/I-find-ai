import * as ort from "onnxruntime-web";

import {
  preprocessImage,
  preprocessFit,
  preprocessNative,
  degradationStats,
  degenerateReason
} from "./preprocess.js";

const MANIFEST_URL = `${import.meta.env.BASE_URL}model/model-manifest.json`;

let manifestPromise;
let sessionPromise;

async function getManifest() {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      const response = await fetch(MANIFEST_URL, {
        cache: "no-cache"
      });

      if (!response.ok) {
        throw new Error("Model manifest could not be loaded.");
      }

      return response.json();
    })().catch((error) => {
      manifestPromise = null;
      throw error;
    });
  }

  return manifestPromise;
}

async function sha256(buffer) {
  const hash = await crypto.subtle.digest("SHA-256", buffer);

  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function getSession() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const meta = await getManifest();

      const response = await fetch(meta.model_url);

      if (!response.ok) {
        throw new Error("AI model download failed.");
      }

      const buffer = await response.arrayBuffer();
      const actualHash = await sha256(buffer);

      if (actualHash !== meta.sha256.toLowerCase()) {
        throw new Error("AI model integrity verification failed.");
      }

      ort.env.wasm.numThreads = 1;

      let lastError;

      for (const provider of ["webgpu", "wasm"]) {
        try {
          return await ort.InferenceSession.create(buffer, {
            executionProviders: [provider],
            graphOptimizationLevel: "all"
          });
        } catch (error) {
          lastError = error;
          console.warn(`${provider} unavailable:`, error);
        }
      }

      throw lastError || new Error("No inference backend available.");
    })().catch((error) => {
      sessionPromise = null;
      throw error;
    });
  }

  return sessionPromise;
}

function calibrate(logit, meta) {
  const config = meta.calibration || {};
  const temperature = config.temperature || 1;
  const bias = config.bias || 0;

  const value = logit / temperature + bias;

  return 1 / (1 + Math.exp(-value));
}

async function decodeImage(file) {
  if (!(file instanceof Blob) || !file.type.startsWith("image/")) {
    throw new Error("Please select a supported image.");
  }

  if (file.size > 15 * 1024 * 1024) {
    throw new Error("Image size must be 15 MB or less.");
  }

  const bitmap = await createImageBitmap(file);

  try {
    const canvas = document.createElement("canvas");

    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const context = canvas.getContext("2d", {
      willReadFrequently: true
    });

    if (!context) {
      throw new Error("Image processing is unavailable.");
    }

    context.drawImage(bitmap, 0, 0);

    const image = context.getImageData(
      0,
      0,
      bitmap.width,
      bitmap.height
    );

    return {
      data: image.data,
      width: bitmap.width,
      height: bitmap.height
    };
  } finally {
    bitmap.close();
  }
}

async function runInference(session, tensor) {
  const inputName = session.inputNames[0];

  const output = await session.run({
    [inputName]: tensor
  });

  const result = output[session.outputNames[0]];

  if (!result || !result.data.length) {
    throw new Error("The model returned no prediction.");
  }

  const logit = Number(result.data[0]);

  if (!Number.isFinite(logit)) {
    throw new Error("The model returned an invalid prediction.");
  }

  return logit;
}

export async function initializeDetector() {
  const [meta, session] = await Promise.all([
    getManifest(),
    getSession()
  ]);

  return {
    ready: true,
    version: meta.version,
    inputSize: meta.input_size,
    providers: session.executionProviders || []
  };
}

export async function analyzeImage(file) {
  const [meta, session] = await Promise.all([
    getManifest(),
    getSession()
  ]);

  const image = await decodeImage(file);

  if (image.width < 32 || image.height < 32) {
    return {
      ok: false,
      reason: "too-small",
      message: "Image is too small to analyze reliably."
    };
  }

  const degenerate = degenerateReason(image);

  if (degenerate) {
    return {
      ok: false,
      reason: `degenerate-${degenerate}`,
      message: "This image cannot be analyzed reliably."
    };
  }

  const quality = degradationStats(image);

  const degraded =
    quality.block >= 1.8 ||
    quality.d12 < 0.528;

  const standardTensor = preprocessImage(image, meta);

  const firstLogit = await runInference(
    session,
    standardTensor
  );

  const firstScore = calibrate(firstLogit, meta);

  const tta = meta.tta || {};

  let finalLogit = firstLogit;
  let secondPassUsed = false;

  const largeImage =
    Math.min(image.width, image.height) >=
    (tta.min_side || meta.input_size);

  if (
    tta.enabled &&
    firstScore >= tta.band_lo &&
    firstScore <= tta.band_hi
  ) {
    const secondTensor = largeImage
      ? preprocessNative(image, meta)
      : preprocessFit(image, meta);

    const secondLogit = await runInference(
      session,
      secondTensor
    );

    finalLogit = (firstLogit + secondLogit) / 2;
    secondPassUsed = true;
  }

  const score = calibrate(finalLogit, meta);

  let verdict = "real-signals";

  if (degraded) {
    verdict = "inconclusive";
  } else if (score >= 0.65) {
    verdict = "ai-signals";
  } else if (score >= 0.25) {
    verdict = "inconclusive";
  }

  return {
    ok: true,
    verdict,
    score,
    degraded,
    secondPassUsed,
    dimensions: {
      width: image.width,
      height: image.height
    },
    quality: {
      block: Number(quality.block.toFixed(3)),
      d12: Number(quality.d12.toFixed(4))
    },
    warning:
      "This is an AI-image detection estimate, not proof of image origin."
  };
}
