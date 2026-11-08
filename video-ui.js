"use strict";

(() => {
  const engine = window.IFindAIVideoEngine;

  if (!engine) {
    console.error("I FIND AI Video Engine is not loaded.");
    return;
  }

  const $ = (id) => document.getElementById(id);

  const input = $("video-file");
  const preview = $("video-preview");
  const player = $("video-preview-player");
  const fileName = $("video-file-name");
  const removeButton = $("remove-video");
  const analyzeButton = $("analyze-video");
  const uploadArea = $("video-upload-area");

  const status = $("analysis-status");
  const message = $("analysis-message");
  const results = $("results-section");
  const resultsContent = $("results-content");

  if (
    !input ||
    !preview ||
    !player ||
    !analyzeButton ||
    !status ||
    !results ||
    !resultsContent
  ) {
    console.error("Required video interface elements are missing.");
    return;
  }

  let selectedFile = null;
  let busy = false;
  let previewUrl = null;

  function setStatus(text, visible = true) {
    message.textContent = text;
    status.hidden = !visible;
  }

  function releasePreview() {
    player.pause();
    player.removeAttribute("src");
    player.load();

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
  }

  function clearResults() {
    results.hidden = true;
    resultsContent.replaceChildren();
  }

  function removeVideo() {
    if (busy) return;

    selectedFile = null;
    input.value = "";

    releasePreview();

    preview.hidden = true;
    uploadArea.hidden = false;
    analyzeButton.disabled = true;

    fileName.textContent = "";
    setStatus("", false);
    clearResults();
  }

  function selectVideo(file) {
    if (!file) return;

    try {
      engine.validateFile(file);

      selectedFile = file;

      releasePreview();

      previewUrl = URL.createObjectURL(file);
      player.src = previewUrl;

      fileName.textContent =
        `${file.name} (${(file.size / 1048576).toFixed(2)} MB)`;

      preview.hidden = false;
      uploadArea.hidden = true;

      analyzeButton.disabled = false;

      clearResults();
      setStatus("", false);

    } catch (error) {
      selectedFile = null;
      input.value = "";

      analyzeButton.disabled = true;
      setStatus(error.message);
    }
  }

  function addResult(title, value) {
    const item = document.createElement("p");
    const strong = document.createElement("strong");

    strong.textContent = `${title}: `;
    item.append(strong, document.createTextNode(String(value)));

    resultsContent.appendChild(item);
  }

  function displayReport(report) {
    resultsContent.replaceChildren();

    const heading = document.createElement("h3");
    heading.textContent = "Video Inspection Report";

    resultsContent.appendChild(heading);

    addResult("File", report.file.name);
    addResult("Duration", `${report.video.duration} seconds`);

    addResult(
      "Resolution",
      `${report.video.width} × ${report.video.height}`
    );

    addResult(
      "Frames inspected",
      report.analysis.extractedFrames
    );

    addResult(
      "Deepfake detection model",
      "Not connected"
    );

    const notice = document.createElement("p");
    notice.textContent = report.analysis.message;

    resultsContent.appendChild(notice);

    const warning = document.createElement("p");
    warning.textContent =
      "Frame extraction and image statistics do not prove whether a video is AI-generated or manipulated.";

    resultsContent.appendChild(warning);

    results.hidden = false;
  }

  input.addEventListener("change", () => {
    selectVideo(input.files?.[0]);
  });

  removeButton?.addEventListener("click", removeVideo);

  analyzeButton.addEventListener("click", async () => {
    if (!selectedFile || busy) return;

    busy = true;

    analyzeButton.disabled = true;
    input.disabled = true;

    clearResults();

    try {
      const report = await engine.analyze(
        selectedFile,
        (progress) => {
          if (progress.stage === "metadata") {
            setStatus("Reading video information...");
            return;
          }

          setStatus(
            `Extracting video frames: ${progress.completed}/${progress.total} (${progress.percentage}%)`
          );
        }
      );

      displayReport(report);
      setStatus("Video inspection completed.");

    } catch (error) {
      console.error("Video inspection failed:", error);
      setStatus(error.message || "Video inspection failed.");

    } finally {
      busy = false;

      input.disabled = false;
      analyzeButton.disabled = !selectedFile;
    }
  });

  window.addEventListener("beforeunload", () => {
    releasePreview();
  });

  console.info("I FIND AI Video UI initialized.");
})();
