// Ritmo 180 — servidor HTTP: entrega a interface (public/). Todos os dados são fictícios e ficam no cliente.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 5180);
const PUBLIC_DIR = join(fileURLToPath(new URL(".", import.meta.url)), "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

async function serveStatic(res, url) {
  const rel = normalize(url.pathname === "/" ? "/index.html" : url.pathname).replace(/^(\.\.[/\\])+/, "");
  const file = join(PUBLIC_DIR, rel);
  try {
    if (!file.startsWith(PUBLIC_DIR)) throw new Error("fora de public/");
    const data = await readFile(file);
    // no-cache: o navegador revalida a cada carga, para módulos ES nunca ficarem misturados entre versões.
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(data);
  } catch {
    res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-cache" });
    res.end(await readFile(join(PUBLIC_DIR, "index.html")));
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method !== "GET") {
      res.writeHead(405).end();
      return;
    }
    await serveStatic(res, url);
  } catch (error) {
    console.error(`Erro em ${req.method} ${url.pathname}:`, error);
    res.writeHead(500).end();
  }
});

server.listen(PORT, () => {
  console.log(`Ritmo 180 rodando em http://localhost:${PORT}`);
});
