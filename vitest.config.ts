import { defineConfig, mergeConfig } from 'vitest/config'
import type { UserConfig } from 'vite'
import viteConfig from './vite.config'

export default mergeConfig(
    viteConfig as UserConfig,
    defineConfig({
        test: {
            environment: 'jsdom',
        },
    })
)