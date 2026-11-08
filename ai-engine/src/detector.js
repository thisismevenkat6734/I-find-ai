import * as ort from "onnxruntime-web";

const MANIFEST_URL = "./model/model-manifest.json";

let session = null;
let manifest = null;
let modelBytes = null;

const MODEL_PATH = "./model/sieve.onnx";

function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

async function sha256(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function loadManifest() {
  if (manifest) return manifest;

  const response = await fetch(MANIFEST_URL, {
    cache: "no-cache"
  });

  if (!response.ok) {
    throw new Error("Could not load model manifest.");
  }

  manifest = await response.json();

  const required = [
    "modelUrl",
    "sha256",
    "bias",
    "temperature",
    "threshold",
    "ttaBand"
  ];

  for (const key of required) {
    if (!(key in manifest)) {
      throw new Error(`Missing manifest field: ${key}`);
    }
  }

  return manifest;
}

async function loadModel() {
  if (session) return session;

  const config = await loadManifest();

  const response = await fetch(config.modelUrl || MODEL_PATH);

  if (!response.ok) {
    throw new Error("Could not download the AI detection model.");
  }

  modelBytes = await response.arrayBuffer();

  const actualHash = await sha256(modelBytes);

  if (actualHash.toLowerCase() !== config.sha256.toLowerCase()) {
    modelBytes = null;
    throw new Error("Model SHA-256 verification failed.");
  }

  ort.env.wasm.numThreads = Math.min(
    4,
    navigator.hardwareConcurrency || 1
  );

  ort.env.wasm.simd = true;

  const providers = [];

  if ("gpu" in navigator) {
    providers.push("webgpu");
  }

  providers.push("wasm");

  let lastError;

  for (const provider of providers) {
    try {
      session = await ort.InferenceSession.create(modelBytes, {
        executionProviders: [provider],
        graphOptimizationLevel: "all"
      });

      return session;
    } catch (error) {
      lastError = error;
      console.warn(`${provider} initialization failed:`, error);
    }
  }

  throw lastError || new Error("No supported inference provider.");
}

function createCanvas(image, crop = false) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", {
    willReadFrequently: true
  });

  const target = 384;

  let width = image.naturalWidth || image.width;
  let height = image.naturalHeight || image.height;

  if (!width || !height) {
    throw new Error("Invalid image dimensions.");
  }

  const scale = target / Math.min(width, height);

  let resizedWidth = Math.round(width * scale);
  let resizedHeight = Math.round(height * scale);

  if (crop) {
    resizedWidth = Math.max(target, resizedWidth);
    resizedHeight = Math.max(target, resizedHeight);
  }

  canvas.width = target;
  canvas.height = target;

  const x = Math.round((resizedWidth - target) / 2);
  const y = Math.round((resizedHeight - target) / 2);

  const temporary = document.createElement("canvas");
  temporary.width = resizedWidth;
  temporary.height = resizedHeight;

  const temporaryContext = temporary.getContext("2d", {
    willReadFrequently: true
  });

  temporaryContext.drawImage(
    image,
    0,
    0,
    resizedWidth,
    resizedHeight
  );

  context.drawImage(
    temporary,
    x,
    y,
    target,
    target,
    0,
    0,
    target,
    target
  );

  return context.getImageData(0, 0, target, target);
}

function imageToTensor(imageData) {
  const pixels = imageData.data;
  const size = 384 * 384;

  const tensorData = new Float32Array(3 * size);

  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];

  for (let i = 0; i < size; i++) {
    const offset = i * 4;

    tensorData[i] =
      (pixels[offset] / 255 - mean[0]) / std[0];

    tensorData[size + i] =
      (pixels[offset + 1] / 255 - mean[1]) / std[1];

    tensorData[2 * size + i] =
      (pixels[offset + 2] / 255 - mean[2]) / std[2];
  }

  return new ort.Tensor(
    "float32",
    tensorData,
    [1, 3, 384, 384]
  );
}

async function predict(imageData) {
  const model = await loadModel();

  const inputName = model.inputNames[0];
  const inputTensor = imageToTensor(imageData);

  const outputs = await model.run({
    [inputName]: inputTensor
  });

  const output = outputs[model.outputNames[0]];
  const config = await loadManifest();

  if (!output || !output.data.length) {
    throw new Error("Model returned an empty result.");
  }

  const rawLogit = Number(output.data[0]);

  if (!Number.isFinite(rawLogit)) {
    throw new Error("Model returned an invalid score.");
  }

  const calibratedLogit =
    rawLogit / config.temperature + config.bias;

  return {
    logit: calibratedLogit,
    score: sigmoid(calibratedLogit)
  };
}

async function decodeImage(file) {
  if (!file || !file.type.startsWith("image/")) {
    throw new Error("Please select a valid image.");
  }

  if (file.size > 15 * 1024 * 1024) {
    throw new Error("Image must be 15 MB or smaller.");
  }

  const bitmap = await createImageBitmap(file);

  try {
    if (Math.min(bitmap.width, bitmap.height) < 32) {
      throw new Error("Image is too small to analyze reliably.");
    }

    return {
      bitmap,
      width: bitmap.width,
      height: bitmap.height
    };
  } catch (error) {
    bitmap.close();
    throw error;
  }
}

export async function analyzeImage(file) {
  const decoded = await decodeImage(file);

  try {
    const config = await loadManifest();

    const firstView = createCanvas(decoded.bitmap);
    const firstPrediction = await predict(firstView);

    let finalLogit = firstPrediction.logit;
    let secondPassUsed = false;

    const low = config.ttaBand[0];
    const high = config.ttaBand[1];

    if (
      firstPrediction.score >= low &&
      firstPrediction.score <= high &&
      Math.min(decoded.width, decoded.height) >=
        (config.minSide || 384)
    ) {
      const nativeView = createCanvas(decoded.bitmap, true);
      const secondPrediction = await predict(nativeView);

      finalLogit =
        (firstPrediction.logit + secondPrediction.logit) / 2;

      secondPassUsed = true;
    }

    const finalScore = sigmoid(finalLogit);

    if (
      decoded.width < 32 ||
      decoded.height < 32
    ) {
      return {
        verdict: "not-analyzed",
        score: null,
        reason: "Image dimensions are insufficient."
      };
    }

    let verdict = "inconclusive";

    if (finalScore >= config.threshold) {
      verdict = "ai-signals";
    } else if (finalScore < config.negativeThreshold) {
      verdict = "real-signals";
    }

    return {
      verdict,
      score: finalScore,
      secondPassUsed,
      dimensions: {
        width: decoded.width,
        height: decoded.height
      },
      warning:
        "Model prediction is not proof of image origin."
    };

  } finally {
    decoded.bitmap.close();
  }
}

export async function initializeDetector() {
  await loadManifest();
  await loadModel();

  return {
    ready: true,
    providers: session.executionProviders || [],
    model: manifest.version || "unknown"
  };
}
