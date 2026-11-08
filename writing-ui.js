"use strict";

/* =========================================
   I FIND AI — AI WRITING DETECTION UI
   Version 1.0
   ========================================= */

(() => {
  function initialize() {
    const textarea = document.getElementById("writing-input");
    const counter = document.getElementById("character-count");
    const clearButton = document.getElementById("clear-writing");
    const analyzeButton = document.getElementById("analyze-writing");

    const status = document.getElementById("analysis-status");
    const statusMessage = document.getElementById("analysis-message");
    const spinner = status?.querySelector(".analysis-spinner");

    const results = document.getElementById("results-section");
    const resultsContent = document.getElementById("results-content");

    if (
      !textarea ||
      !analyzeButton ||
      !results ||
      !resultsContent
    ) {
      console.error("I FIND AI: Writing UI elements not found.");
      return;
    }

    const MAX_CHARACTERS = 10000;
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
      results.hidden = true;
    }

    function updateCounter() {
      const length = textarea.value.length;

      if (counter) {
        counter.textContent =
          length.toLocaleString() +
          " / " +
          MAX_CHARACTERS.toLocaleString();
      }

      analyzeButton.disabled =
        analyzing || !textarea.value.trim();
    }

    function addElement(parent, tag, text, className) {
      const element = document.createElement(tag);
      element.textContent = String(text);

      if (className) {
        element.className = className;
      }

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

    function formatPercentage(value) {
      if (!Number.isFinite(value)) {
        return "Unavailable";
      }

      return (value * 100).toFixed(1) + "%";
    }

    function displayReport(report) {
      clearResults();

      const card = document.createElement("div");
      card.className = "writing-analysis-report";

      addElement(
        card,
        "h3",
        "AI Writing Analysis Report"
      );

      addRow(card, "Words", report.wordCount);
      addRow(card, "Characters", report.characterCount);

      addRow(
        card,
        "Analyzed sections",
        report.analyzedChunks
      );

      const verdictLabels = {
        "likely-ai": "Likely AI-generated patterns",
        "likely-human": "Likely human-written patterns",
        "inconclusive": "Inconclusive"
      };

      const verdict = addElement(
        card,
        "h3",
        verdictLabels[report.verdict] || "Inconclusive",
        "writing-verdict"
      );

      verdict.setAttribute("role", "status");

      if (report.aiProbability !== null) {
        addRow(
          card,
          "AI probability",
          formatPercentage(report.aiProbability)
        );

        addRow(
          card,
          "Human probability",
          formatPercentage(report.humanProbability)
        );
      }

      if (report.model) {
        addRow(card, "Model", report.model);
      }

      addElement(
        card,
        "p",
        report.message || "Analysis completed.",
        "writing-analysis-note"
      );

      addElement(
        card,
        "p",
        "Important: This result is a statistical model estimate, not proof of who wrote the text. Human writing may be incorrectly flagged, and AI writing may be missed.",
        "writing-analysis-disclaimer"
      );

      resultsContent.appendChild(card);
      results.hidden = false;
    }

    async function analyzeWriting() {
      if (analyzing) return;

      const text = textarea.value.trim();

      if (!text) {
        showStatus("Please enter text to analyze.", false);
        return;
      }

      if (text.length > MAX_CHARACTERS) {
        showStatus("Text cannot exceed 10,000 characters.", false);
        return;
      }

      // The selected model is intended for English text.
      // Avoid presenting unsupported Telugu output as reliable.
      if (/[\u0C00-\u0C7F]/.test(text)) {
        clearResults();

        showStatus(
          "Telugu text detection is not supported by this model. Please use English text.",
          false
        );

        return;
      }

      const engine = window.IFindAIWritingEngine;

      if (!engine || typeof engine.analyze !== "function") {
        showStatus(
          "Writing detection engine could not load. Refresh and try again.",
          false
        );
        return;
      }

      analyzing = true;
      analyzeButton.disabled = true;
      analyzeButton.classList.add("loading");

      clearResults();

      try {
        showStatus("Preparing writing analysis...");

        const report = await engine.analyze(
          text,
          (progress) => {
            if (progress.stage === "model-loading") {
              showStatus("Loading AI writing detection model...");
            } else if (progress.stage === "model-download") {
              showStatus("Downloading model files...");
            } else if (progress.stage === "text-analysis") {
              showStatus(
                "Analyzing section " +
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

        results.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });

      } catch (error) {
        console.error(
          "I FIND AI Writing Analysis Error:",
          error
        );

        showStatus(
          error.message ||
          "Writing analysis failed. Please try again.",
          false
        );

      } finally {
        analyzing = false;
        analyzeButton.classList.remove("loading");
        updateCounter();
      }
    }

    textarea.maxLength = MAX_CHARACTERS;

    textarea.addEventListener("input", () => {
      updateCounter();
      hideStatus();
      clearResults();
    });

    if (clearButton) {
      clearButton.addEventListener("click", () => {
        textarea.value = "";
        updateCounter();
        hideStatus();
        clearResults();
        textarea.focus();
      });
    }

    analyzeButton.addEventListener(
      "click",
      analyzeWriting
    );

    updateCounter();

    console.info(
      "I FIND AI: Writing detection UI initialized."
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
