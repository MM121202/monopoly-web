/**
 * 零依赖静态服务器 —— 仅用于本地开发预览。
 * 启动：node scripts/serve.mjs [port]
 *
 * 之所以不用第三方 dev server：这个项目承诺「克隆下来就能跑」，
 * 那么开发体验也不该额外依赖任何东西。
 */
import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 8123);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);
    // 1) 直接拒绝任何含 .. 或 NUL 的路径，从源头掐断穿越
    if (pathname.includes('..') || pathname.includes('\0')) {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('400 Bad Request');
      return;
    }
    if (pathname.endsWith('/')) pathname += 'index.html';

    // '.' 前缀保证 pathname 永远被当作相对路径，不会覆盖 ROOT
    const filePath = resolve(ROOT, '.' + pathname);

    const info = await stat(filePath).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 Not Found');
      return;
    }

    // 2) 纵深防御：解析真实路径后再校验一次仍在 ROOT 之内
    //    （防止 ROOT 内的符号链接指出去）
    const realRoot = await realpath(ROOT);
    const realFile = await realpath(filePath);
    if (realFile !== realRoot && !realFile.startsWith(realRoot + sep)) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }).end('Forbidden');
      return;
    }

    const body = await readFile(filePath);
    res.writeHead(200, {
      'content-type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    }).end(body);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end(String(err));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`大富翁已启动： http://127.0.0.1:${PORT}/`);
});
