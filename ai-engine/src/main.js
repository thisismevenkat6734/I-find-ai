import {
  initializeDetector,
  analyzeImage
} from "./detector.js";

const status = document.getElementById("engine-status");

let selectedFile = null;
let busy = false;

function setStatus(message) {
  if (status) status.textContent = message;
}

function createInterface() {
  const main = document.querySelector("main");

  if (!main) {
    throw new Error("Engine page content is missing.");
  }

  main.innerHTML = `
    <h1>I FIND AI</h1>
    <p>AI Image Detection Engine</p>

    <section>
      <label for="image-input">Choose an image</label>
      <input
        id="image-input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
      />

      <div id="selected-file" aria-live="polite">
        No image selected
      </div>

      <button id="analyze-button" type="button" disabled>
        Analyze Image
      </button>

      <p id="engine-status" role="status" aria-live="polite">
        Preparing detector...
      </p>

      <section id="analysis-result" hidden aria-live="polite">
        <h2>Analysis Result</h2>
        <p id="verdict"></p>
        <p id="confidence"></p>
        <p id="quality"></p>
        <p id="second-pass"></p>
        <p id="dimensions"></p>
        <p id="warning">
          AI detection is an estimate, not proof of image origin.
        </p>
      </section>
    </section>
  `;

  return {
    input: document.getElementById("image-input"),
    fileLabel: document.getElementById("selected-file"),
    button: document.getElementById("analyze-button"),
    status: document.getElementById("engine-status"),
    result: document.getElementById("analysis-result"),
    verdict: document.getElementById("verdict"),
    confidence: document.getElementById("confidence"),
    quality: document.getElementById("quality"),
    secondPass: document.getElementById("second-pass"),
    dimensions: document.getElementById("dimensions")
  };
}

function showResult(elements, result) {
  elements.result.hidden = false;

  if (!result.ok) {
    elements.verdict.textContent = result.message;
    elements.confidence.textContent = "";
    elements.quality.textContent = "";
    elements.secondPass.textContent = "";
    elements.dimensions.textContent = "";
    return;
  }

  const labels = {
    "ai-signals": "AI-generated signals detected",
    "real-signals": "Real-image signals detected",
    "inconclusive": "Inconclusive result"
  };

  elements.verdict.textContent =
    labels[result.verdict] || "Analysis completed";

  elements.confidence.textContent =
    `Model score: ${(result.score * 100).toFixed(1)}%`;

  elements.quality.textContent = result.degraded
    ? "Image quality warning: detection may be unreliable."
    : "No major degradation warning detected.";

  elements.secondPass.textContent =
    `Second analysis pass: ${result.secondPassUsed ? "Yes" : "No"}`;

  elements.dimensions.textContent =
    `Image size: ${result.dimensions.width} × ${result.dimensions.height}`;
}

async function start() {
  let elements;

  try {
    elements = createInterface();

    elements.input.addEventListener("change", () => {
      const file = elements.input.files?.[0] || null;

      selectedFile = file;

      elements.result.hidden = true;
      elements.button.disabled = !file || busy;

      elements.fileLabel.textContent = file
        ? `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`
        : "No image selected";
    });

    elements.button.addEventListener("click", async () => {
      if (!selectedFile || busy) return;

      busy = true;
      elements.button.disabled = true;
      elements.result.hidden = true;

      setStatus("Analyzing image. Please wait...");

      try {
        const result = await analyzeImage(selectedFile);

        showResult(elements, result);

        setStatus("Analysis completed.");
      } catch (error) {
        console.error("Image analysis failed:", error);
        setStatus(error.message || "Image analysis failed.");
      } finally {
        busy = false;
        elements.button.disabled = !selectedFile;
      }
    });

    setStatus("Loading AI detection model...");

    await initializeDetector();

    setStatus("AI detection engine is ready.");

  } catch (error) {
    console.error("Engine startup failed:", error);
    setStatus(error.message || "Engine initialization failed.");
  }
}

start();

