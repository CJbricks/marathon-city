// Renders loading_still.png, loading_anim.mp4, loading_anim.gif via ffmpeg (nearest-neighbour upscale).
const { spawnSync } = require('child_process');
const { W, H, drawLoading } = require('./loading.js');
const FPS = 30, DUR = 5.6, SCALE = 3;
const newImg = () => ({ width: W, height: H, data: new Uint8ClampedArray(W * H * 4) });
const ease = (t) => {                       // bumpy "real loader" progress: stalls then bursts
  const keys = [[0, 0], [0.3, 0], [0.9, 0.18], [1.3, 0.22], [1.8, 0.41], [2.2, 0.44], [2.7, 0.63], [3.0, 0.66], [3.6, 0.88], [3.9, 0.92], [4.25, 1]];
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [a, pa] = keys[i - 1], [b, pb] = keys[i]; return pa + (pb - pa) * (t - a) / (b - a); }
  return 1;
};
function frameAt(t) {
  const p = ease(t), img = newImg();
  const since = t - 4.25;
  drawLoading(img, { progress: p, t, flash: since > 0 && since < 0.2, fade: since > 0.75 ? Math.min(1, (since - 0.75) / 0.6) : 0 });
  return Buffer.from(img.data.buffer);
}
const raw = (out, args, input) => {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-', ...args, out], { input, maxBuffer: 1 << 30 });
  if (r.status) throw new Error(r.stderr.toString());
};
// still at ~60%
{ const img = newImg(); drawLoading(img, { progress: 0.6, t: 1.0 }); raw('loading_still.png', ['-vf', `scale=${W * SCALE}:${H * SCALE}:flags=neighbor`, '-frames:v', '1'], Buffer.from(img.data.buffer)); }
const frames = []; for (let f = 0; f < Math.round(DUR * FPS); f++) frames.push(frameAt(f / FPS));
const all = Buffer.concat(frames);
raw('loading_anim.mp4', ['-vf', `scale=${W * SCALE}:${H * SCALE}:flags=neighbor`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'slow', '-tune', 'animation', '-movflags', '+faststart'], all);
raw('loading_anim.gif', ['-vf', `fps=15,scale=${W * 2}:${H * 2}:flags=neighbor,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=none`], all);
// debug frames
for (const t of [0.5, 2.0, 3.4, 4.35, 5.2]) { const img = newImg(); const tt = t; raw(`/tmp/lf_${t}.png`, ['-vf', `scale=${W * SCALE}:${H * SCALE}:flags=neighbor`, '-frames:v', '1'], frameAt(tt)); }
console.log('done', frames.length, 'frames');
