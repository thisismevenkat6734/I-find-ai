import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2";

const MODEL_ID = "onnx-community/ai-image-detection-ONNX";

env.allowLocalModels = false;
env.useBrowserCache = true;

let detector = null;
let loadingPromise = null;

const elements = {
  input: document.querySelector("#image-upload"),
  button: document.querySelector("#image-analyze-btn"),
  result: document.querySelector("#analysis-results")
};

function showMessage(message) {
  if (elements.result) {
    elements.result.textContent = message;
  }
}

function getVerdict(predictions) {
  const ai = predictions.find(item =>
    /fake|artificial|ai.generated|synthetic/i.test(item.label)
  );

  const real = predictions.find(item =>
    /real|human|authentic/i.test(item.label)
  );

  if (!ai || !real) {
    throw new Error("Model labels could not be identified.");
  }

  return {
    aiScore: ai.score,
    realScore: real.score,
    verdict: ai.score >= real.score ? "AI-generated signals" : "Real-image signals"
  };
}

async function loadDetector() {
  if (detector) return detector;

  if (!loadingPromise) {
    loadingPromise = pipeline(
      "image-classification",
      MODEL_ID,
      {
        device: "wasm",
        dtype: "q8"
      }
    );
  }

  try {
    detector = await loadingPromise;
    return detector;
  } catch (error) {
    loadingPromise = null;
    throw error;
  }
}

async function analyzeImage(file) {
  if (!(file instanceof File) || !file.type.startsWith("image/")) {
    throw new Error("Please select a valid image.");
  }

  const maxSize = 15 * 1024 * 1024;

  if (file.size > maxSize) {
    throw new Error("Image size must be below 15 MB.");
  }

  showMessage("Loading AI detection model... First download may take time.");

  const model = await loadDetector();

  showMessage("Analyzing image on your device...");

  const imageURL = URL.createObjectURL(file);

  try {
    const predictions = await model(imageURL);
    const result = getVerdict(predictions);

    return result;
  } finally {
    URL.revokeObjectURL(imageURL);
  }
}

function displayResult(result) {
  if (!elements.result) return;

  const aiPercent = (result.aiScore * 100).toFixed(1);
  const realPercent = (result.realScore * 100).toFixed(1);

  elements.result.replaceChildren();

  const heading = document.createElement("h3");
  heading.textContent = result.verdict;

  const ai = document.createElement("p");
  ai.textContent = `AI-generated score: ${aiPercent}%`;

  const real = document.createElement("p");
  real.textContent = `Real-image score: ${realPercent}%`;

  const note = document.createElement("p");
  note.textContent =
    "This is a model prediction, not proof of image origin. Results can be wrong, especially for edited, compressed, or unfamiliar images.";

  elements.result.append(heading, ai, real, note);
}

async function handleAnalysis() {
  const file = elements.input?.files?.[0];

  if (!file) {
    showMessage("Please select an image first.");
    return;
  }

  if (elements.button) {
    elements.button.disabled = true;
    elements.button.textContent = "Analyzing...";
  }

  try {
    const result = await analyzeImage(file);
    displayResult(result);
  } catch (error) {
    console.error("I FIND AI image engine:", error);
    showMessage(`Analysis failed: ${error.message}`);
  } finally {
    if (elements.button) {
      elements.button.disabled = false;
      elements.button.textContent = "Analyze Image";
    }
  }
}

if (elements.button) {
  elements.button.addEventListener("click", handleAnalysis);
}

window.IFindAIImageEngine = {
  analyzeImage,
  loadDetector
};

console.info("I FIND AI image engine initialized.");
