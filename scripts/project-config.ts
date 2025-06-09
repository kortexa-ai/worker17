import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type PackageJson = {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
};

export type ProjectConfig = {
    name: string; // Package name (e.g., '@kortexa-ai/auth')
    directory: string; // Directory name (relative to parent)
    buildCommand?: string; // Optional: custom build command (default: 'npm run build')
};

// Shared configuration for all projects
export const PROJECTS: ProjectConfig[] = [
    {
        name: "@kortexa-ai/auth",
        directory: "auth",
    },
    {
        name: "@kortexa-ai/react-multimodal",
        directory: "react-multimodal",
    },
    {
        name: "@kortexa-ai/react-shadertoy",
        directory: "react-shadertoy",
    },
    {
        name: "@kortexa-ai-private/ui",
        directory: "kortexa-ui",
    },
];

/**
 * Gets the absolute path for a project directory
 */
export function getProjectPath(project: ProjectConfig): string {
    return resolve("..", project.directory);
}

/**
 * Gets the list of project names that are actual dependencies in package.json
 */
export function getDependentProjects(
    projects: ProjectConfig[]
): ProjectConfig[] {
    try {
        const packageJsonPath = resolve("./package.json");
        if (!existsSync(packageJsonPath)) {
            console.log("ℹ️ No package.json found, using all projects");
            return projects;
        }

        const packageJson: PackageJson = JSON.parse(
            readFileSync(packageJsonPath, "utf-8")
        );
        const allDeps = new Set([
            ...Object.keys(packageJson.dependencies || {}),
            ...Object.keys(packageJson.devDependencies || {}),
            ...Object.keys(packageJson.peerDependencies || {}),
        ]);

        return projects.filter((project) => allDeps.has(project.name));
    } catch (error) {
        console.error(
            "❌ Error reading package.json:",
            error instanceof Error ? error.message : String(error)
        );
        return projects; // Return all projects if there's an error
    }
}
