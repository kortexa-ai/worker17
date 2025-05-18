import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";
import {
    PROJECTS,
    getProjectPath,
    getDependentProjects,
} from "./project-config";
import { consoleStyles } from "./console-utils";

/**
 * Updates the package.json with the correct version for a local package
 */
function updatePackageVersions(
    packages: { name: string; path: string }[]
): boolean {
    try {
        const currentPackageJson = resolve("./package.json");
        const currentPkg = JSON.parse(
            readFileSync(currentPackageJson, "utf-8")
        );
        let wasUpdated = false;

        for (const pkg of packages) {
            const packageJsonPath = resolve(pkg.path, "package.json");
            if (!existsSync(packageJsonPath)) {
                console.log(
                    `${consoleStyles.warning(
                        "⚠️"
                    )} No package.json found at ${packageJsonPath}`
                );
                continue;
            }

            const packageVersion = JSON.parse(
                readFileSync(packageJsonPath, "utf-8")
            ).version;
            const newDependencyVersion = `^${packageVersion}`;

            // Helper to update dependencies
            const updateDeps = (
                deps: Record<string, string> | undefined,
                type: string
            ) => {
                if (deps && pkg.name in deps) {
                    if (deps[pkg.name] !== newDependencyVersion) {
                        console.log(
                            `  ${consoleStyles.info(
                                "↻"
                            )} Updating ${type} ${consoleStyles.highlight(
                                pkg.name
                            )} to version ${consoleStyles.highlight(
                                newDependencyVersion
                            )}`
                        );
                        deps[pkg.name] = newDependencyVersion;
                        return true;
                    }
                }
                return false;
            };

            wasUpdated =
                updateDeps(currentPkg.dependencies, "dependencies") ||
                wasUpdated;
            wasUpdated =
                updateDeps(currentPkg.devDependencies, "devDependencies") ||
                wasUpdated;
        }

        if (wasUpdated) {
            writeFileSync(
                currentPackageJson,
                JSON.stringify(currentPkg, null, 2) + "\n"
            );
        }

        return wasUpdated;
    } catch (error) {
        console.error(
            `  ${consoleStyles.error("✗")} Error updating packages: ${
                error instanceof Error ? error.message : String(error)
            }`
        );
        return false;
    }
}

/**
 * Main post-install function that links all configured packages
 */
async function runPostInstall() {
    try {
        console.log(
            consoleStyles.info("🔨 Executing post-installation script...")
        );

        console.log(
            consoleStyles.info("\n🔍 Scanning for local dependencies...")
        );

        // Only process projects that are actual dependencies
        const packagesToProcess = getDependentProjects(PROJECTS);
        const depCount = packagesToProcess.length;

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
                } in package.json`
            )
        );

        // Filter out packages that don't exist
        const existingPackages = packagesToProcess
            .map((pkg) => ({
                name: pkg.name,
                path: getProjectPath(pkg),
                config: pkg,
            }))
            .filter((pkg) => {
                const exists = existsSync(pkg.path);
                if (!exists) {
                    console.log(
                        `  ${consoleStyles.warning(
                            "⚠️"
                        )} ${consoleStyles.skippedProject(
                            pkg.name
                        )} not found at ${pkg.path}`
                    );
                } else {
                    console.log(
                        `  ${consoleStyles.success(
                            "✓"
                        )} Found local package: ${consoleStyles.project(
                            pkg.name
                        )}`
                    );
                }
                return exists;
            });

        if (existingPackages.length === 0) {
            console.log(
                consoleStyles.warning(
                    "\nℹ️  No valid local packages found to link"
                )
            );
            return;
        }

        // Update package versions in the current project
        console.log(
            consoleStyles.info(
                "\n🔄 Updating package versions in current project..."
            )
        );
        const versionsUpdated = updatePackageVersions(existingPackages);
        console.log(
            versionsUpdated
                ? consoleStyles.success(
                      "\n✓ Package versions updated successfully"
                  )
                : consoleStyles.info(
                      "\nℹ️  All package versions are up to date"
                  )
        );

        // Step 1: Create global symlinks for each package
        console.log(consoleStyles.info("\n🔗 Creating global symlinks..."));
        const linkedPackages: string[] = [];

        for (const pkg of existingPackages) {
            try {
                console.log(
                    `  ${consoleStyles.info(
                        "•"
                    )} Creating symlink for ${consoleStyles.project(pkg.name)}`
                );
                execSync("npm link --ignore-scripts", {
                    stdio: "pipe", // Suppress npm link output
                    cwd: pkg.path,
                    env: { ...process.env, FORCE_COLOR: "1" },
                });
                linkedPackages.push(pkg.name);
                console.log(
                    `  ${consoleStyles.success(
                        "✓"
                    )} Created symlink for ${consoleStyles.successProject(
                        pkg.name
                    )}`
                );
            } catch (error) {
                console.error(
                    `  ${consoleStyles.error(
                        "✗"
                    )} Failed to create symlink for ${consoleStyles.errorProject(
                        pkg.name
                    )}: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
            }
        }

        if (linkedPackages.length === 0) {
            console.log(
                consoleStyles.warning(
                    "\n⚠️  No packages were linked. Check for errors above."
                )
            );
            return;
        }

        // Step 2: Link all packages to the current project
        console.log(
            consoleStyles.info(
                `\n🔌 Linking ${linkedPackages.length} package${
                    linkedPackages.length === 1 ? "" : "s"
                } to current project...`
            )
        );
        try {
            const packagesToLink = linkedPackages.join(" ");
            execSync(`npm link ${packagesToLink} --ignore-scripts`, {
                stdio: "pipe", // Suppress npm link output
                env: { ...process.env, FORCE_COLOR: "1" },
            });

            console.log("\n" + "─".repeat(50));
            console.log(
                consoleStyles.success(
                    `✅ Successfully linked ${linkedPackages.length} package${
                        linkedPackages.length === 1 ? "" : "s"
                    }:`
                )
            );
            linkedPackages.forEach((pkg) => {
                console.log(
                    `  ${consoleStyles.success(
                        "•"
                    )} ${consoleStyles.successProject(pkg)}`
                );
            });
            console.log("─".repeat(50));
            console.log(
                consoleStyles.success("✨ Post-install completed successfully!")
            );
        } catch (error) {
            console.error(
                consoleStyles.error(
                    "❌ Failed to link packages to current project:"
                ),
                error instanceof Error ? error.message : String(error)
            );
            console.log(
                consoleStyles.info(
                    "\nYou can try running the following command manually:"
                )
            );
            console.log(
                "  npm link --ignore-scripts",
                linkedPackages.join(" ")
            );
            console.log("─".repeat(50));
            console.log(
                consoleStyles.error("❌ Post-install completed with errors")
            );
        }
    } catch (error) {
        console.log("─".repeat(50));
        console.error(
            consoleStyles.error("❌ Post-install failed:"),
            error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
    }
}

runPostInstall();
