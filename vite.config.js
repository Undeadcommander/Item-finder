import { defineConfig } from "vite";
export default defineConfig({
  optimizeDeps: {
    include: [
      "three",
      "three/addons/controls/OrbitControls.js",
      "three/addons/loaders/GLTFLoader.js",
      "three/addons/loaders/OBJLoader.js",
    ],
  },
});
