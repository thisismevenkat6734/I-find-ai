"use strict";

/* =========================================
   I FIND AI — VIDEO DEEPFAKE UI
   Version 2.1 — Report Rendering Fix
   ========================================= */

(() => {
  const $ = (id) => document.getElementById(id);

  function initialize() {
    const input = $("video-file");
    const analyzeButton = $("analyze-video");
    const status = $("analysis-status");
    const statusMessage = $("analysis-message");
    const spinner = status?.querySelector(".analysis-spinner");
    const results = $("results-section");
    const resultsContent = $("results-content");

    if (!input || !analyzeButton || !resultsContent) {
      console.error("I FIND AI: Video UI elements not found.");
      return;
    }

    let analyzing = false;

    function showStatus(message, loading = true) {
      if (status) status.hidden = false;

      if (statusMessage) {
        statusMessage.textContent = message;
      }

      if (spinner) {
        spinner.hidden = !loading;
      }
    }

    function hideStatus() {
      if (status) status.hidden = true;
      if (spinner) spinner.hidden = false;
    }

    function clearResults() {
      resultsContent.replaceChildren();

      if (results) {
        results.hidden = true;
      }
    }

    function addElement(tag, text, className) {
      const element = document.createElement(tag);
      element.textContent = String(text);

      if (className) {
        element.className = className;
      }

      resultsContent.appendChild(element);
      return element;
    }

    function addRow(label, value) {
      const row = document.createElement("p");
      const strong = document.createElement("strong");

      strong.textContent = label + ": ";

      row.appendChild(strong);
      row.appendChild(
        document.createTextNode(String(value))
      );

      resultsContent.appendChild(row);
    }

    function formatPercent(value) {
      if (!Number.isFinite(value)) {
        return "Unavailable";
      }

      return (value * 100).toFixed(1) + "%";
    }

    function displayReport(report) {
      const analysis = report.analysis;
      const verdict = analysis.verdict;

      clearResults();

      addElement(
        "h3",
        "Deepfake Analysis Report"
      );

      addRow("File", report.file.name);

      addRow(
        "Duration",
        report.video.duration + " seconds"
      );

      addRow(
        "Resolution",
        report.video.width + " × " + report.video.height
      );

      addRow(
        "Frames extracted",
        analysis.extractedFrames
      );

      addRow(
        "Frames analyzed",
        analysis.analyzedFrames
      );

      const verdictLabels = {
        "deepfake-like-signals":
          "Deepfake-like signals detected",

        "real-like-signals":
          "Real-like signals detected",

        "inconclusive":
          "Inconclusive"
      };

      const verdictElement = addElement(
        "h3",
        verdictLabels[verdict] || "Inconclusive",
        "video-verdict"
      );

      verdictElement.setAttribute("role", "status");

      if (analysis.averageFakeScore !== null) {
        addRow(
          "Average model fake score",
          formatPercent(analysis.averageFakeScore)
        );
      }

      addRow("Model", analysis.model);
      addRow("Quantization", analysis.quantization || "Q4");
      addRow("Analysis type", "Frame-level screening");

      addElement(
        "p",
        analysis.message,
        "video-analysis-note"
      );

      addElement(
        "p",
        "Important: This experimental image classifier examines selected video frames. It is not a validated temporal deepfake detector, and its score is not proof that a video is real or fake.",
        "video-analysis-disclaimer"
      );

      addElement(
        "h3",
        "Frame-by-frame results",
        "video-frame-heading"
      );

      const list = document.createElement("div");
      list.className = "video-frame-results";

      (report.frames || []).forEach((frame) => {
        const card = document.createElement("article");
        card.className = "video-frame-result";

        const heading = document.createElement("strong");
        heading.textContent = "Frame " + frame.frameNumber;
        card.appendChild(heading);

        const timestamp = document.createElement("p");
        timestamp.textContent =
          "Timestamp: " + frame.timestamp + " seconds";
        card.appendChild(timestamp);

        const result = document.createElement("p");
        result.textContent =
          "Result: " + (frame.status || "Inconclusive");
        card.appendChild(result);

        if (frame.fakeScore !== null) {
          const score = document.createElement("p");
          score.textContent =
            "Fake score: " + formatPercent(frame.fakeScore);
          card.appendChild(score);
        }

        list.appendChild(card);
      });

      resultsContent.appendChild(list);

      if (results) {
        results.hidden = false;
      }
    }

    async function analyzeVideo() {
      if (analyzing) return;

      const file = input.files && input.files[0];

      if (!file) {
        showStatus("Please select a video first.", false);
        return;
      }

      const engine = window.IFindAIVideoEngine;

      if (!engine || typeof engine.analyze !== "function") {
        showStatus(
          "Video detection engine could not load. Refresh the page and try again.",
          false
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
          file,
          (progress) => {
            if (progress.stage === "model-loading") {
              showStatus("Loading deepfake detection model...");
            } else if (progress.stage === "model-download") {
              showStatus("Downloading model files...");
            } else if (progress.stage === "frame-analysis") {
              showStatus(
                "Analyzing frame " +
                progress.completed +
                " of " +
                progress.total + "..."
              );
            } else if (progress.stage === "completed") {
              showStatus("Analysis completed. Preparing report...");
            }
          }
        );

        displayReport(report);
        hideStatus();

        if (results) {
          results.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        }

      } catch (error) {
        console.error(
          "I FIND AI Video Analysis Error:",
          error
        );

        showStatus(
          error.message || "Video analysis failed. Please try again.",
          false
        );

      } finally {
        analyzing = false;

        analyzeButton.disabled = !(
          input.files && input.files.length
        );

        analyzeButton.classList.remove("loading");
      }
    }

    analyzeButton.addEventListener(
      "click",
      analyzeVideo
    );

    console.info(
      "I FIND AI Video UI initialized successfully."
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initialize,
      { once: true }
    );
  } else {
    initialize();
  }
})();
