
"use strict";

/* =========================================
   I FIND AI — MAIN JAVASCRIPT
   File: script.js
   ========================================= */

document.addEventListener("DOMContentLoaded", () => {
  initWelcomeScreen();
  initMobileNavigation();
  initDetectorTabs();
  initImageUpload();
  initVideoUpload();
  initWritingDetector();
  initAnalysisButtons();
  initFooterYear();
  initAccessibility();
});

/* =========================================
   1. WELCOME SCREEN
   ========================================= */

function initWelcomeScreen() {
  const welcomeScreen = document.getElementById("welcome-screen");
  const mainWebsite = document.getElementById("main-website");

  if (!welcomeScreen || !mainWebsite) return;

  const INTRO_KEY = "ifindai_welcome_seen";

  // Hide main website while welcome screen is active.
  mainWebsite.classList.add("is-hidden");

  // Show welcome only once per browser tab session.
  try {
    if (sessionStorage.getItem(INTRO_KEY) === "yes") {
      welcomeScreen.hidden = true;
      mainWebsite.classList.remove("is-hidden");
      return;
    }

    sessionStorage.setItem(INTRO_KEY, "yes");
  } catch (error) {
    // Continue normally if browser storage is unavailable.
  }

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  const duration = reducedMotion ? 1000 : 5000;

  window.setTimeout(() => {
    welcomeScreen.classList.add("is-leaving");

    window.setTimeout(() => {
      welcomeScreen.hidden = true;
      mainWebsite.classList.remove("is-hidden");
    }, reducedMotion ? 100 : 700);

  }, duration);
}

/* =========================================
   2. MOBILE NAVIGATION
   ========================================= */

