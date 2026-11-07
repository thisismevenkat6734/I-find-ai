"use strict";

/* =========================================
   I FIND AI — MAIN JAVASCRIPT
   Version: 2.0
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
  registerServiceWorker();
});

/* =========================================
   1. WELCOME SCREEN
   ========================================= */

function initWelcomeScreen() {
  const screen = document.getElementById("welcome-screen");
  const main = document.getElementById("main-website");

  if (!screen || !main) return;

  main.classList.add("is-hidden");

  try {
    if (sessionStorage.getItem("ifindai_welcome_seen") === "yes") {
      screen.hidden = true;
      main.classList.remove("is-hidden");
      return;
    }

    sessionStorage.setItem("ifindai_welcome_seen", "yes");
  } catch (error) {
    // Continue if session storage is unavailable.
  }

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  const duration = reducedMotion ? 1000 : 5000;

  window.setTimeout(() => {
    screen.classList.add("is-leaving");

    window.setTimeout(() => {
      screen.hidden = true;
      main.classList.remove("is-hidden");
    }, reducedMotion ? 100 : 700);
  }, duration);
}

/* =========================================
   2. MOBILE NAVIGATION
   ========================================= */

function initMobileNavigation() {
  const button = document.getElementById("mobile-menu-button");
  const nav = document.querySelector(".main-nav");

  if (!button || !nav) return;

  function closeMenu() {
    nav.classList.remove("is-open");
    button.classList.remove("is-active");
    button.setAttribute("aria-expanded", "false");
  }

  button.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");

    button.classList.toggle("is-active", open);
    button.setAttribute("aria-expanded", String(open));
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("click", (event) => {
    if (!nav.contains(event.target) && !button.contains(event.target)) {
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

  function activateTab(selected) {
    const mode = selected.dataset.mode;

    tabs.forEach((tab) => {
      const active = tab === selected;

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
      let next = index;

      if (event.key === "ArrowRight") {
        next = (index + 1) % tabs.length;
      } else if (event.key === "ArrowLeft") {
        next = (index - 1 + tabs.length) % tabs.length;
      } else {
        return;
      }

      event.preventDefault();
      tabs[next].focus();
      activateTab(tabs[next]);
    });
  });

  const activeTab = document.querySelector("[data-mode].active");
  activateTab(activeTab || tabs[0]);
}

/* =========================================
   4. FILE SETTINGS
   ========================================= */

const FILE_LIMITS = {
  image: 15 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  text: 10000
};

const ALLOWED_IMAGES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
];

const ALLOWED_VIDEOS = [
  "video/mp4",
  "video/webm",
  "video/quicktime"
];

let selectedImage = null;
let selectedVideo = null;
let imageURL = null;
let videoURL = null;

/* =========================================
   5. STATUS MESSAGES
   ========================================= */

function showStatus(message, type = "info") {
  const status = document.getElementById("analysis-status");
  const text = document.getElementById("analysis-message");

  if (!status || !text) return;

  status.hidden = false;
  status.dataset.type = type;
  status.classList.add("is-visible");
  text.textContent = message;
}

function hideStatus() {
  const status = document.getElementById("analysis-status");

  if (!status) return;

  status.hidden = true;
  status.classList.remove("is-visible");
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function releaseURL(type) {
  if (type === "image" && imageURL) {
    URL.revokeObjectURL(imageURL);
    imageURL = null;
  }

  if (type === "video" && videoURL) {
    URL.revokeObjectURL(videoURL);
    videoURL = null;
  }
}

/* =========================================
   6. IMAGE UPLOAD
   ========================================= */

function initImageUpload() {
  const input = document.getElementById("image-file");
  const preview = document.getElementById("image-preview");
  const image = document.getElementById("image-preview-img");
  const name = document.getElementById("image-file-name");
  const remove = document.getElementById("remove-image");

  if (!input) return;

  const analyze = document.getElementById("analyze-image");

  function clearImage() {
    selectedImage = null;
    releaseURL("image");
    input.value = "";

    if (image) image.removeAttribute("src");
    if (preview) preview.hidden = true;
    if (name) name.textContent = "";
    if (analyze) analyze.disabled = true;

    hideStatus();
  }

  function handleImage(file) {
    if (!file) return;

    if (!ALLOWED_IMAGES.includes(file.type)) {
      clearImage();
      showStatus("Please select a JPG, PNG, WEBP or GIF image.", "error");
      return;
    }

    if (file.size > FILE_LIMITS.image) {
      clearImage();
      showStatus("Image size must not exceed 15 MB.", "error");
      return;
    }

    releaseURL("image");

    selectedImage = file;
    imageURL = URL.createObjectURL(file);

    if (image) {
      image.src = imageURL;
      image.alt = "Selected image preview";
    }

    if (preview) preview.hidden = false;

    if (name) {
      name.textContent = `${file.name} · ${formatFileSize(file.size)}`;
    }

    if (analyze) analyze.disabled = true;

    hideStatus();
  }

  input.addEventListener("change", () => {
    handleImage(input.files?.[0]);
  });

  if (remove) remove.addEventListener("click", clearImage);

  setupDropZone(input, handleImage);
}

/* =========================================
   7. VIDEO UPLOAD
   ========================================= */

function initVideoUpload() {
  const input = document.getElementById("video-file");
  const preview = document.getElementById("video-preview");
  const video = document.getElementById("video-preview-player");
  const name = document.getElementById("video-file-name");
  const remove = document.getElementById("remove-video");

  if (!input) return;

  const analyze = document.getElementById("analyze-video");

  function clearVideo() {
    selectedVideo = null;
    releaseURL("video");

    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }

    input.value = "";

    if (preview) preview.hidden = true;
    if (name) name.textContent = "";
    if (analyze) analyze.disabled = true;

    hideStatus();
  }

  function handleVideo(file) {
    if (!file) return;

    if (!ALLOWED_VIDEOS.includes(file.type)) {
      clearVideo();
      showStatus("Please select an MP4, WEBM or MOV video.", "error");
      return;
    }

    if (file.size > FILE_LIMITS.video) {
      clearVideo();
      showStatus("Video size must not exceed 100 MB.", "error");
      return;
    }

    releaseURL("video");

    selectedVideo = file;
    videoURL = URL.createObjectURL(file);

    if (video) {
      video.src = videoURL;
      video.load();
    }

    if (preview) preview.hidden = false;

    if (name) {
      name.textContent = `${file.name} · ${formatFileSize(file.size)}`;
    }

    if (analyze) analyze.disabled = true;

    hideStatus();
  }

  input.addEventListener("change", () => {
    handleVideo(input.files?.[0]);
  });

  if (remove) remove.addEventListener("click", clearVideo);

  setupDropZone(input, handleVideo);
}

/* =========================================
   8. DRAG AND DROP
   ========================================= */

function setupDropZone(input, onSelect) {
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

    if (file) onSelect(file);
  });
}

