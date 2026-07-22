/** Enforces immutable workflow dependencies and a single canonical pnpm version source. */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const packageJsonPath = join(rootDir, "package.json");
const workflowsDir = join(rootDir, ".github", "workflows");

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const packageManager = packageJson.packageManager;

if (typeof packageManager !== "string" || !packageManager.startsWith("pnpm@")) {
	process.exit(0);
}

if (!existsSync(workflowsDir)) {
	process.exit(0);
}

const immutableReferenceViolations = [];
const pnpmVersionViolations = [];

for (const fileName of readdirSync(workflowsDir)) {
	if (!fileName.endsWith(".yml") && !fileName.endsWith(".yaml")) {
		continue;
	}

	const filePath = join(workflowsDir, fileName);
	const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		const line = lines[lineIndex];
		const usesMatch = line?.match(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/);
		if (usesMatch) {
			const actionReference = usesMatch[1];
			if (!actionReference.startsWith("./") && !actionReference.startsWith("docker://")) {
				const separatorIndex = actionReference.lastIndexOf("@");
				const revision =
					separatorIndex === -1 ? "" : actionReference.slice(separatorIndex + 1).toLowerCase();

				if (!/^[0-9a-f]{40}$/.test(revision)) {
					immutableReferenceViolations.push(`${fileName}:${lineIndex + 1}`);
				}
			}
		}

		if (!line?.includes("pnpm/action-setup")) {
			continue;
		}

		const stepIndent = line.match(/^(\s*)/)?.[1].length ?? 0;

		for (let cursor = lineIndex + 1; cursor < lines.length; cursor++) {
			const candidate = lines[cursor];
			if (!candidate) {
				continue;
			}

			const trimmed = candidate.trim();
			if (trimmed.length === 0) {
				continue;
			}

			const indent = candidate.match(/^(\s*)/)?.[1].length ?? 0;
			if (indent <= stepIndent && !trimmed.startsWith("#")) {
				break;
			}

			if (/^\s*version\s*:/.test(candidate)) {
				pnpmVersionViolations.push(`${fileName}:${cursor + 1}`);
			}
		}
	}
}

if (immutableReferenceViolations.length > 0 || pnpmVersionViolations.length > 0) {
	const diagnostics = [];

	if (immutableReferenceViolations.length > 0) {
		diagnostics.push(
			"External GitHub Actions must be pinned to immutable 40-character commit SHAs.",
			...immutableReferenceViolations.map((location) => `- ${location}`),
		);
	}

	if (pnpmVersionViolations.length > 0) {
		diagnostics.push(
			"Found pnpm/action-setup version fields while packageManager is set in package.json.",
			"Remove the workflow `with.version` entries to avoid pnpm version conflicts.",
			...pnpmVersionViolations.map((location) => `- ${location}`),
		);
	}

	console.error(diagnostics.join("\n"));
	process.exit(1);
}
