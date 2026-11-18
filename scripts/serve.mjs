import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".wasm": "application/wasm",
  ".sqlite": "application/octet-stream",
};
http
  .createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url, "http://localhost");
      const pathname = decodeURIComponent(requestUrl.pathname);
      if (pathname === "/preview-fetch") {
        const target = new URL(requestUrl.searchParams.get("url"));
        const allowed =
          target.protocol === "https:" &&
          (target.href ===
            "https://api.github.com/repos/chungcy00/SQLIsland/releases/latest" ||
            (target.hostname === "github.com" &&
              target.pathname.startsWith(
                "/chungcy00/SQLIsland/releases/download/",
              )));
        if (!allowed) {
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }
        try {
          const upstream = await fetch(target, {
            headers: { "User-Agent": "ShuyuSQL-local-preview" },
            signal: AbortSignal.timeout(20000),
          });
          const data = await upstream.arrayBuffer();
          if (data.byteLength > 1024 * 1024)
            throw Error("Update metadata too large");
          res.writeHead(upstream.status, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          });
          res.end(Buffer.from(data));
        } catch {
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ message: "更新服务暂时不可用" }));
        }
        return;
      }
      const file = path.resolve(
        "dist",
        "." + (pathname === "/" ? "/index.html" : pathname),
      );
      if (!file.startsWith(path.resolve("dist") + path.sep)) throw Error();
      const data = await readFile(file);
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(4173, "127.0.0.1", () => console.log("http://127.0.0.1:4173"));
