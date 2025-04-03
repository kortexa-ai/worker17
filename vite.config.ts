import path from "path"
import mkcert from 'vite-plugin-mkcert'
import react from "@vitejs/plugin-react-swc"
import tailwindcss from '@tailwindcss/vite'
import glsl from 'vite-plugin-glsl'

import { defineConfig, type Plugin } from 'vite'

import fs from 'fs';

// Custom plugin for .wcfile extension (WebContainer files)
const wcfilePlugin = (): Plugin => {
  return {
    name: 'vite-plugin-wcfile',
    async transform(code, id) {
      if (id.endsWith('.wcfile')) {
        try {
          // Extract the filename from the .wcfile path
          const parts = id.split('/');
          const filename = parts[parts.length - 1];
          const baseName = filename.replace('.wcfile', '');

          // Map to potential server locations
          const serverMappings: Record<string, string> = {
            'package.json': path.resolve(__dirname, 'server/package.json'),
            'server.js': path.resolve(__dirname, 'server/src/server.ts'),
            // Add mappings for other files here
          };

          let fileContent = code;

          // Check if we have a mapping for this file
          if (serverMappings[baseName]) {
            const serverFilePath = serverMappings[baseName];

            // Check if the server file exists
            if (fs.existsSync(serverFilePath)) {
              console.log(`Reading ${baseName} from server file: ${serverFilePath}`);

              // Read the content from the server file
              fileContent = fs.readFileSync(serverFilePath, 'utf-8');

              // Special handling for server.ts -> server.js transformation
              if (baseName === 'server.js') {
                // Transform TypeScript imports to JS imports
                fileContent = fileContent
                  .replace(/import .* from ['"](.*)\.js['"];/g, 'import * from "$1.js";')
                  // Convert .ts imports to .js for WebContainer (ESM requires file extensions)
                  .replace(/from ['"](.*)\.ts['"];/g, 'from "$1.js";');
              }
            } else {
              console.log(`Server file not found for ${baseName}, using asset file`);
            }
          }

          // Return the file content as a string
          return {
            code: `export default ${JSON.stringify(fileContent)};`,
            map: null
          };
        } catch (error) {
          console.error(`Error processing ${id}:`, error);
          // If there's an error, fall back to the original code
          return {
            code: `export default ${JSON.stringify(code)};`,
            map: null
          };
        }
      }
    }
  };
};

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
        wcfilePlugin(),
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
        },
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.wcfile']
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
