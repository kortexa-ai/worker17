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
          
          let fileContent = code;
          
          // Special handling for package.json - always read from server directory
          if (baseName === 'package.json') {
            const packageJsonPath = path.resolve(__dirname, 'server/package.json');
            if (fs.existsSync(packageJsonPath)) {
              console.log(`Reading package.json from server: ${packageJsonPath}`);
              fileContent = fs.readFileSync(packageJsonPath, 'utf-8');
            }
          }
          // For server files, check if there's a built version in dist
          else if (baseName.endsWith('.js')) {
            // First, check if it's one of the standard server files
            const serverDistBase = path.resolve(__dirname, 'server/dist');
            const serverFilePath = `${serverDistBase}/${baseName}`;
            const serverRelativePath = baseName.replace('.js', '');
            
            // Try different patterns to find the file - direct match, nested in subfolder
            const possiblePaths = [
              serverFilePath,
              `${serverDistBase}/${serverRelativePath}.js`,
              `${serverDistBase}/${serverRelativePath}/index.js`
            ];
            
            // For known files in subfolders, add those possibilities
            if (serverRelativePath.indexOf('/') === -1) {
              // For standard modules without subfolder in name, check different subfolders
              ['config', 'routes', 'utils', 'middleware'].forEach(subfolder => {
                possiblePaths.push(`${serverDistBase}/${subfolder}/${serverRelativePath}.js`);
              });
            }
            
            // Try finding the file
            let foundPath = null;
            for (const testPath of possiblePaths) {
              if (fs.existsSync(testPath)) {
                foundPath = testPath;
                break;
              }
            }
            
            if (foundPath) {
              console.log(`Reading server file from: ${foundPath}`);
              fileContent = fs.readFileSync(foundPath, 'utf-8');
            } else {
              console.log(`No server dist file found for ${baseName}, using asset file`);
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
