import { existsSync } from "fs";
import { execSync } from "child_process";
import type { ProjectConfig } from "./project-config";
import {
    PROJECTS,
    getProjectPath,
    getDependentProjects,
} from "./project-config";
import { consoleStyles } from "./console-utils";

/**
 * Builds a single project
 */
async function buildProject(project: ProjectConfig): Promise<boolean> {
    const projectPath = getProjectPath(project);
    const buildCommand = project.buildCommand || "npm run build";

    if (!existsSync(projectPath)) {
        console.log(
            `  ${consoleStyles.warning("⚠️")} ${consoleStyles.skippedProject(
                project.name
            )} not found at ${projectPath}`
        );
        return true;
    }

    console.log(
        `\n  ${consoleStyles.info("•")} Building ${consoleStyles.project(
            project.name
        )}...`
    );
    try {
        // Capture output but still show it in real-time
        execSync(buildCommand, {
            stdio: "inherit",
            cwd: projectPath,
            env: { ...process.env, FORCE_COLOR: "1" },
        });
        console.log(
            `\n  ${consoleStyles.success("✓")} ${consoleStyles.successProject(
                project.name
            )} built successfully!`
        );
        return true;
    } catch (error) {
        console.error(
            `\n  ${consoleStyles.error(
                "✗"
            )} Build failed for ${consoleStyles.errorProject(project.name)}: ${
                error instanceof Error ? error.message : String(error)
            }`
        );
        return false;
    }
}

/**
 * Main pre-build function that builds all configured projects
 */
async function runPreBuild() {
    try {
        console.log(consoleStyles.info("🔨 Starting pre-build process..."));

        // Only process projects that are actual dependencies
        console.log(
            consoleStyles.info(
                "\n🔍 Scanning for local dependencies that need building..."
            )
        );
        const projectsToBuild = getDependentProjects(PROJECTS);
        const depCount = projectsToBuild.length;

        if (depCount === 0) {
            console.log(
                consoleStyles.info(
                    "\nℹ️  No local dependencies found that need building"
                )
            );
            return;
        }

        console.log(
            consoleStyles.info(
                `\n📦 Found ${depCount} local ${
                    depCount === 1 ? "dependency" : "dependencies"
                } that need${depCount === 1 ? "s" : ""} building:`
            )
        );

        projectsToBuild.forEach((project) => {
            console.log(
                `  ${consoleStyles.info("•")} ${consoleStyles.project(
                    project.name
                )}`
            );
        });

        console.log(consoleStyles.info("\n🏗️  Starting build process..."));
        const results = await Promise.all(
            projectsToBuild.map((project) => buildProject(project))
        );

        const builtCount = results.filter((success) => success).length;
        const failedCount = results.length - builtCount;

        console.log("\n" + "─".repeat(50));

        if (builtCount > 0) {
            console.log(
                consoleStyles.success(
                    `✅ Successfully built ${builtCount} package${
                        builtCount === 1 ? "" : "s"
                    }:`
                )
            );
            results.forEach((success, i) => {
                if (success) {
                    console.log(
                        `  ${consoleStyles.success(
                            "•"
                        )} ${consoleStyles.successProject(
                            projectsToBuild[i].name
                        )}`
                    );
                }
            });
        }

        if (failedCount > 0) {
            console.log(
                consoleStyles.warning(
                    `⚠️  ${failedCount} package${
                        failedCount === 1 ? "" : "s"
                    } failed to build:`
                )
            );
            results.forEach((success, i) => {
                if (!success) {
                    console.log(
                        `  ${consoleStyles.error(
                            "✗"
                        )} ${consoleStyles.errorProject(
                            projectsToBuild[i].name
                        )}`
                    );
                }
            });
            console.log(
                consoleStyles.info(
                    "\nCheck the build output above for error details."
                )
            );
        }

        console.log("─".repeat(50));
        if (failedCount > 0) {
            console.log(
                consoleStyles.error("❌ Pre-build completed with errors")
            );
            process.exit(1);
        } else if (builtCount > 0) {
            console.log(
                consoleStyles.success("✨ Pre-build completed successfully!")
            );
        }
    } catch (error) {
        console.log("─".repeat(50));
        console.error(
            "❌ Pre-build failed:",
            error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
    }
}

runPreBuild();
