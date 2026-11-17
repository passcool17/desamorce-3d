// Serveur statique minimal pour les tests (sous-chemin /desamorce-3d/ comme sur GitHub Pages).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.glb': 'model/gltf-binary' };
export function serve(port = 0) {
  return new Promise(res => {
    const srv = createServer(async (req, rsp) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (!p.startsWith('/desamorce-3d/')) { rsp.writeHead(302, { Location: '/desamorce-3d/' }); return rsp.end(); }
      p = p.slice('/desamorce-3d'.length); if (p.endsWith('/')) p += 'index.html';
      const f = normalize(join(ROOT, p)); if (!f.startsWith(ROOT)) { rsp.writeHead(403); return rsp.end(); }
      try { const b = await readFile(f); rsp.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); rsp.end(b); }
      catch { rsp.writeHead(404); rsp.end('404'); }
    });
    srv.listen(port, '127.0.0.1', () => res({ srv, url: `http://127.0.0.1:${srv.address().port}/desamorce-3d/` }));
  });
}
if (process.argv[1] && process.argv[1].endsWith('serve.mjs')) serve(+process.argv[2] || 0).then(({ url }) => console.log(url));
