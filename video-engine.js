"use strict";

/* =========================================
   I FIND AI — DEEPFAKE FRAME SCREENING
   Q4 Quantized ONNX Model
   ========================================= */

const VideoEngine = (() => {
  const CONFIG = Object.freeze({
    model: "onnx-community/Deep-Fake-Detector-v2-Model-ONNX",
    maxFileSize: 100 * 1024 * 1024,
    maxDuration: 300,
    maxFrames: 12,
    sampleInterval: 1,
    frameWidth: 320
  });

  let classifierPromise = null;
  let activeVideo = null;
  let activeURL = null;
  let cancelled = false;

  /* FILE VALIDATION */

  function validateFile(file) {
    if (!(file instanceof File)) {
      throw new Error("Please select a video file.");
    }

    if (!/\.(mp4|webm|mov|m4v)$/i.test(file.name)) {
      throw new Error("Supported formats: MP4, WebM, MOV and M4V.");
    }

    if (!file.size || file.size > CONFIG.maxFileSize) {
      throw new Error("Video size must be between 1 byte and 100 MB.");
    }

    return true;
  }

  /* RESOURCE CLEANUP */

  function releaseVideo() {
    if (activeVideo) {
      activeVideo.pause();
      activeVideo.removeAttribute("src");
      activeVideo.load();
      activeVideo = null;
    }

    if (activeURL) {
      URL.revokeObjectURL(activeURL);
      activeURL = null;
    }
  }

  /* LOAD Q4 CLASSIFIER */

  async function loadClassifier(onProgress) {
    if (!classifierPromise) {
      classifierPromise = (async () => {
        if (typeof onProgress === "function") {
          onProgress({
            stage: "model-loading",
            message: "Loading optimized Q4 deepfake model..."
          });
        }

        const { pipeline, env } = await import(
          "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2"
        );

        env.allowRemoteModels = true;

        const model = await pipeline(
          "image-classification",
          CONFIG.model,
          {
            device: "wasm",
            dtype: "q4",
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

        return model;
      })().catch((error) => {
        classifierPromise = null;
        console.error("Deepfake model loading failed:", error);

        throw new Error(
          "Deepfake model could not load. Check your internet connection or model compatibility and try again."
        );
      });
    }

    return classifierPromise;
  }

  /* LOAD VIDEO */

  function loadVideo(file) {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      const url = URL.createObjectURL(file);

      activeVideo = video;
      activeURL = url;

      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;

      video.onloadedmetadata = () => {
        video.onloadedmetadata = null;
        video.onerror = null;

        if (!Number.isFinite(video.duration) || video.duration <= 0) {
          reject(new Error("Invalid video duration."));
          return;
        }

        if (video.duration > CONFIG.maxDuration) {
          reject(new Error("Maximum video duration is 5 minutes."));
          return;
        }

        if (!video.videoWidth || !video.videoHeight) {
          reject(new Error("Video dimensions could not be read."));
          return;
        }

        resolve(video);
      };

      video.onerror = () => {
        video.onloadedmetadata = null;
        video.onerror = null;
        reject(new Error("Unable to decode this video."));
      };

      video.src = url;
    });
  }

  /* SEEK TO FRAME */

  function seekTo(video, time) {
    return new Promise((resolve, reject) => {
      let finished = false;

      const timeout = setTimeout(() => {
        finish(new Error("Frame extraction timed out."));
      }, 10000);

      function cleanup() {
        clearTimeout(timeout);
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
      }

      function finish(error) {
        if (finished) return;

        finished = true;
        cleanup();

        if (error) reject(error);
        else resolve();
      }

      function onSeeked() {
        finish();
      }

      function onError() {
        finish(new Error("Unable to decode video frame."));
      }

      video.addEventListener("seeked", onSeeked);
      video.addEventListener("error", onError);

      try {
        video.currentTime = time;
      } catch (error) {
        finish(error);
      }
    });
  }

  /* FRAME SAMPLING */

  function sampleTimes(duration) {
    const count = Math.min(
      CONFIG.maxFrames,
      Math.max(2, Math.ceil(duration / CONFIG.sampleInterval))
    );

    const lastTime = Math.max(0, duration - 0.05);

    return Array.from({ length: count }, (_, index) =>
      Number(
        (lastTime * index / (count - 1)).toFixed(3)
      )
    );
  }

  /* CREATE FRAME */

  function makeFrameCanvas(video) {
    const scale = Math.min(
      1,
      CONFIG.frameWidth / video.videoWidth
    );

    const canvas = document.createElement("canvas");

    canvas.width = Math.max(
      1,
      Math.round(video.videoWidth * scale)
    );

    canvas.height = Math.max(
      1,
      Math.round(video.videoHeight * scale)
    );

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas processing is unavailable.");
    }

    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height
    );

    return canvas;
  }

  /* MODEL OUTPUT INTERPRETATION */

  function interpretPrediction(predictions) {
    const normalized = predictions.map((item) => ({
      label: String(item.label || "").toLowerCase(),
      score: Number(item.score || 0)
    }));

    const fake = normalized.find((item) =>
      /deepfake|deep.fake|fake/.test(item.label)
    );

    const real = normalized.find((item) =>
      /realism|real|authentic/.test(item.label)
    );

    if (!fake || !real) {
      return {
        status: "inconclusive",
        fakeScore: null,
        realScore: null,
        predictions: normalized
      };
    }

    return {
      status:
        fake.score > real.score
          ? "deepfake-like"
          : "real-like",
      fakeScore: fake.score,
      realScore: real.score,
      predictions: normalized
    };
  }

  /* MAIN ANALYSIS */

  async function analyze(file, onProgress) {
    cancelled = false;
    releaseVideo();

    try {
      validateFile(file);

      const video = await loadVideo(file);

      if (typeof onProgress === "function") {
        onProgress({
          stage: "model-loading",
          percentage: 0
        });
      }

      const classifier = await loadClassifier(onProgress);

      if (cancelled) {
        throw new Error("Analysis cancelled.");
      }

      const times = sampleTimes(video.duration);
      const frameResults = [];

      for (let index = 0; index < times.length; index++) {
        if (cancelled) {
          throw new Error("Analysis cancelled.");
        }

        await seekTo(video, times[index]);

        const canvas = makeFrameCanvas(video);
        const imageData = canvas.toDataURL("image/jpeg", 0.85);

        const predictions = await classifier(imageData);

        const result = interpretPrediction(predictions);

        frameResults.push({
          frameNumber: index + 1,
          timestamp: times[index],
          ...result
        });

        if (typeof onProgress === "function") {
          onProgress({
            stage: "frame-analysis",
            completed: index + 1,
            total: times.length,
            percentage: Math.round(
              ((index + 1) / times.length) * 100
            )
          });
        }

        await new Promise((resolve) => {
          requestAnimationFrame(resolve);
        });
      }

      const validFrames = frameResults.filter(
        (frame) => frame.fakeScore !== null
      );

      const averageFakeScore = validFrames.length
        ? validFrames.reduce(
            (sum, frame) => sum + frame.fakeScore,
            0
          ) / validFrames.length
        : null;

      const deepfakeLikeFrames = validFrames.filter(
        (frame) => frame.status === "deepfake-like"
      ).length;

      let verdict = "inconclusive";

      if (validFrames.length) {
        const ratio =
          deepfakeLikeFrames / validFrames.length;

        if (ratio >= 0.7) {
          verdict = "deepfake-like-signals";
        } else if (ratio <= 0.3) {
          verdict = "real-like-signals";
        }
      }

      if (typeof onProgress === "function") {
        onProgress({
          stage: "completed",
          percentage: 100,
          completed: frameResults.length,
          total: frameResults.length
        });
      }

      return {
        file: {
          name: file.name,
          size: file.size,
          type: file.type
        },

        video: {
          duration: Number(video.duration.toFixed(2)),
          width: video.videoWidth,
          height: video.videoHeight
        },

        frames: frameResults,

        analysis: {
          completed: true,
          model: CONFIG.model,
          modelType: "image-classifier-applied-to-video-frames",
          quantization: "q4",
          extractedFrames: frameResults.length,
          analyzedFrames: validFrames.length,
          deepfakeLikeFrames,
          averageFakeScore:
            averageFakeScore === null
              ? null
              : Number(averageFakeScore.toFixed(4)),
          verdict,
          message:
            "Frame-level screening completed. This is not a validated temporal video deepfake verdict."
        },

        privacy: {
          processing: "browser-local",
          videoUploadedToServer: false,
          permanentlyStored: false
        }
      };

    } finally {
      releaseVideo();
    }
  }

  function cancel() {
    cancelled = true;
  }

  return Object.freeze({
    analyze,
    cancel,
    validateFile
  });
})();

window.IFindAIVideoEngine = VideoEngine;