/* =========================================
   9. WRITING INPUT
   ========================================= */

function initWritingDetector() {
  const textarea = document.getElementById("writing-input");
  const counter = document.getElementById("character-count");
  const clear = document.getElementById("clear-writing");
  const analyze = document.getElementById("analyze-writing");

  if (!textarea) return;

  textarea.maxLength = FILE_LIMITS.text;

  function updateCounter() {
    if (counter) {
      counter.textContent =
        `${textarea.value.length.toLocaleString()} / ${FILE_LIMITS.text.toLocaleString()}`;
    }

    if (analyze) analyze.disabled = true;
  }

  textarea.addEventListener("input", updateCounter);

  if (clear) {
    clear.addEventListener("click", () => {
      textarea.value = "";
      updateCounter();
      hideStatus();
      textarea.focus();
    });
  }

  updateCounter();
}

/* =========================================
   10. DETECTION BUTTONS
   ========================================= */

function initAnalysisButtons() {
  [
    "analyze-image",
    "analyze-video",
    "analyze-writing"
  ].forEach((id) => {
    const button = document.getElementById(id);

    if (!button) return;

    // Prevent fabricated AI detection results.
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
    button.title = "Detection engine is not integrated yet.";
  });
}

/* =========================================
   11. FOOTER YEAR
   ========================================= */

function initFooterYear() {
  document.querySelectorAll("[data-current-year]").forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });
}

/* =========================================
   12. ACCESSIBILITY
   ========================================= */

function initAccessibility() {
  const menu = document.getElementById("mobile-menu-button");

  if (menu && !menu.hasAttribute("aria-expanded")) {
    menu.setAttribute("aria-expanded", "false");
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
   13. SERVICE WORKER REGISTRATION
   ========================================= */

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    console.info("Service Workers are not supported in this browser.");
    return;
  }

  // GitHub Pages project path.
  const serviceWorkerPath = "/I-find-ai/sw.js";

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register(
        serviceWorkerPath,
        {
          scope: "/I-find-ai/"
        }
      );

      console.info(
        "I FIND AI Service Worker registered:",
        registration.scope
      );

    } catch (error) {
      console.error(
        "I FIND AI Service Worker registration failed:",
        error
      );
    }
  });
}

/* =========================================
   14. RESOURCE CLEANUP
   ========================================= */

window.addEventListener("beforeunload", () => {
  releaseURL("image");
  releaseURL("video");
});
