"use strict";

/* =========================================
   I FIND AI — VIDEO DEEPFAKE UI
   Version: 2.0
   Connects to IFindAIVideoEngine
   ========================================= */

(() => {
  const $ = (id) => document.getElementById(id);

  function initialize() {
    const input = $("video-file");
    const analyzeButton = $("analyze-video");
    const status = $("analysis-status");
    const statusMessage = $("analysis-message");
    const results = $("results-section");
    const resultsContent = $("results-content");

    if (!input || !analyzeButton) {
      console.error("I FIND AI: Video UI elements not found.");
      return;
    }

    let analyzing = false;

    function showStatus(message) {
      if (status) status.hidden = false;
      if (statusMessage) statusMessage.textContent = message;
    }

    function hideStatus() {
      if (status) status.hidden = true;
    }

    function clearResults() {
      if (results) results.hidden = true;
      if (resultsContent) resultsContent.replaceChildren();
    }

    function addElement(parent, tag, text, className) {
      const element = document.createElement(tag);
      element.textContent = text;

      if (className) element.className = className;

      parent.appendChild(element);
      return element;
    }

    function addRow(parent, label, value) {
      const row = document.createElement("p");
      const strong = document.createElement("strong");

      strong.textContent = label + ": ";
      row.appendChild(strong);
      row.appendChild(
        document.createTextNode(String(value))
      );

      parent.appendChild(row);
    }

    function formatPercent(value) {
      if (!Number.isFinite(value)) return "Unavailable";
      return (value * 100).toFixed(1) + "%";
    }

    function displayReport(report) {
      if (!results || !resultsContent) return;

      resultsContent.replaceChildren();

      const analysis = report.analysis;
      const verdict = analysis.verdict;

      addElement(
        resultsContent,
        "h3",
        "Deepfake Analysis Report"
      );

      addRow("File", report.file.name);
      addRow("Duration", report.video.duration + " seconds");
      addRow(
        "Resolution",
        report.video.width + " × " + report.video.height
      );
      addRow("Frames inspected", analysis.extractedFrames);
      addRow("Frames analyzed", analysis.analyzedFrames);

      const verdictLabels = {
        "deepfake-like-signals": "Deepfake-like signals detected",
        "real-like-signals": "Real-like signals detected",
        "inconclusive": "Inconclusive"
      };

      const verdictElement = addElement(
        resultsContent,
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
      addRow("Analysis type", "Frame-level screening");

      const explanation = addElement(
        resultsContent,
        "p",
        analysis.message
      );

      explanation.className = "video-analysis-note";

      const disclaimer = addElement(
        resultsContent,
        "p",
        "This is an experimental frame-level model result, not proof of authenticity. The model's labels and performance must be validated on representative videos before relying on its verdict."
      );

      disclaimer.className = "video-analysis-disclaimer";

      const frameHeading = addElement(
        resultsContent,
        "h3",
        "Frame-by-frame results"
      );

      frameHeading.className = "video-frame-heading";

      const list = document.createElement("div");
      list.className = "video-frame-results";

      report.frames.forEach((frame) => {
        const card = document.createElement("article");
        card.className = "video-frame-result";

        addElement(
          card,
          "strong",
          "Frame " + frame.frameNumber
        );

        addRow(
          card,
          "Timestamp",
          frame.timestamp + " seconds"
        );

        addRow(
          card,
          "Result",
          frame.status || "Inconclusive"
        );

        if (frame.fakeScore !== null) {
          addRow(
            card,
            "Fake score",
            formatPercent(frame.fakeScore)
          );
        }

        list.appendChild(card);
      });

      resultsContent.appendChild(list);

      results.hidden = false;
    }

    async function analyzeVideo() {
      if (analyzing) return;

      const file = input.files && input.files[0];

      if (!file) {
        showStatus("Please select a video first.");
        return;
      }

      const engine = window.IFindAIVideoEngine;

      if (!engine || typeof engine.analyze !== "function") {
        showStatus(
          "Video detection engine could not load. Refresh the page and try again."
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
            } else if (progress.stage === "metadata") {
              showStatus("Reading video information...");
            } else if (progress.stage === "frame-extraction") {
              showStatus("Extracting video frames...");
            } else if (progress.stage === "frame-analysis") {
              showStatus(
                "Analyzing frame " +
                progress.completed +
                " of " +
                progress.total +
                "..."
              );
            } else if (progress.stage === "completed") {
              showStatus("Analysis completed. Preparing report...");
            }
          }
        );

        displayReport(report);

        // Hide spinner/status after successful completion.
        hideStatus();

        results?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });

      } catch (error) {
        console.error("I FIND AI Video Analysis Error:", error);

        showStatus(
          error.message || "Video analysis failed. Please try again."
        );

      } finally {
        analyzing = false;
        analyzeButton.disabled = !(
          input.files && input.files.length
        );
        analyzeButton.classList.remove("loading");
      }
    }

    analyzeButton.addEventListener("click", analyzeVideo);

    console.info("I FIND AI Video Analysis UI initialized.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, {
      once: true
    });
  } else {
    initialize();
  }
})();
