// 引光 · 本地试玩服务器：node serve.js [端口]
// 电脑和手机连同一个 Wi-Fi，手机浏览器打开下面打印出的「手机访问」地址即可。
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');

const ROOT = __dirname, PORT = +process.argv[2] || 8080, HOST = process.argv[3] || '0.0.0.0';   // 第二个参数填 127.0.0.1 则只允许本机访问
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
// 只对外提供游戏本身用到的文件
const ALLOW = /^(index\.html|style\.css|core\.js|game\.js|sw\.js|manifest\.webmanifest|assets\/[\w.-]+)$/;

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  if (!ALLOW.test(rel)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404'); return; }
  const file = path.join(ROOT, rel);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

let port = PORT, tries = 0;
server.on('error', e => {
  if (e.code === 'EADDRINUSE' && tries++ < 20) { port++; server.listen(port, HOST); return; }   // 端口被占用就顺延到下一个
  console.error(e.message); process.exit(1);
});
server.on('listening', () => {
  const ips = [];
  if (HOST === '0.0.0.0') for (const list of Object.values(os.networkInterfaces())) for (const n of list) if (n.family === 'IPv4' && !n.internal) ips.push(n.address);
  console.log('\n  引光 · 试玩服务器已启动\n');
  console.log(`  本机访问    http://localhost:${port}`);
  for (const ip of ips) console.log(`  手机访问    http://${ip}:${port}   （手机需与电脑连同一个 Wi-Fi）`);
  console.log('\n  第一次启动时 Windows 可能弹出防火墙提示，请点「允许」。');
  console.log('  关闭这个窗口即停止。\n');
});
server.listen(port, HOST);
