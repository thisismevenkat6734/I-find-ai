"use strict";

/* =========================================
   I FIND AI — AI WRITING DETECTION ENGINE
   Model: GPTTrace Ettin-150M v3
   License: MIT
   Runtime: Transformers.js / ONNX
   Browser-local processing
   ========================================= */

const WritingEngine = (() => {
  const CONFIG = Object.freeze({
    model: "nakas/gpttrace-ettin150-text-v3",
    maxCharacters: 10000,
    minWords: 150,
    chunkWords: 300,
    overlapWords: 30
  });

  let classifierPromise = null;
  let cancelled = false;

  function normalizeText(text) {
    return String(text)
      .normalize("NFKC")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  function countWords(text) {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  function splitIntoChunks(text) {
    const words = text.split(/\s+/).filter(Boolean);
    const chunks = [];

    const chunkSize = CONFIG.chunkWords;
    const overlap = CONFIG.overlapWords;
    const step = chunkSize - overlap;

    for (let start = 0; start < words.length; start += step) {
      const part = words.slice(start, start + chunkSize);

      if (!part.length) break;

      chunks.push({
        text: part.join(" "),
        wordCount: part.length
      });

      if (start + chunkSize >= words.length) break;
    }

    return chunks;
  }

  async function loadClassifier(onProgress) {
    if (!classifierPromise) {
      classifierPromise = (async () => {
        if (typeof onProgress === "function") {
          onProgress({
            stage: "model-loading",
            message: "Loading AI writing detection model..."
          });
        }

        const { pipeline, env } = await import(
          "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2"
        );

        env.allowRemoteModels = true;

        const classifier = await pipeline(
          "text-classification",
          CONFIG.model,
          {
            device: "wasm",
            progress_callback: (progress) => {
              if (typeof onProgress === "function") {
                onProgress({
                  stage: "model-download",
                  progress
                });
              }
            }
          }
        );

        return classifier;
      })().catch((error) => {
        classifierPromise = null;

        console.error(
          "I FIND AI writing model loading error:",
          error
        );

        throw new Error(
          "AI writing model could not load: " +
          (error?.message || String(error))
        );
      });
    }

    return classifierPromise;
  }

  function getAIProbability(output) {
    const predictions = Array.isArray(output)
      ? output
      : [output];

    if (!predictions.length) {
      throw new Error("The model returned an empty result.");
    }

    const normalized = predictions.map((item) => ({
      label: String(item.label || "").toLowerCase(),
      score: Number(item.score)
    }));

    const human = normalized.find((item) =>
      /human/.test(item.label)
    );

    const ai = normalized.find((item) =>
      /machine|artificial|generated|ai/.test(item.label)
    );

    if (human && ai) {
      return ai.score;
    }

    // Model card defines logits as [human, machine].
    // Transformers classification labels are LABEL_0 / LABEL_1.
    const label0 = normalized.find((item) =>
      /label_0/.test(item.label)
    );

    const label1 = normalized.find((item) =>
      /label_1/.test(item.label)
    );

    if (label0 && label1) {
      return label1.score;
    }

    throw new Error(
      "Unrecognized model output labels: " +
      normalized.map((item) => item.label).join(", ")
    );
  }

  async function analyze(text, onProgress) {
    cancelled = false;

    const normalized = normalizeText(text);

    if (!normalized) {
      throw new Error("Please enter some text to analyze.");
    }

    if (normalized.length > CONFIG.maxCharacters) {
      throw new Error("Text cannot exceed 10,000 characters.");
    }

    const totalWords = countWords(normalized);

    if (totalWords < CONFIG.minWords) {
      return {
        completed: true,
        verdict: "inconclusive",
        aiProbability: null,
        humanProbability: null,
        wordCount: totalWords,
        characterCount: normalized.length,
        analyzedChunks: 0,
        totalChunks: 0,
        language: "English",
        message:
          "This text is too short for reliable AI-writing analysis. Please provide at least 150 words."
      };
    }

    if (typeof onProgress === "function") {
      onProgress({
        stage: "model-loading",
        percentage: 0
      });
    }

    const classifier = await loadClassifier(onProgress);

    if (cancelled) {
      throw new Error("Writing analysis cancelled.");
    }

    const chunks = splitIntoChunks(normalized);
    const chunkResults = [];

    for (let index = 0; index < chunks.length; index++) {
      if (cancelled) {
        throw new Error("Writing analysis cancelled.");
      }

      const chunk = chunks[index];

      if (typeof onProgress === "function") {
        onProgress({
          stage: "text-analysis",
          completed: index,
          total: chunks.length,
          percentage: Math.round(
            (index / chunks.length) * 100
          )
        });
      }

      const output = await classifier(chunk.text, {
        top_k: null
      });

      const aiProbability = getAIProbability(output);

      if (
        !Number.isFinite(aiProbability) ||
        aiProbability < 0 ||
        aiProbability > 1
      ) {
        throw new Error("Invalid probability returned by model.");
      }

      chunkResults.push({
        chunk: index + 1,
        wordCount: chunk.wordCount,
        aiProbability
      });

      if (typeof onProgress === "function") {
        onProgress({
          stage: "text-analysis",
          completed: index + 1,
          total: chunks.length,
          percentage: Math.round(
            ((index + 1) / chunks.length) * 100
          )
        });
      }
    }

    if (cancelled) {
      throw new Error("Writing analysis cancelled.");
    }

    // Overlapping chunks are weighted by their word counts.
    const totalWeight = chunkResults.reduce(
      (sum, item) => sum + item.wordCount,
      0
    );

    const weightedAI = chunkResults.reduce(
      (sum, item) =>
        sum + item.aiProbability * item.wordCount,
      0
    ) / totalWeight;

    const aiProbability = Math.max(
      0,
      Math.min(1, weightedAI)
    );

    const humanProbability = 1 - aiProbability;

    // Conservative display bands. These are not calibrated
    // guarantees and must be validated on real-world samples.
    let verdict = "inconclusive";

    if (aiProbability >= 0.80) {
      verdict = "likely-ai";
    } else if (aiProbability <= 0.20) {
      verdict = "likely-human";
    }

    if (typeof onProgress === "function") {
      onProgress({
        stage: "completed",
        percentage: 100,
        completed: chunks.length,
        total: chunks.length
      });
    }

    return {
      completed: true,
      verdict,
      aiProbability: Number(aiProbability.toFixed(4)),
      humanProbability: Number(humanProbability.toFixed(4)),
      wordCount: totalWords,
      characterCount: normalized.length,
      analyzedChunks: chunkResults.length,
      totalChunks: chunks.length,
      language: "English",
      model: CONFIG.model,
      chunks: chunkResults,
      privacy: {
        processing: "browser-local",
        textUploadedToServer: false,
        permanentlyStored: false
      },
      message:
        "This is a model-based estimate, not proof of authorship. Paraphrased AI text and writing styles outside the model's training data may affect results."
    };
  }

  function cancel() {
    cancelled = true;
  }

  return Object.freeze({
    analyze,
    cancel,
    normalizeText,
    countWords
  });
})();

window.IFindAIWritingEngine = WritingEngine;
