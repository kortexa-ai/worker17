import path from "path"
import mkcert from 'vite-plugin-mkcert'
import react from "@vitejs/plugin-react-swc"
import tailwindcss from '@tailwindcss/vite'
import glsl from 'vite-plugin-glsl'

import { defineConfig } from 'vite'

import dotenv from 'dotenv';
const nodeEnv = process.env.NODE_ENV ?? 'development';
const envFiles = [
    `.env.${nodeEnv}.local`,
    `.env.${nodeEnv}`,
    '.env.local',
    '.env'
];

for (const file of envFiles) {
    dotenv.config({ path: file, override: true });
}

export default defineConfig({
    plugins: [
        mkcert(),
        react(),
        tailwindcss(),
        glsl(),
    ],
    optimizeDeps: {
        esbuildOptions: {
            tsconfig: './tsconfig.app.json'
        }
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, './src'),
            'react': path.resolve(__dirname, './node_modules/react'),
            'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
            '@kortexa-ai/core': path.resolve(__dirname, './node_modules/@kortexa-ai/core'),
        },
    },
    build: {
        outDir: './dist',
        chunkSizeWarningLimit: 2500,
        rollupOptions: {
            external: [],
            output: {
                manualChunks: {
                    'react-vendor': ['react', 'react-dom', 'react/jsx-runtime'],
                    'three-core': ['three'],
                    'three-libs-1': ['@react-three/fiber', '@react-three/drei'],
                    'three-libs-2': ['@react-three/rapier', '@react-three/xr'],
                    'ui-libs': ['class-variance-authority', 'tailwind-merge', 'clsx', 'lucide-react'],
                }
            }
        }
    },
    server: {
        host: "0.0.0.0",
        port: parseInt(process.env.VITE_DEVSERVER_PORT ?? "8000", 10),
        open: false,
    },
})
