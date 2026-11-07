import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2";

const MODEL_ID = "onnx-community/ai-image-detection-ONNX";
const MAX_IMAGE_SIZE = 15 * 1024 * 1024;

env.allowLocalModels = false;
env.useBrowserCache = true;

const input = document.getElementById("image-file");
const analyzeButton = document.getElementById("analyze-image");
const statusBox = document.getElementById("analysis-status");
const statusMessage = document.getElementById("analysis-message");
const resultsSection = document.getElementById("results-section");
const resultsContent = document.getElementById("results-content");

let detector = null;
let loadingPromise = null;

function setStatus(message, visible = true) {
  if (!statusBox || !statusMessage) return;

  statusMessage.textContent = message;
  statusBox.hidden = !visible;
}

function clearResults() {
  if (resultsContent) {
    resultsContent.replaceChildren();
  }

  if (resultsSection) {
    resultsSection.hidden = true;
  }
}

function createDetector() {
  if (detector) {
    return Promise.resolve(detector);
  }

  if (!loadingPromise) {
    loadingPromise = pipeline(
      "image-classification",
      MODEL_ID,
      {
        device: "wasm",
        dtype: "q4",
        progress_callback: (progress) => {
          if (progress.status === "progress" && progress.progress != null) {
            setStatus(
              `Downloading AI model: ${Math.round(progress.progress)}%`
            );
          } else if (progress.status === "downloading") {
            setStatus("Downloading AI detection model...");
          } else if (progress.status === "ready") {
            setStatus("AI model is ready. Preparing image...");
          }
        }
      }
    );
  }

  return loadingPromise
    .then((model) => {
      detector = model;
      return detector;
    })
    .catch((error) => {
      loadingPromise = null;
      throw error;
    });
}

function getScores(predictions) {
  const fakeResult = predictions.find((item) =>
    item.label.toLowerCase().includes("fake")
  );

  const realResult = predictions.find((item) =>
    item.label.toLowerCase().includes("real")
  );

  if (!fakeResult || !realResult) {
    throw new Error("The model returned unexpected classification labels.");
  }

  return {
    fakeScore: fakeResult.score,
    realScore: realResult.score
  };
}

function addResultLine(parent, label, value) {
  const paragraph = document.createElement("p");
  const strong = document.createElement("strong");

  strong.textContent = `${label}: `;
  paragraph.append(strong, document.createTextNode(value));
  parent.appendChild(paragraph);
}

function displayResults(scores) {
  if (!resultsSection || !resultsContent) {
    throw new Error("Results section was not found in index.html.");
  }

  resultsContent.replaceChildren();

  const heading = document.createElement("h3");
  const fakePercent = (scores.fakeScore * 100).toFixed(1);
  const realPercent = (scores.realScore * 100).toFixed(1);

  heading.textContent =
    scores.fakeScore >= scores.realScore
      ? "AI-generated signals detected"
      : "Real-image signals detected";

  const explanation = document.createElement("p");
  explanation.textContent =
    "The model's strongest classification is shown below. This is an automated prediction, not proof of image origin.";

  const details = document.createElement("div");
  details.className = "image-analysis-details";

  addResultLine(details, "AI-generated model score", `${fakePercent}%`);
  addResultLine(details, "Real-image model score", `${realPercent}%`);

  const warning = document.createElement("p");
  warning.className = "analysis-disclaimer";
  warning.textContent =
    "Important: These scores are model outputs, not guaranteed probabilities. The model was trained on CIFAKE data and may perform differently on newer AI generators, edited images, screenshots and compressed images.";

  resultsContent.append(heading, explanation, details, warning);
  resultsSection.hidden = false;
}

async function analyzeSelectedImage() {
  const file = input?.files?.[0];

  if (!file) {
    setStatus("Please choose an image first.");
    return;
  }

  if (!file.type.startsWith("image/")) {
    setStatus("Please select a valid image file.");
    return;
  }

  if (file.size > MAX_IMAGE_SIZE) {
    setStatus("Image size must be 15 MB or smaller.");
    return;
  }

  clearResults();

  if (analyzeButton) {
    analyzeButton.disabled = true;
    analyzeButton.textContent = "Analyzing...";
  }

  let imageURL = null;

  try {
    setStatus("Loading AI detection model...");

    const model = await createDetector();

    setStatus("Analyzing your image on this device...");

    imageURL = URL.createObjectURL(file);

    const predictions = await model(imageURL);
    const scores = getScores(predictions);

    displayResults(scores);
    setStatus("Image analysis completed.", false);

  } catch (error) {
    console.error("I FIND AI image analysis error:", error);

    setStatus(
      error.message || "Something went wrong. Please try again."
    );

  } finally {
    if (imageURL) {
      URL.revokeObjectURL(imageURL);
    }

    if (analyzeButton) {
      analyzeButton.disabled = !input?.files?.length;
      analyzeButton.innerHTML = 'Analyze Image <span>→</span>';
    }
  }
}

if (analyzeButton) {
  analyzeButton.addEventListener("click", analyzeSelectedImage);
}

if (input) {
  input.addEventListener("change", () => {
    clearResults();
    setStatus("", false);

    if (analyzeButton) {
      analyzeButton.disabled = !input.files?.length;
    }
  });
}

console.info("I FIND AI image detector engine initialized.");
