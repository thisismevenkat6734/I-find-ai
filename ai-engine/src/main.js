import {
  initializeDetector,
  analyzeImage
} from "./detector.js";

import { runEngineVerification } from "./verify.js";

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

    <button id="verify-button" type="button">
      Run Engine Verification
    </button>

    <p id="engine-status" role="status" aria-live="polite">
      Preparing detector...
    </p>

    <section id="verification-result" hidden>
      <h2>Verification Results</h2>
      <p id="verification-summary"></p>
      <ul id="verification-list"></ul>
    </section>

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
    verifyButton: document.getElementById("verify-button"),
    verification: document.getElementById("verification-result"),
    verificationSummary: document.getElementById("verification-summary"),
    verificationList: document.getElementById("verification-list"),
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
      ui.verifyButton.disabled = true;
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
        ui.verifyButton.disabled = false;
      }
    });

    ui.verifyButton.addEventListener("click", async () => {
      if (busy) return;

      busy = true;
      ui.verifyButton.disabled = true;
      ui.button.disabled = true;
      ui.verification.hidden = true;
      setStatus("Running engine verification...");

      try {
        const report = await runEngineVerification();

        ui.verification.hidden = false;
        ui.verificationSummary.textContent =
          `${report.passed} of ${report.total} checks passed.`;

        ui.verificationList.replaceChildren();

        for (const check of report.checks) {
          const item = document.createElement("li");
          item.textContent =
            `${check.passed ? "PASS" : "FAIL"} — ${check.name}: ${check.details}`;
          ui.verificationList.appendChild(item);
        }

        setStatus(
          report.success
            ? "Basic verification passed."
            : "Some verification checks failed."
        );
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Verification failed.");
      } finally {
        busy = false;
        ui.verifyButton.disabled = false;
        ui.button.disabled = !selectedFile;
      }
    });

    setStatus("Loading AI detection model...");
    await initializeDetector();
    setStatus("Detection engine is ready.");

  } catch (error) {
    console.error("Engine startup failed:", error);
    setStatus(error.message || "Engine initialization failed.");
  }
}

start();
