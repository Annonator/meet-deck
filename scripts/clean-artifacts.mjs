import { rm } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const artifactRoot = path.join(repositoryRoot, "artifacts");

await rm(artifactRoot, { force: true, recursive: true });
