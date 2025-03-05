# Worker17 Development Guide

## Build and Test Commands
- Dev server: `npm run dev` or `npm run start`
- Production build: `npm run build`
- Lint: `npm run lint` (fix with `npm run lint:fix`)
- Typecheck: `npm run typecheck`
- Run all tests: `npm run test`
- Run single test: `npx vitest run src/path/to/file.test.tsx`
- Watch tests: `npm run test:watch`
- Full validation: `npm run validate`

## Code Style Guidelines
- TypeScript strict mode with explicit typing (no `any`)
- Module imports: type imports (`import type {}`) are preferred
- React components: functional components with hooks
- Naming: PascalCase for components, camelCase for functions/variables
- Error handling: prefer explicit error handling, no swallowed exceptions
- Unused vars: prefix with underscore (_var) to ignore
- Component exports: use default exports for components

## Project Structure
- React 19 with Vite, TypeScript, and Tailwind CSS
- Tests use Vitest and React Testing Library
- Three.js/React Three Fiber for 3D rendering
- ESLint for code quality with strict rules

## Model Context Protocol (MCP)
- Documentation: Located in `/docs/mcp-full.txt`
- Standard for applications to provide context to LLMs
- Enables integration between LLMs and tools, data sources
- Key primitives: resources, tools, prompts