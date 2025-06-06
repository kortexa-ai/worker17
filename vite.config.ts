import path from "node:path";
import mkcert from "vite-plugin-mkcert";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import glsl from "vite-plugin-glsl";

import { defineConfig } from "vite";

import dotenv from "dotenv";
const nodeEnv = process.env.NODE_ENV ?? "development";
const envFiles = [
    `.env.${nodeEnv}.local`,
    `.env.${nodeEnv}`,
    ".env.local",
    ".env",
];

for (const file of envFiles) {
    dotenv.config({ path: file, override: true });
}

export default defineConfig({
    plugins: [mkcert(), react(), tailwindcss(), glsl()],
    optimizeDeps: {
        esbuildOptions: {
            tsconfig: "./tsconfig.app.json",
        },
        include: [
            "@kortexa-ai-private/ui > @kortexa-ai/auth",
            "@kortexa-ai-private/ui > @kortexa-ai/react-multimodal",
            "@kortexa-ai-private/ui > @kortexa-ai/react-shadertoy",
            "@kortexa-ai-private/ui > @kortexa-ai-private/core",
        ],
    },
    resolve: {
        dedupe: [
            "firebase",
            "react",
            "react-dom",
            "three",
            "@react-three/fiber",
            "@react-three/drei",
            "@react-three/rapier",
            "@react-three/xr",
            "@kortexa-ai/auth",
            "@kortexa-ai/react-multimodal",
            "@kortexa-ai/react-shadertoy",
            "@kortexa-ai-private/core",
            "@kortexa-ai-private/ui",
        ],
        alias: {
            "@": path.resolve(__dirname, "./src"),
            react: path.resolve(__dirname, "./node_modules/react"),
            "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
        },
        extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
    },
    build: {
        outDir: "./dist",
        chunkSizeWarningLimit: 2500,
        rollupOptions: {
            external: [],
            output: {
                manualChunks: {
                    "react-vendor": ["react", "react-dom", "react/jsx-runtime"],
                    "three-core": ["three"],
                    "three-libs-1": ["@react-three/fiber", "@react-three/drei"],
                    "three-libs-2": ["@react-three/rapier", "@react-three/xr"],
                    "ui-libs": [
                        "class-variance-authority",
                        "tailwind-merge",
                        "clsx",
                        "lucide-react",
                    ],
                    "kortexa-ai": [
                        "@kortexa-ai/auth",
                        "@kortexa-ai/react-multimodal",
                        "@kortexa-ai/react-shadertoy",
                    ],
                    "kortexa-ai-private": [
                        "@kortexa-ai-private/core",
                        "@kortexa-ai-private/ui",
                    ],
                },
            },
        },
    },
    server: {
        host: "0.0.0.0",
        port: Number.parseInt(
            process.env.VITE_DEVSERVER_PORT ??
                process.env.VITE_PREVIEW_PORT ??
                "8000",
            10
        ),
        open: true,
    },
    preview: {
        host: "0.0.0.0",
        port: Number.parseInt(
            process.env.VITE_PREVIEW_PORT ??
                process.env.VITE_DEVSERVER_PORT ??
                "8000",
            10
        ),
        open: true,
    },
});
