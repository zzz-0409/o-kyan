const fs = require("fs");
const http = require("http");
const path = require("path");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 8789);
const host = process.env.HOST || "127.0.0.1";
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json"
};

function resolveRequestPath(urlPath) {
  const pathname = decodeURIComponent(urlPath === "/" ? "/index.html" : urlPath);
  const filePath = path.resolve(root, `.${pathname}`);
  return filePath.startsWith(root) ? filePath : null;
}

http.createServer((request, response) => {
  const url = new URL(request.url, `http://${host}:${port}`);
  const filePath = resolveRequestPath(url.pathname);
  if (!filePath) {
    response.writeHead(403);
    response.end("forbidden");
    return;
  }

  fs.readFile(filePath, (error, body) => {
    if (error) {
      response.writeHead(404);
      response.end("not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": types[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(body);
  });
}).listen(port, host, () => {
  console.log(`Preview server running at http://${host}:${port}/`);
});
