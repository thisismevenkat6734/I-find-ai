"use strict";

/*
 * I FIND AI — Video Analysis Engine
 * Browser-only video inspection.
 *
 * This module:
 * 1. Validates video files.
 * 2. Reads video metadata.
 * 3. Extracts 12 evenly-spaced frames.
 * 4. Computes frame hashes and visual statistics.
 * 5. Reports observable video signals.
 *
 * It does NOT claim to detect deepfakes without
 * a validated video classification model.
 */

const VideoEngine = (() => {
  const CONFIG = {
    maxFileSize: 100 * 1024 * 1024,
    maxDuration: 300,
    maxFrames: 12,
    frameWidth: 320,
    frameInterval: 500
  };

  let activeVideo = null;
  let activeObjectUrl = null;
  let cancelled = false;

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

    if (
      !allowedTypes.includes(file.type) &&
      !/\.(mp4|webm|mov|m4v)$/i.test(file.name)
    ) {
      throw new Error("Supported formats: MP4, WebM, MOV and M4V.");
    }

    if (file.size > CONFIG.maxFileSize) {
      throw new Error("Video size must be 100 MB or less.");
    }

    if (file.size === 0) {
      throw new Error("The selected video is empty.");
    }

    return true;
  }

  function loadVideo(file) {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      const url = URL.createObjectURL(file);

      activeObjectUrl = url;
      activeVideo = video;

      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;

      const cleanup = () => {
        video.onloadedmetadata = null;
        video.onerror = null;
      };

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
          reject(new Error("Video dimensions could not be read."));
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

  function seekTo(video, time) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Video frame extraction timed out."));
      }, 10000);

      const cleanup = () => {
        clearTimeout(timeout);
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
      };

      const onSeeked = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(new Error("Unable to decode a video frame."));
      };

      video.addEventListener("seeked", onSeeked, {
        once: true
      });

      video.addEventListener("error", onError, {
        once: true
      });

      video.currentTime = time;
    });
  }

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

  async function hashFrame(frame) {
    const data = frame.pixels.data;

    const digest = await crypto.subtle.digest(
      "SHA-256",
      data
    );

    return Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  }

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

  async function extractFrames(video, onProgress) {
    const duration = video.duration;

    const frameCount = Math.min(
      CONFIG.maxFrames,
      Math.max(2, Math.ceil(duration / CONFIG.frameInterval))
    );

    const frames = [];

    for (let i = 0; i < frameCount; i++) {
      if (cancelled) {
        throw new Error("Video analysis cancelled.");
      }

      const time =
        frameCount === 1
          ? 0
          : (duration * i) / (frameCount - 1);

      await seekTo(video, Math.min(time, duration - 0.05));

      const frame = extractFrame(video, video.currentTime);

      frame.hash = await hashFrame(frame);
      frame.statistics = calculateStatistics(frame);

      frames.push(frame);

      if (typeof onProgress === "function") {
        onProgress({
          completed: i + 1,
          total: frameCount,
          percentage: Math.round(
            ((i + 1) / frameCount) * 100
          )
        });
      }

      await new Promise((resolve) =>
        requestAnimationFrame(resolve)
      );
    }

    return frames;
  }

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

        frames: frames.map((frame) => ({
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
            "Frames extracted successfully. A validated AI video detection model is not connected yet."
        },

        privacy: {
          processing: "browser-local",
          uploadedToServer: false,
          permanentlyStored: false
        }
      };

      release();

      return report;

    } catch (error) {
      release();
      throw error;
    }
  }

  function cancel() {
    cancelled = true;
    release();
  }

  return Object.freeze({
    analyze,
    cancel,
    validateFile
  });
})();

window.IFindAIVideoEngine = VideoEngine;
