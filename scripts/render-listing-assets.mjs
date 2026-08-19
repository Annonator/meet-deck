import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const sourcePath = "marketplace/assets/source/artboards.html";
const exportRoot = path.join(repositoryRoot, "marketplace/assets/export");
const playwrightExecutable = process.env.PLAYWRIGHT_CLI ?? "playwright-cli";
// Keep this short: macOS limits Unix-domain socket paths used by playwright-cli.
const sessionName = `md-${process.pid}`;
const renderScratch = await mkdtemp(path.join(tmpdir(), "meet-deck-listing-"));

const assets = [
  { name: "app-icon", file: "meet-deck-app-icon.png", width: 288, height: 288 },
  { name: "thumbnail", file: "meet-deck-thumbnail.png", width: 1920, height: 960 },
  {
    name: "gallery-01-controls",
    file: "meet-deck-gallery-01-controls.png",
    width: 1920,
    height: 960
  },
  {
    name: "gallery-02-pairing",
    file: "meet-deck-gallery-02-pairing.png",
    width: 1920,
    height: 960
  },
  {
    name: "gallery-03-privacy",
    file: "meet-deck-gallery-03-privacy.png",
    width: 1920,
    height: 960
  }
];

await access(path.join(repositoryRoot, sourcePath));
await mkdir(exportRoot, { recursive: true });

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const requestPath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const filePath = path.resolve(repositoryRoot, requestPath);
    const relativePath = path.relative(repositoryRoot, filePath);

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    const content = await readFile(filePath);
    response.setHeader("Content-Type", contentType(filePath));
    response.setHeader("Cache-Control", "no-store");
    response.writeHead(200).end(content);
  } catch (error) {
    const status = error?.code === "ENOENT" ? 404 : 500;
    response.writeHead(status).end(status === 404 ? "Not found" : "Render server error");
  }
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

const address = server.address();
if (address === null || typeof address === "string") {
  throw new Error("Could not determine the local listing-artboard server port.");
}

const sourceUrl = `http://127.0.0.1:${address.port}/${sourcePath}`;

try {
  for (const asset of assets) {
    const outputPath = path.join(exportRoot, asset.file);
    await rm(outputPath, { force: true });
    await runPlaywright(["--session", sessionName, "open", `${sourceUrl}?asset=${asset.name}`]);
    await runPlaywright([
      "--session",
      sessionName,
      "resize",
      String(asset.width),
      String(asset.height)
    ]);
    await runPlaywright([
      "--session",
      sessionName,
      "run-code",
      "await Promise.all([...document.images].map((image) => image.decode()))"
    ]);
    await runPlaywright(["--session", sessionName, "screenshot", "--filename", asset.file]);
    await copyFile(path.join(renderScratch, ".playwright-cli", asset.file), outputPath);
    console.log(
      `Rendered ${path.relative(repositoryRoot, outputPath)} (${asset.width}x${asset.height})`
    );
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
  await runPlaywright(["session-delete", sessionName], { allowFailure: true });
  await rm(renderScratch, { force: true, recursive: true });
}

await run(process.execPath, [path.join(repositoryRoot, "scripts/validate-listing-assets.mjs")]);

function contentType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

async function runPlaywright(arguments_, options = {}) {
  try {
    await run(playwrightExecutable, arguments_, { ...options, cwd: renderScratch });
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(
        "playwright-cli is required to render listing assets. Install it or set PLAYWRIGHT_CLI to its executable path.",
        { cause: error }
      );
    }
    throw error;
  }
}

function run(command, arguments_, { allowFailure = false, cwd = repositoryRoot } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0 || allowFailure) {
        resolve({ stdout, stderr });
        return;
      }

      const detail = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
      reject(
        new Error(
          `${command} ${arguments_.join(" ")} failed${signal === null ? ` with status ${code}` : ` after ${signal}`}${detail ? `:\n${detail}` : ""}`
        )
      );
    });
  });
}