function initMobileNavigation() {
  const menuButton = document.getElementById("mobile-menu-button");
  const navigation = document.querySelector(".main-nav");

  if (!menuButton || !navigation) return;

  function closeMenu() {
    navigation.classList.remove("is-open");
    menuButton.classList.remove("is-active");
    menuButton.setAttribute("aria-expanded", "false");
  }

  menuButton.addEventListener("click", () => {
    const isOpen = navigation.classList.toggle("is-open");

    menuButton.classList.toggle("is-active", isOpen);
    menuButton.setAttribute("aria-expanded", String(isOpen));
  });

  navigation.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("click", (event) => {
    if (
      !navigation.contains(event.target) &&
      !menuButton.contains(event.target)
    ) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
}

/* =========================================
   3. DETECTOR TABS
   ========================================= */

function initDetectorTabs() {
  const tabs = document.querySelectorAll("[data-mode]");
  const panels = document.querySelectorAll(".detector-panel");

  if (!tabs.length || !panels.length) return;

  function activateTab(selectedTab) {
    const mode = selectedTab.dataset.mode;

    tabs.forEach((tab) => {
      const active = tab === selectedTab;

      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.setAttribute("tabindex", active ? "0" : "-1");
    });

    panels.forEach((panel) => {
      const active = panel.id === `panel-${mode}`;

      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activateTab(tab));

    tab.addEventListener("keydown", (event) => {
      let nextIndex = index;

      if (event.key === "ArrowRight") {
        nextIndex = (index + 1) % tabs.length;
      } else if (event.key === "ArrowLeft") {
        nextIndex = (index - 1 + tabs.length) % tabs.length;
      } else {
        return;
      }

      event.preventDefault();
      tabs[nextIndex].focus();
      activateTab(tabs[nextIndex]);
    });
  });

  const initiallyActive = document.querySelector(
    "[data-mode].active"
  );

  activateTab(initiallyActive || tabs[0]);
}

/* =========================================
   4. SHARED FILE UTILITIES
   ========================================= */

const IFINDAI_LIMITS = {
  image: 15 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  text: 10000
};

const IFINDAI_ALLOWED_IMAGES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
];

const IFINDAI_ALLOWED_VIDEOS = [
  "video/mp4",
  "video/webm",
  "video/quicktime"
];

let currentImageFile = null;
let currentVideoFile = null;
let imageObjectUrl = null;
let videoObjectUrl = null;

function showStatus(message, type = "info") {
  const status = document.getElementById("analysis-status");
  const statusMessage = document.getElementById("analysis-message");

  if (!status || !statusMessage) return;

  status.hidden = false;
  statusMessage.textContent = message;

  status.dataset.type = type;
  status.classList.add("is-visible");
}

function hideStatus() {
  const status = document.getElementById("analysis-status");

  if (!status) return;

  status.hidden = true;
  status.classList.remove("is-visible");
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "";

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function releaseObjectUrl(type) {
  if (type === "image" && imageObjectUrl) {
    URL.revokeObjectURL(imageObjectUrl);
    imageObjectUrl = null;
  }

  if (type === "video" && videoObjectUrl) {
    URL.revokeObjectURL(videoObjectUrl);
    videoObjectUrl = null;
  }
}

/* =========================================
   5. IMAGE UPLOAD AND PREVIEW
   ========================================= */

function initImageUpload() {
  const input = document.getElementById("image-file");
  const preview = document.getElementById("image-preview");
  const previewImage = document.getElementById("image-preview-img");
  const fileName = document.getElementById("image-file-name");
  const removeButton = document.getElementById("remove-image");
  const analyzeButton = document.getElementById("analyze-image");

  if (!input) return;

  function clearImage() {
    currentImageFile = null;
    releaseObjectUrl("image");

    input.value = "";

    if (previewImage) previewImage.removeAttribute("src");
    if (preview) preview.hidden = true;
    if (fileName) fileName.textContent = "";

    if (analyzeButton) analyzeButton.disabled = true;

    hideStatus();
  }

  function handleImage(file) {
    if (!file) return;

    if (!IFINDAI_ALLOWED_IMAGES.includes(file.type)) {
      clearImage();
      showStatus(
        "Unsupported image format. Please select JPG, PNG, WEBP or GIF.",
        "error"
      );
      return;
    }

    if (file.size > IFINDAI_LIMITS.image) {
      clearImage();
      showStatus(
        "Image is too large. Maximum supported selection size is 15 MB.",
        "error"
      );
      return;
    }

    releaseObjectUrl("image");

    currentImageFile = file;
    imageObjectUrl = URL.createObjectURL(file);

    if (previewImage) {
      previewImage.src = imageObjectUrl;
      previewImage.alt = "Selected image preview";
    }

    if (preview) preview.hidden = false;

    if (fileName) {
      fileName.textContent =
        `${file.name} · ${formatFileSize(file.size)}`;
    }

    if (analyzeButton) analyzeButton.disabled = true;

    hideStatus();
  }

  input.addEventListener("change", () => {
    handleImage(input.files && input.files[0]);
  });

  if (removeButton) {
    removeButton.addEventListener("click", clearImage);
  }

  setupDropZone(input, handleImage);
}

/* =========================================
   6. VIDEO UPLOAD AND PREVIEW
   ========================================= */

function initVideoUpload() {
  const input = document.getElementById("video-file");
  const preview = document.getElementById("video-preview");
  const video = document.getElementById("video-preview-player");
  const fileName = document.getElementById("video-file-name");
  const removeButton = document.getElementById("remove-video");
  const analyzeButton = document.getElementById("analyze-video");

  if (!input) return;

  function clearVideo() {
    currentVideoFile = null;
    releaseObjectUrl("video");

    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }

    input.value = "";

    if (preview) preview.hidden = true;
    if (fileName) fileName.textContent = "";

    if (analyzeButton) analyzeButton.disabled = true;

    hideStatus();
  }

  function handleVideo(file) {
    if (!file) return;

    if (!IFINDAI_ALLOWED_VIDEOS.includes(file.type)) {
      clearVideo();
      showStatus(
        "Unsupported video format. Please select MP4, WEBM or MOV.",
        "error"
      );
      return;
    }

    if (file.size > IFINDAI_LIMITS.video) {
      clearVideo();
      showStatus(
        "Video is too large. Maximum supported selection size is 100 MB.",
        "error"
      );
      return;
    }

    releaseObjectUrl("video");

    currentVideoFile = file;
    videoObjectUrl = URL.createObjectURL(file);

    if (video) {
      video.src = videoObjectUrl;
      video.load();
    }

    if (preview) preview.hidden = false;

    if (fileName) {
      fileName.textContent =
        `${file.name} · ${formatFileSize(file.size)}`;
    }

    if (analyzeButton) analyzeButton.disabled = true;

    hideStatus();
  }

  input.addEventListener("change", () => {
    handleVideo(input.files && input.files[0]);
  });

  if (removeButton) {
    removeButton.addEventListener("click", clearVideo);
  }

  setupDropZone(input, handleVideo);
}

/* =========================================
   7. DRAG AND DROP
   ========================================= */

function setupDropZone(input, onFileSelected) {
  if (!input) return;

  const zone =
    input.closest("[data-upload-zone]") ||
    input.closest(".upload-area") ||
    input.closest(".upload-zone") ||
    input.parentElement;

  if (!zone) return;

  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    zone.classList.add("is-dragging");
  });

  zone.addEventListener("dragleave", (event) => {
    if (!zone.contains(event.relatedTarget)) {
      zone.classList.remove("is-dragging");
    }
  });

  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("is-dragging");

    const file = event.dataTransfer?.files?.[0];

    if (file) onFileSelected(file);
  });
}

