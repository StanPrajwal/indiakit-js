import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Relative base so the built demo works both locally and under /indiakit-js/ on GitHub Pages.
export default defineConfig({ plugins: [react()], base: "./" });
