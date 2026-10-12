// Shared local assets and SVG vocabulary. No third-party runtime dependencies.
const paths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 5h2m4 0h2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  building:
    '<path d="M4 21V5l8-3 8 3v16M8 8h2m4 0h2m-8 4h2m4 0h2m-8 4h2m4 0h2M2 21h20"/>',
  chart: '<path d="M4 3v18h17M8 16v-5m5 5V6m5 10v-8"/>',
  wallet:
    '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M17 11h4v5h-4a2.5 2.5 0 0 1 0-5M4 5l13-3v3"/>',
  bell: '<path d="M5 9a7 7 0 0 1 14 0v6l2 3H3l2-3V9m4 12h6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3h.01"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13m0-13C5 8 6 2 9 3c2 0 3 5 3 5Zm0 0c7 0 6-6 3-5-2 0-3 5-3 5Z"/>',
  bag: '<path d="M5 7h14l2 14H3L5 7Zm3 0V5a4 4 0 0 1 8 0v2"/>',
  tools: '<path d="m14 6 4-4 4 4-4 4m-4-4 4 4M4 20l8-8m-6-2-4 4 4 4 4-4"/>',
  football:
    '<circle cx="12" cy="12" r="9"/><path d="m12 7 5 4-2 6H9l-2-6 5-4Zm0 0V3m5 8 4-2m-6 8 2 3m-8-3-2 3m0-9L3 9"/>',
  racket:
    '<ellipse cx="14" cy="9" rx="6" ry="7" transform="rotate(30 14 9)"/><path d="m10 15-6 7m8-17 7 6m-9-2 6 5"/>',
  basketball:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M6 5c9 6 9 8 0 14M18 5c-9 6-9 8 0 14"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
};
export function icon(name = "grid") {
  return `<svg class="n01-icon" aria-hidden="true" viewBox="0 0 24 24">${paths[name] || paths.grid}</svg>`;
}
const sports = {
  "bong-da": "football",
  "cau-long": "badminton",
  tennis: "tennis",
  "bong-ro": "basketball",
  pickleball: "pickleball",
};
export const sportImage = (slug, small = false) =>
  `/assets/${sports[slug] || "tennis"}${small ? "-640" : ""}.webp`;
export const sportIcon = (slug) =>
  icon(
    slug === "bong-da"
      ? "football"
      : slug === "bong-ro"
        ? "basketball"
        : slug
          ? "racket"
          : "grid",
  );
// An unavailable owner photo must never leave a broken image in the card.
document.addEventListener(
  "error",
  (event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.fallback) return;
    img.removeAttribute("srcset");
    img.src = img.dataset.fallback;
    delete img.dataset.fallback;
    img.alt = "Hình ảnh minh họa bộ môn thể thao";
    const label = img.parentElement.querySelector(".photo-disclaimer");
    if (label) label.hidden = false;
  },
  true,
);
