/**
 * Smoke test for POST /api/analyze-jpeg:
 * builds a synthetic multi-candle chart JPEG via jpeg-js (same decoder the
 * route uses), posts it to a running server, and verifies structured JSON.
 */
import jpeg from 'jpeg-js';
import { spawn } from 'node:child_process';

const W = 960, H = 540;
const pixels = Buffer.alloc(W * H * 4, 18); // dark background
const draw = (x0, x1, y0, y1, [r, g, b]) => {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    const i = (y * W + x) * 4;
    pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = 255;
  }
};
// 12 alternating candles rising left→right
for (let c = 0; c < 12; c++) {
  const slot = Math.floor(W / 12);
  const x0 = c * slot + 8, x1 = c * slot + slot - 8;
  const yMid = 300 - c * 12;
  draw(x0, x1, yMid - 40, yMid + 40, c % 2 === 0 ? [20, 200, 60] : [220, 40, 50]);
}
const jpegData = jpeg.encode({ data: pixels, width: W, height: H }, 85);
console.log(`JPEG size: ${(jpegData.data.length / 1024).toFixed(1)} KB for ${W}x${H}`);

const server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], { env: { ...process.env, PORT: '3111' }, stdio: 'pipe' });
server.stderr.on('data', (d) => process.stderr.write(d));
// Poll until the express app answers (vite middleware bootstrap can take a while).
let ready = false;
for (let i = 0; i < 40 && !ready; i++) {
  await new Promise((r) => setTimeout(r, 500));
  try { ready = (await fetch('http://localhost:3111/api/health')).ok; } catch { /* not up yet */ }
}
if (!ready) { console.error('server did not become ready'); process.exit(1); }

try {
  const res = await fetch('http://localhost:3111/api/analyze-jpeg?width=960&height=540&timeframe=1M&symbol=SMOKE', {
    method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: Buffer.from(jpegData.data),
  });
  console.log('HTTP', res.status, res.headers.get('content-type'));
  const body = await res.text();
  const json = JSON.parse(body); // must be structured JSON — the regression being tested
  console.log('success:', json.success);
  if (json.success) {
    console.log('signal:', json.result.signal, '| confluence:', json.result.confidenceScore,
      '| candles reconstructed:', json.result.reconstructedCandleCount, '| chart score:', json.result.chartDetection.score);
  } else console.log('error:', json.error);
  process.exitCode = json.success ? 0 : 1;
} catch (e) {
  console.error('SMOKE FAIL:', e.message);
  process.exitCode = 1;
} finally {
  server.kill();
}
