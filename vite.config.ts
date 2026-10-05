import { defineConfig } from "vite";

/*
 * The site is served from https://igorcsis.github.io/job-cost-odd-one-out/,
 * so every emitted asset path has to carry that prefix or the page loads a
 * blank shell with four 404s behind it.
 */
export default defineConfig({
  base: "/job-cost-odd-one-out/",
  build: {
    target: "es2020",
    // The page declares a strict Content-Security-Policy with no
    // 'unsafe-inline'. Vite's module-preload polyfill is an inline script, so
    // it would be blocked and the console would fill with violations. Turning
    // it off costs nothing here: every browser that can run an ES module and
    // reach this page already supports modulepreload or ignores it harmlessly.
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
  },
});