/* =========================================
   8. WRITING DETECTOR INPUT
   ========================================= */

function initWritingDetector() {
  const textarea = document.getElementById("writing-input");
  const counter = document.getElementById("character-count");
  const clearButton = document.getElementById("clear-writing");
  const analyzeButton = document.getElementById("analyze-writing");

  if (!textarea) return;

  textarea.maxLength = IFINDAI_LIMITS.text;

  function updateCounter() {
    const length = textarea.value.length;

    if (counter) {
      counter.textContent =
        `${length.toLocaleString()} / ${IFINDAI_LIMITS.text.toLocaleString()}`;
    }

    if (analyzeButton) {
      analyzeButton.disabled = true;
    }
  }

  textarea.addEventListener("input", updateCounter);

  if (clearButton) {
    clearButton.addEventListener("click", () => {
      textarea.value = "";
      updateCounter();
      hideStatus();
      textarea.focus();
    });
  }

  updateCounter();
}

/* =========================================
   9. ANALYSIS ENGINE STATUS
   ========================================= */

function initAnalysisButtons() {
  const buttons = [
    document.getElementById("analyze-image"),
    document.getElementById("analyze-video"),
    document.getElementById("analyze-writing")
  ].filter(Boolean);

  buttons.forEach((button) => {
    // Prevent misleading or fabricated analysis results.
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
    button.title = "Detection engine is not integrated yet.";
  });
}

/* =========================================
   10. FOOTER YEAR
   ========================================= */

function initFooterYear() {
  const yearElements = document.querySelectorAll(
    "[data-current-year]"
  );

  yearElements.forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });
}

/* =========================================
   11. ACCESSIBILITY
   ========================================= */

function initAccessibility() {
  const menuButton = document.getElementById("mobile-menu-button");

  if (menuButton && !menuButton.hasAttribute("aria-expanded")) {
    menuButton.setAttribute("aria-expanded", "false");
  }

  const imageInput = document.getElementById("image-file");
  const videoInput = document.getElementById("video-file");

  if (imageInput) {
    imageInput.setAttribute("aria-label", "Choose an image file");
  }

  if (videoInput) {
    videoInput.setAttribute("aria-label", "Choose a video file");
  }
}

/* =========================================
   12. CLEANUP
   ========================================= */

window.addEventListener("beforeunload", () => {
  releaseObjectUrl("image");
  releaseObjectUrl("video");
});
