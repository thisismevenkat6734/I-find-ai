"use strict";

/* =========================================
   I FIND AI — VIDEO INSPECTION ENGINE
   Version: 2.0
   Browser-local frame extraction
   ========================================= */

const VideoEngine = (() => {
  const CONFIG = Object.freeze({
    maxFileSize: 100 * 1024 * 1024,
    maxDuration: 300,
    maxFrames: 12,
    sampleIntervalSeconds: 1,
    frameWidth: 320,
    seekTimeout: 10000
  });

  let activeVideo = null;
  let activeObjectUrl = null;
  let cancelled = false;

  /* =======================================
     1. FILE VALIDATION
     ======================================= */

  function validateFile(file) {
    if (!(file instanceof File)) {
      throw new Error("Please select a video file.");
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
      throw new Error(
        "Supported formats: MP4, WebM, MOV and M4V."
      );
    }

    if (file.size === 0) {
      throw new Error("The selected video is empty.");
    }

    if (file.size > CONFIG.maxFileSize) {
      throw new Error("Video size must be 100 MB or less.");
    }

    return true;
  }

  /* =======================================
     2. RELEASE RESOURCES
     ======================================= */

  function release() {
    if (activeVideo) {
      activeVideo.pause();
      activeVideo.removeAttribute("src");
      activeVideo.load();
      activeVideo = null;
    }

    if (activeObjectUrl) {
      URL.revokeObjectURL(activeObjectUrl);
      activeObjectUrl = null;
    }
  }

  /* =======================================
     3. LOAD VIDEO METADATA
     ======================================= */

  function loadVideo(file) {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      const url = URL.createObjectURL(file);

      activeObjectUrl = url;
      activeVideo = video;

      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;

      function cleanup() {
        video.onloadedmetadata = null;
        video.onerror = null;
      }

      video.onloadedmetadata = () => {
        cleanup();

        if (
          !Number.isFinite(video.duration) ||
          video.duration <= 0
        ) {
          reject(new Error("Invalid video duration."));
          return;
        }

        if (video.duration > CONFIG.maxDuration) {
          reject(
            new Error("Maximum supported video duration is 5 minutes.")
          );
          return;
        }

        if (!video.videoWidth || !video.videoHeight) {
          reject(
            new Error("Video dimensions could not be read.")
          );
          return;
        }

        resolve(video);
      };

      video.onerror = () => {
        cleanup();

        reject(
          new Error("Unable to read this video. Try another file.")
        );
      };

      video.src = url;
    });
  }

  /* =======================================
     4. VIDEO SEEK
     ======================================= */

  function seekTo(video, time) {
    return new Promise((resolve, reject) => {
      let settled = false;

      const timeout = window.setTimeout(() => {
        finish(
          new Error("Video frame extraction timed out.")
        );
      }, CONFIG.seekTimeout);

      function cleanup() {
        window.clearTimeout(timeout);

        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
      }

      function finish(error) {
        if (settled) return;

        settled = true;
        cleanup();

        if (error) {
          reject(error);
        } else {
          resolve();
        }
      }

      function onSeeked() {
        finish();
      }

      function onError() {
        finish(
          new Error("Unable to decode a video frame.")
        );
      }

      video.addEventListener("seeked", onSeeked);
      video.addEventListener("error", onError);

      try {
        video.currentTime = time;
      } catch (error) {
        finish(
          new Error("Unable to seek to the requested video frame.")
        );
      }
    });
  }

  /* =======================================
     5. FRAME EXTRACTION
     ======================================= */

  function extractFrame(video, time) {
    const scale = Math.min(
      1,
      CONFIG.frameWidth / video.videoWidth
    );

    const width = Math.max(
      1,
      Math.round(video.videoWidth * scale)
    );

    const height = Math.max(
      1,
      Math.round(video.videoHeight * scale)
    );

    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", {
      willReadFrequently: true
    });

    if (!context) {
      throw new Error("Canvas processing is unavailable.");
    }

    context.drawImage(video, 0, 0, width, height);

    const pixels = context.getImageData(
      0,
      0,
      width,
      height
    );

    return {
      time,
      width,
      height,
      pixels
    };
  }

  /* =======================================
     6. FRAME HASH
     ======================================= */

  async function hashFrame(frame) {
    if (!crypto.subtle) {
      throw new Error(
        "Secure browser cryptography is unavailable."
      );
    }

    const digest = await crypto.subtle.digest(
      "SHA-256",
      frame.pixels.data
    );

    return Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  }

  /* =======================================
     7. FRAME STATISTICS
     ======================================= */

  function calculateStatistics(frame) {
    const data = frame.pixels.data;

    let total = 0;
    let squared = 0;
    let min = 255;
    let max = 0;
    let count = 0;

    for (let i = 0; i < data.length; i += 16) {
      const luminance =
        0.299 * data[i] +
        0.587 * data[i + 1] +
        0.114 * data[i + 2];

      total += luminance;
      squared += luminance * luminance;

      min = Math.min(min, luminance);
      max = Math.max(max, luminance);

      count++;
    }

    const mean = total / count;

    const variance = Math.max(
      0,
      squared / count - mean * mean
    );

    return {
      meanLuminance: Number(mean.toFixed(2)),
      luminanceVariance: Number(variance.toFixed(2)),
      luminanceRange: Number((max - min).toFixed(2))
    };
  }

  /* =======================================
     8. CALCULATE SAMPLE TIMES
     ======================================= */

  function calculateSampleTimes(duration) {
    const desiredFrames =
      Math.ceil(duration / CONFIG.sampleIntervalSeconds);

    const frameCount = Math.min(
      CONFIG.maxFrames,
      Math.max(2, desiredFrames)
    );

    const lastSafeTime = Math.max(
      0,
      duration - 0.05
    );

    const times = [];

    for (let i = 0; i < frameCount; i++) {
      const time =
        frameCount === 1
          ? 0
          : (lastSafeTime * i) / (frameCount - 1);

      times.push(Number(time.toFixed(3)));
    }

    return times;
  }

  /* =======================================
     9. EXTRACT ALL SAMPLED FRAMES
     ======================================= */

  async function extractFrames(video, onProgress) {
    const times = calculateSampleTimes(video.duration);

    const frames = [];

    for (let i = 0; i < times.length; i++) {
      if (cancelled) {
        throw new Error("Video analysis cancelled.");
      }

      const time = times[i];

      await seekTo(video, time);

      if (cancelled) {
        throw new Error("Video analysis cancelled.");
      }

      const frame = extractFrame(
        video,
        video.currentTime
      );

      frame.hash = await hashFrame(frame);
      frame.statistics = calculateStatistics(frame);

      frames.push(frame);

      if (typeof onProgress === "function") {
        onProgress({
          completed: i + 1,
          total: times.length,
          percentage: Math.round(
            ((i + 1) / times.length) * 100
          )
        });
      }

      await new Promise((resolve) => {
        requestAnimationFrame(resolve);
      });
    }

    return frames;
  }

  /* =======================================
     10. MAIN ANALYSIS
     ======================================= */

  async function analyze(file, onProgress) {
    cancelled = false;
    release();

    try {
      validateFile(file);

      if (typeof onProgress === "function") {
        onProgress({
          stage: "metadata",
          percentage: 0
        });
      }

      const video = await loadVideo(file);

      if (typeof onProgress === "function") {
        onProgress({
          stage: "frame-extraction",
          percentage: 0
        });
      }

      const frames = await extractFrames(
        video,
        (progress) => {
          if (typeof onProgress === "function") {
            onProgress({
              stage: "frame-extraction",
              ...progress
            });
          }
        }
      );

      if (cancelled) {
        throw new Error("Video analysis cancelled.");
      }

      const report = {
        file: {
          name: file.name,
          size: file.size,
          type: file.type
        },

        video: {
          duration: Number(video.duration.toFixed(2)),
          width: video.videoWidth,
          height: video.videoHeight,
          aspectRatio: Number(
            (video.videoWidth / video.videoHeight).toFixed(3)
          )
        },

        frames: frames.map((frame, index) => ({
          frameNumber: index + 1,
          timestamp: Number(frame.time.toFixed(2)),
          width: frame.width,
          height: frame.height,
          sha256: frame.hash,
          statistics: frame.statistics
        })),

        analysis: {
          extractedFrames: frames.length,
          completed: true,
          deepfakeModelAvailable: false,
          verdict: "not-analyzed",
          message:
            "Frame inspection completed. A validated AI video detection model is not connected yet."
        },

        privacy: {
          processing: "browser-local",
          uploadedToServer: false,
          permanentlyStored: false
        }
      };

      if (typeof onProgress === "function") {
        onProgress({
          stage: "completed",
          percentage: 100,
          completed: frames.length,
          total: frames.length
        });
      }

      return report;

    } catch (error) {
      throw error;

    } finally {
      release();
    }
  }

  /* =======================================
     11. CANCEL
     ======================================= */

  function cancel() {
    cancelled = true;
  }

  /* =======================================
     12. PUBLIC API
     ======================================= */

  return Object.freeze({
    analyze,
    cancel,
    validateFile
  });
})();

window.IFindAIVideoEngine = VideoEngine;
