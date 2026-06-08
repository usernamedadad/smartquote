/**
 * 报价预览：渲染、缩放、拖拽排序、markDirty
 */
import { state } from "../state.js";
import { normalizeGalleryLayout, normalizeQuoteItems } from "../utils.js";
import { quoteBodyMarkup, normalizeQuoteLayout } from "../quote-template.js";
import { recordUndoSnapshot } from "../history.js";

let previewRenderFrame = 0;

export function markDirty() {
  state.dirty = true;
  if (state.activeProject?.data?.translation) {
    delete state.activeProject.data.translation;
  }
  const status = document.querySelector("#save-state");
  if (status) status.textContent = "未保存";
  const projectName = document.querySelector("#topbar-project-name");
  if (projectName) projectName.textContent = state.activeProject?.projectName || "";
  scheduleQuotePreviewRender();
}

function scheduleQuotePreviewRender() {
  if (previewRenderFrame) cancelAnimationFrame(previewRenderFrame);
  previewRenderFrame = requestAnimationFrame(() => {
    previewRenderFrame = 0;
    renderQuotePreview();
  });
}

export function renderQuotePreview() {
  if (previewRenderFrame) {
    cancelAnimationFrame(previewRenderFrame);
    previewRenderFrame = 0;
  }
  const preview = document.querySelector("#quote-preview");
  if (!preview || !state.activeProject) return;

  const data = state.activeProject.data;
  const translation = data.translation;
  const renderData = translation?.data || data;

  normalizeQuoteItems(data, state.products);
  normalizeGalleryLayout(data, state.images);
  const selectedImages = (data.selectedImageIds || [])
    .map((id) => state.images.find((image) => Number(image.id) === Number(id)))
    .filter(Boolean);

  const body = quoteBodyMarkup(renderData, selectedImages, "", {
    imageSrc: (img) => img.url,
    logoSrc: "/assets/logo.png",
    draggable: true,
    galleryClasses: "preview-gallery custom-gallery-layout",
    labels: translation?.labels,
  });

  const dir = translation?.rtl ? ' dir="rtl"' : "";
  preview.innerHTML = `<main class="sheet quote-sheet"${dir} aria-label="Quotation sheet">${body}</main>`;
  applyPreviewZoom();
  bindPreviewDragSorting(preview);
}

export function setPreviewZoom(value) {
  state.zoom = Math.max(0.35, Math.min(1.2, Number(value.toFixed(2))));
  applyPreviewZoom();
}

export function fitPreviewToPanel() {
  const scroll = document.querySelector(".preview-scroll");
  if (!scroll) return;
  const availableWidth = Math.max(320, scroll.clientWidth - 34);
  setPreviewZoom(availableWidth / 1024);
}

export function applyPreviewZoom() {
  const preview = document.querySelector("#quote-preview");
  const stage = document.querySelector(".preview-stage");
  const label = document.querySelector("[data-preview-zoom-label]");
  if (!preview || !stage) return;

  const sheet = preview.querySelector(".quote-sheet");
  const sheetHeight = sheet?.offsetHeight || 1536;
  preview.style.transform = `scale(${state.zoom})`;
  stage.style.width = `${Math.ceil(1024 * state.zoom)}px`;
  stage.style.height = `${Math.ceil(sheetHeight * state.zoom)}px`;
  if (label) label.textContent = `${Math.round(state.zoom * 100)}%`;
}

/* ---- 预览拖拽排序 ---- */

function bindPreviewDragSorting(preview) {
  preview.querySelectorAll("[data-preview-section]").forEach((section) => {
    section.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", `section:${section.dataset.previewSection}`);
      event.dataTransfer.effectAllowed = "move";
      state.previewDrag = { type: "section", id: section.dataset.previewSection };
      section.classList.add("is-dragging");
    });

    section.addEventListener("dragend", () => {
      state.previewDrag = null;
      section.classList.remove("is-dragging");
      preview.querySelectorAll(".is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
    });

    section.addEventListener("dragover", (event) => {
      if (state.previewDrag?.type !== "section") return;
      event.preventDefault();
      section.classList.add("is-drop-target");
    });

    section.addEventListener("dragleave", () => {
      section.classList.remove("is-drop-target");
    });

    section.addEventListener("drop", (event) => {
      if (state.previewDrag?.type !== "section") return;
      event.preventDefault();
      section.classList.remove("is-drop-target");
      swapPreviewItems("sections", state.previewDrag.id, section.dataset.previewSection);
    });
  });

  preview.querySelectorAll("[data-preview-party]").forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      event.stopPropagation();
      event.dataTransfer.setData("text/plain", `party:${card.dataset.previewParty}`);
      event.dataTransfer.effectAllowed = "move";
      state.previewDrag = { type: "party", id: card.dataset.previewParty };
      card.classList.add("is-dragging");
    });

    card.addEventListener("dragend", () => {
      state.previewDrag = null;
      card.classList.remove("is-dragging");
      preview.querySelectorAll(".is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
    });

    card.addEventListener("dragover", (event) => {
      if (state.previewDrag?.type !== "party") return;
      event.preventDefault();
      event.stopPropagation();
      card.classList.add("is-drop-target");
    });

    card.addEventListener("dragleave", () => {
      card.classList.remove("is-drop-target");
    });

    card.addEventListener("drop", (event) => {
      if (state.previewDrag?.type !== "party") return;
      event.preventDefault();
      event.stopPropagation();
      card.classList.remove("is-drop-target");
      swapPreviewItems("parties", state.previewDrag.id, card.dataset.previewParty);
    });
  });
}

function swapPreviewItems(layoutKey, sourceId, targetId) {
  if (!state.activeProject || !sourceId || !targetId || sourceId === targetId) return;
  normalizeQuoteLayout(state.activeProject.data);
  const items = state.activeProject.data.layout[layoutKey];
  const sourceIndex = items.indexOf(sourceId);
  const targetIndex = items.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  recordUndoSnapshot();
  [items[sourceIndex], items[targetIndex]] = [items[targetIndex], items[sourceIndex]];
  state.previewDrag = null;
  markDirty();
}
