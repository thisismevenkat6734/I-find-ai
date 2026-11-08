import * as ort from "onnxruntime-web";

const status = document.getElementById("engine-status");

async function initializeEngine() {
  try {
    status.textContent = "Checking ONNX Runtime...";

    if (!ort.InferenceSession) {
      throw new Error("ONNX Runtime is unavailable.");
    }

    status.textContent =
      "ONNX Runtime loaded successfully. AI model is not connected yet.";

    console.info("I FIND AI ONNX Runtime initialized.", ort.env);

  } catch (error) {
    console.error("Engine initialization failed:", error);
    status.textContent = `Engine initialization failed: ${error.message}`;
  }
}

initializeEngine();
