/**
 * Minimal ambient types for the Pannellum UMD build used by the isolated 360
 * preview page (`components/preview/three-sixty/`).
 *
 * Pannellum publishes no type declarations. Its build is a UMD script that
 * attaches itself to `window.pannellum` as a side effect. The preview page
 * loads that script from `/public/vista-360/pannellum.js` at runtime (a
 * dynamic `<script>` tag) instead of importing it as a module, so it never
 * participates in TypeScript module resolution.
 */

declare global {
  interface Window {
    pannellum?: unknown;
  }
}

export {};