import {
  initializeDetector,
  analyzeImage
} from "./detector.js";

let selectedFile = null;
let busy = false;

function setStatus(message) {
  const element = document.getElementById("engine-status");
  if (element) element.textContent = message;
}

function createInterface() {
  const main = document.querySelector("main");

  if (!main) throw new Error("Engine page content is missing.");

  main.innerHTML = `
    <h1>I FIND AI</h1>
    <p>AI Image Detection Engine</p>

    <label for="image-input">Choose an image</label>
    <input id="image-input" type="file"
      accept="image/jpeg,image/png,image/webp">

    <p id="selected-file">No image selected</p>

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
      <p>Detection is an estimate, not proof of image origin.</p>
    </section>
  `;

  return {
    input: document.getElementById("image-input"),
    fileLabel: document.getElementById("selected-file"),
    button: document.getElementById("analyze-button"),
    result: document.getElementById("analysis-result"),
    verdict: document.getElementById("verdict"),
    confidence: document.getElementById("confidence"),
    quality: document.getElementById("quality"),
    secondPass: document.getElementById("second-pass"),
    dimensions: document.getElementById("dimensions")
  };
}

function showResult(ui, result) {
  ui.result.hidden = false;

  if (!result.ok) {
    ui.verdict.textContent = result.message;
    ui.confidence.textContent = "";
    ui.quality.textContent = "";
    ui.secondPass.textContent = "";
    ui.dimensions.textContent = "";
    return;
  }

  const labels = {
    "ai-signals": "AI-generated signals detected",
    "real-signals": "Real-image signals detected",
    "inconclusive": "Inconclusive result"
  };

  ui.verdict.textContent =
    labels[result.verdict] || "Analysis completed";

  ui.confidence.textContent =
    `Model score: ${(result.score * 100).toFixed(1)}%`;

  ui.quality.textContent = result.degraded
    ? "Image quality warning: result may be unreliable."
    : "No major degradation warning detected.";

  ui.secondPass.textContent =
    `Second analysis pass: ${result.secondPassUsed ? "Yes" : "No"}`;

  ui.dimensions.textContent =
    `Image dimensions: ${result.dimensions.width} × ${result.dimensions.height}`;
}

async function start() {
  try {
    const ui = createInterface();

    ui.input.addEventListener("change", () => {
      selectedFile = ui.input.files?.[0] || null;
      ui.result.hidden = true;
      ui.button.disabled = !selectedFile || busy;

      ui.fileLabel.textContent = selectedFile
        ? `${selectedFile.name} (${(selectedFile.size / 1048576).toFixed(2)} MB)`
        : "No image selected";
    });

    ui.button.addEventListener("click", async () => {
      if (!selectedFile || busy) return;

      busy = true;
      ui.button.disabled = true;
      ui.result.hidden = true;
      setStatus("Analyzing image...");

      try {
        const result = await analyzeImage(selectedFile);
        showResult(ui, result);
        setStatus("Analysis completed.");
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Analysis failed.");
      } finally {
        busy = false;
        ui.button.disabled = !selectedFile;
      }
    });

    setStatus("Loading detection model...");
    await initializeDetector();
    setStatus("Detection engine is ready.");

  } catch (error) {
    console.error("Engine startup failed:", error);
    setStatus(error.message || "Engine initialization failed.");
  }
}

start();
