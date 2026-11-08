"use strict";

/* =========================================
   I FIND AI — MAIN JAVASCRIPT
   Version: 2.4
   Image + Video + Writing integration
   ========================================= */

document.addEventListener("DOMContentLoaded", () => {
  initWelcomeScreen();
  initMobileNavigation();
  initDetectorTabs();
  initImageUpload();
  initVideoUpload();
  initFooterYear();
  initAccessibility();
  registerServiceWorker();
});

/* 1. WELCOME SCREEN */

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
  } catch (error) {}

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  window.setTimeout(() => {
    screen.classList.add("is-leaving");

    window.setTimeout(() => {
      screen.hidden = true;
      main.classList.remove("is-hidden");
    }, reducedMotion ? 100 : 700);
  }, reducedMotion ? 1000 : 5000);
}

/* 2. MOBILE NAVIGATION */

function initMobileNavigation() {
  const button = document.getElementById("mobile-menu-button");
  const nav = document.querySelector(".main-navigation");

  if (!button || !nav) return;

  function closeMenu() {
    nav.classList.remove("is-open");
    button.classList.remove("is-active");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", "Open navigation");
  }

  button.addEventListener("click", (event) => {
    event.stopPropagation();

    if (nav.classList.contains("is-open")) {
      closeMenu();
    } else {
      nav.classList.add("is-open");
      button.classList.add("is-active");
      button.setAttribute("aria-expanded", "true");
      button.setAttribute("aria-label", "Close navigation");
    }
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

  window.addEventListener("resize", () => {
    if (window.innerWidth > 680) closeMenu();
  });
}

/* 3. DETECTOR TABS */

function initDetectorTabs() {
  const tabs = document.querySelectorAll("[data-mode]");
  const panels = document.querySelectorAll(".detector-panel");

  if (!tabs.length || !panels.length) return;

  function activateTab(selected) {
    if (!selected) return;

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

  activateTab(
    document.querySelector("[data-mode].active") || tabs[0]
  );
}

/* 4. FILE SETTINGS */

const FILE_LIMITS = {
  image: 15 * 1024 * 1024,
  video: 100 * 1024 * 1024
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
  "video/quicktime",
  "video/x-m4v"
];

let selectedImage = null;
let selectedVideo = null;
let imageURL = null;
let videoURL = null;

/* 5. STATUS MESSAGES */

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

/* 6. IMAGE UPLOAD */

function initImageUpload() {
  const input = document.getElementById("image-file");
  const preview = document.getElementById("image-preview");
  const image = document.getElementById("image-preview-img");
  const name = document.getElementById("image-file-name");
  const remove = document.getElementById("remove-image");
  const analyze = document.getElementById("analyze-image");

  if (!input) return;

  function clearImage() {
    selectedImage = null;
    releaseURL("image");
    input.value = "";

    if (image) image.removeAttribute("src");
    if (preview) preview.hidden = true;
    if (name) name.textContent = "";
    if (analyze) analyze.disabled = true;

    hideStatus();
    clearResults();
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

    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
    } catch (error) {}

    imageURL = URL.createObjectURL(file);

    if (image) {
      image.src = imageURL;
      image.alt = "Selected image preview";
    }

    if (preview) preview.hidden = false;

    if (name) {
      name.textContent =
        `${file.name} · ${formatFileSize(file.size)}`;
    }

    if (analyze) analyze.disabled = false;

    hideStatus();
    clearResults();
  }

  input.addEventListener("change", () => {
    handleImage(input.files?.[0]);
  });

  if (remove) {
    remove.addEventListener("click", clearImage);
  }

  setupDropZone(input, handleImage);
}

/* 7. VIDEO UPLOAD */

function initVideoUpload() {
  const input = document.getElementById("video-file");
  const preview = document.getElementById("video-preview");
  const video = document.getElementById("video-preview-player");
  const name = document.getElementById("video-file-name");
  const remove = document.getElementById("remove-video");
  const analyze = document.getElementById("analyze-video");

  if (!input) return;

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
    clearResults();
  }

  function handleVideo(file) {
    if (!file) return;

    const validExtension =
      /\.(mp4|webm|mov|m4v)$/i.test(file.name);

    if (!ALLOWED_VIDEOS.includes(file.type) && !validExtension) {
      clearVideo();
      showStatus("Please select an MP4, WEBM or MOV video.", "error");
      return;
    }

    if (!file.size || file.size > FILE_LIMITS.video) {
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
      name.textContent =
        `${file.name} · ${formatFileSize(file.size)}`;
    }

    // Enable after valid video selection.
    if (analyze) {
      analyze.disabled = false;
      analyze.removeAttribute("aria-disabled");
    }

    hideStatus();
    clearResults();
  }

  input.addEventListener("change", () => {
    handleVideo(input.files?.[0]);
  });

  if (remove) {
    remove.addEventListener("click", clearVideo);
  }

  setupDropZone(input, handleVideo);
}

/* 8. DRAG AND DROP */

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
    zone.classList.add("drag-over");
  });

  zone.addEventListener("dragleave", (event) => {
    if (!zone.contains(event.relatedTarget)) {
      zone.classList.remove("drag-over");
    }
  });

  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("drag-over");

    const file = event.dataTransfer?.files?.[0];

    if (file) onSelect(file);
  });
}

/* 9. RESULTS CLEANUP */

function clearResults() {
  const results = document.getElementById("results-section");
  const content = document.getElementById("results-content");

  if (results) results.hidden = true;
  if (content) content.replaceChildren();
}

/* 10. FOOTER YEAR */

function initFooterYear() {
  const currentYear = String(new Date().getFullYear());
  const year = document.getElementById("current-year");

  if (year) year.textContent = currentYear;

  document.querySelectorAll("[data-current-year]").forEach((element) => {
    element.textContent = currentYear;
  });
}

/* 11. ACCESSIBILITY */

function initAccessibility() {
  const menu = document.getElementById("mobile-menu-button");

  if (menu) {
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

/* 12. SERVICE WORKER */

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

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

/* 13. RESOURCE CLEANUP */

window.addEventListener("beforeunload", () => {
  releaseURL("image");
  releaseURL("video");
});
