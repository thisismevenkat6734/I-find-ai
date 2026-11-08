"use strict";

(() => {
  const $ = (id) => document.getElementById(id);

  function initializeVideoUI() {
    const input = $("video-file");
    const preview = $("video-preview");
    const player = $("video-preview-player");
    const fileName = $("video-file-name");
    const removeButton = $("remove-video");
    const analyzeButton = $("analyze-video");
    const uploadArea = $("video-upload-area");

    const status = $("analysis-status");
    const statusMessage = $("analysis-message");
    const results = $("results-section");
    const resultsContent = $("results-content");

    if (!input || !analyzeButton) {
      console.error("I FIND AI: Video elements not found.");
      return;
    }

    const engine = window.IFindAIVideoEngine;
    let selectedFile = null;
    let previewUrl = null;
    let analyzing = false;

    analyzeButton.disabled = true;

    function showStatus(message) {
      if (status) {
        status.hidden = false;
        if (statusMessage) statusMessage.textContent = message;
      }
    }

    function hideStatus() {
      if (status) status.hidden = true;
    }

    function clearResults() {
      if (results) results.hidden = true;
      if (resultsContent) resultsContent.replaceChildren();
    }

    function showError(message) {
      showStatus(message);
      if (statusMessage) statusMessage.textContent = message;
    }

    function releasePreview() {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrl = null;
      }
    }

    function resetVideo() {
      selectedFile = null;
      analyzing = false;

      releasePreview();

      if (player) {
        player.pause();
        player.removeAttribute("src");
        player.load();
      }

      if (input) input.value = "";

      if (preview) preview.hidden = true;
      if (uploadArea) uploadArea.hidden = false;

      if (fileName) fileName.textContent = "";

      analyzeButton.disabled = true;
      analyzeButton.classList.remove("loading");

      hideStatus();
      clearResults();
    }

    function validateSelectedFile(file) {
      if (!file) {
        throw new Error("Please select a video.");
      }

      const allowedTypes = [
        "video/mp4",
        "video/webm",
        "video/quicktime",
        "video/x-m4v"
      ];

      const validExtension =
        /\.(mp4|webm|mov|m4v)$/i.test(file.name);

      if (!allowedTypes.includes(file.type) && !validExtension) {
        throw new Error("Please select MP4, WebM or MOV video.");
      }

      if (file.size === 0) {
        throw new Error("The selected video is empty.");
      }

      if (file.size > 100 * 1024 * 1024) {
        throw new Error("Video size must be 100 MB or less.");
      }

      if (engine && typeof engine.validateFile === "function") {
        engine.validateFile(file);
      }

      return true;
    }

    function handleFileSelection() {
      const file = input.files && input.files[0];

      if (!file) {
        resetVideo();
        return;
      }

      try {
        validateSelectedFile(file);

        releasePreview();

        selectedFile = file;
        previewUrl = URL.createObjectURL(file);

        if (player) {
          player.src = previewUrl;
          player.load();
        }

        if (fileName) {
          fileName.textContent =
            file.name + " (" +
            (file.size / (1024 * 1024)).toFixed(2) +
            " MB)";
        }

        if (preview) preview.hidden = false;
        if (uploadArea) uploadArea.hidden = true;

        clearResults();
        hideStatus();

        // Enable after other change handlers have completed.
        queueMicrotask(() => {
          if (selectedFile === file && !analyzing) {
            analyzeButton.disabled = false;
          }
        });

      } catch (error) {
        resetVideo();
        showError(error.message || "Unable to select this video.");
      }
    }

    function addResult(label, value) {
      const row = document.createElement("p");
      const heading = document.createElement("strong");

      heading.textContent = label + ": ";
      row.appendChild(heading);
      row.appendChild(document.createTextNode(String(value)));

      resultsContent.appendChild(row);
    }

    function displayReport(report) {
      if (!results || !resultsContent) return;

      resultsContent.replaceChildren();

      const heading = document.createElement("h3");
      heading.textContent = "Video Inspection Report";
      resultsContent.appendChild(heading);

      addResult("File", report.file.name);
      addResult("Duration", report.video.duration + " seconds");
      addResult(
        "Resolution",
        report.video.width + " × " + report.video.height
      );
      addResult("Frames inspected", report.analysis.extractedFrames);

      const notice = document.createElement("p");
      notice.textContent =
        "Frame extraction completed. An AI deepfake detection model " +
        "is not connected yet, so this report does not determine " +
        "whether the video is AI-generated or manipulated.";

      resultsContent.appendChild(notice);

      results.hidden = false;
    }

    async function analyzeVideo() {
      if (analyzing) return;

      if (!selectedFile) {
        showError("Please select a video first.");
        return;
      }

      if (!engine || typeof engine.analyze !== "function") {
        showError(
          "Video engine could not load. Please refresh the page and try again."
        );
        return;
      }

      analyzing = true;
      analyzeButton.disabled = true;
      analyzeButton.classList.add("loading");

      clearResults();

      try {
        showStatus("Preparing video analysis...");

        const report = await engine.analyze(
          selectedFile,
          (progress) => {
            if (!statusMessage) return;

            if (progress.stage === "metadata") {
              statusMessage.textContent = "Reading video information...";
            } else if (progress.stage === "frame-extraction") {
              statusMessage.textContent =
                "Inspecting frames: " +
                progress.completed + " / " +
                progress.total;
            }
          }
        );

        displayReport(report);
        showStatus(
          "Frame extraction completed. AI deepfake detection is not yet available."
        );

      } catch (error) {
        showError(error.message || "Video analysis failed.");

      } finally {
        analyzing = false;
        analyzeButton.disabled = !selectedFile;
        analyzeButton.classList.remove("loading");
      }
    }

    input.addEventListener("change", handleFileSelection, true);

    analyzeButton.addEventListener("click", analyzeVideo);

    if (removeButton) {
      removeButton.addEventListener("click", resetVideo);
    }

    window.addEventListener("beforeunload", releasePreview);

    console.log("I FIND AI Video UI initialized.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeVideoUI, {
      once: true
    });
  } else {
    initializeVideoUI();
  }
})();
