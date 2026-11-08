import { initializeDetector, analyzeImage } from "./detector.js";

export async function runEngineVerification() {
  const checks = [];

  function record(name, passed, details = "") {
    checks.push({ name, passed, details });
  }

  try {
    const engine = await initializeDetector();

    record(
      "Model initialization",
      engine.ready === true,
      engine.version || "Unknown model version"
    );

    record(
      "Model input size",
      engine.inputSize === 384,
      `Input size: ${engine.inputSize}`
    );

    record(
      "Inference backend",
      Array.isArray(engine.providers) && engine.providers.length > 0,
      (engine.providers || []).join(", ")
    );

    const testCanvas = document.createElement("canvas");
    testCanvas.width = 512;
    testCanvas.height = 512;

    const context = testCanvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas is unavailable.");
    }

    context.fillStyle = "#808080";
    context.fillRect(0, 0, 512, 512);

    const testBlob = await new Promise((resolve) => {
      testCanvas.toBlob(resolve, "image/png");
    });

    if (!testBlob) {
      throw new Error("Test image creation failed.");
    }

    const result = await analyzeImage(testBlob);

    record(
      "Image analysis",
      typeof result.ok === "boolean",
      result.verdict || result.reason || "Analysis returned"
    );

    record(
      "Result safety",
      typeof result.warning === "string" ||
      result.ok === false,
      "Uncertainty handling checked"
    );

  } catch (error) {
    record("Engine verification", false, error.message);
  }

  const passed = checks.filter((item) => item.passed).length;

  return {
    success: checks.every((item) => item.passed),
    passed,
    total: checks.length,
    checks
  };
}
