// Registers the service worker (public/sw.js) so the app works offline after the first visit.
// The URL is relative so it also works under a sub-path such as GitHub Pages.
export function registerServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
