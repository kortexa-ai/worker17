/// <reference types="vite/client" />
/// <reference types="vite-plugin-glsl/ext" />

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ImportMetaEnv {
    // Add environment variables here if needed
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
