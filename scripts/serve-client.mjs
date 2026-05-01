import { createReadStream, existsSync } from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const distRoot = path.join(projectRoot, "client", "dist");
const port = Number(process.env.CLIENT_PORT ?? 5184);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".mjs", "application/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"]
]);

function sendFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    "content-type": mimeTypes.get(extension) ?? "application/octet-stream"
  });

  createReadStream(filePath).pipe(response);
}

async function resolveFilePath(requestUrl) {
  const pathname = new URL(requestUrl, `http://localhost:${port}`).pathname;
  const safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const candidate = path.join(distRoot, safePath === path.sep ? "index.html" : safePath);

  if (existsSync(candidate)) {
    return candidate;
  }

  return path.join(distRoot, "index.html");
}

async function ensureDistExists() {
  try {
    await fsp.access(path.join(distRoot, "index.html"));
  } catch {
    throw new Error("Client build output was not found. Run the client build before starting the static UI server.");
  }
}

export async function startStaticClientServer() {
  await ensureDistExists();

  const server = http.createServer(async (request, response) => {
    try {
      const filePath = await resolveFilePath(request.url ?? "/");
      sendFile(response, filePath);
    } catch (error) {
      response.writeHead(500, {
        "content-type": "text/plain; charset=utf-8"
      });
      response.end(`Failed to serve client: ${error.message}`);
    }
  });

  server.listen(port, () => {
    console.log(`MenuVerse AR Pipeline client available at http://localhost:${port}`);
  });

  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await startStaticClientServer();
}
