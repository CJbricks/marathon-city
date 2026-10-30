#!/usr/bin/env python3
"""Build animation: replays an EXAMPLE run on top of the current city.
Uses anim_sim/city.json (simulator output with the example run appended) to know
which buildings finish / start, renders each construction state with render.py
(MC_SCALE=1, MC_NO_TOWER=1) and composites a moving crane, dust, captions.
Usage: python3 animate.py   -> build_anim.mp4, build_anim.gif, build_anim_still.png"""
import json, os, subprocess, copy, math, random, shutil
from PIL import Image, ImageDraw

EX_MILES = 6.3
FPS = 15
SCALE = 5
CW, CH = 192, 120          # crop window (base px) -> 960x600
CAP = 18                   # caption bar height (base px)
SEC_PER_MILE = 0.5
MOVE_SEC = 0.75
INTRO, OUTRO = 0.8, 1.4
OX, OY, STORY = 320, 150, 3
def P(u, v, z=0): return (OX + round((u - v) * 12), OY + round((u + v) * 6) - z)

cur = json.load(open('city.json'))
nxt = json.load(open('anim_sim/city.json'))
old_ids = {b['id'] for b in cur['buildings']}
ip0 = next(b for b in cur['buildings'] if b['status'] == 'in_progress')
seq = [b for b in nxt['buildings'] if b['id'] >= ip0['id'] and b['type'] != 'capitol']
seq.sort(key=lambda b: b['id'])
for b in seq: print('seq', b['id'], b['type'], (b['x'], b['y']), b['targetStories'], b['status'], b['storiesBuilt'])

# ---- states: (id -> stories built (float)); render key uses int floors
def city_for(progress, hide=()):
    c = copy.deepcopy(nxt)
    c['buildings'] = [b for b in c['buildings'] if b['id'] not in hide]
    out = []
    for b in c['buildings']:
        if b['type'] == 'capitol' or b['id'] < ip0['id']: out.append(b); continue
        if b['id'] not in progress: continue
        s = progress[b['id']]
        b['storiesBuilt'] = s
        b['status'] = 'complete' if s >= b['targetStories'] - 1e-9 else 'in_progress'
        out.append(b)
    c['buildings'] = out
    return c
os.makedirs('/tmp/mc_frames/states', exist_ok=True)
cache = {}
def render_state(progress, hide=()):
    key = tuple(sorted((k, int(v + 1e-9), v >= next(b for b in seq if b['id'] == k)['targetStories'] - 1e-9) for k, v in progress.items())) + (tuple(sorted(hide)),)
    if key in cache: return cache[key]
    fn = '/tmp/mc_frames/states/s%d.json' % len(cache)
    json.dump(city_for(progress, hide), open(fn, 'w'))
    png = fn.replace('.json', '.png')
    subprocess.run(['python3', 'render.py', fn, png], check=True, capture_output=True,
                   env=dict(os.environ, MC_SCALE='1', MC_NO_TOWER='1'))
    cache[key] = Image.open(png).convert('RGB')
    return cache[key]

# ---- timeline
base_miles = cur['summary']['totalRunMiles']
start_built = ip0['storiesBuilt']
events = []   # list of segments
t = 0.0
segs = []     # (t0, t1, kind, data)
segs.append((0, INTRO, 'intro', {}))
t = INTRO
mile = 0.0
for i, b in enumerate(seq):
    have = start_built if i == 0 else 0.0
    need = b['targetStories'] - have
    take = min(need, EX_MILES - mile)
    dur = take * SEC_PER_MILE
    segs.append((t, t + dur, 'build', dict(b=b, have=have, m0=mile, m1=mile + take)))
    t += dur; mile += take
    if i + 1 < len(seq):
        segs.append((t, t + MOVE_SEC, 'move', dict(a=b, b=seq[i + 1])))
        t += MOVE_SEC
segs.append((t, t + OUTRO, 'outro', {}))
TOTAL = t + OUTRO
NF = int(round(TOTAL * FPS))
print('duration %.2fs, %d frames' % (TOTAL, NF))

def ease(x): return 0.5 - 0.5 * math.cos(math.pi * max(0, min(1, x)))
def lotc(b): return P(b['x'] + .5, b['y'] + .5)

# pop moments: (time, building, story index)
pops = []
for (t0, t1, k, dd) in segs:
    if k != 'build': continue
    b = dd['b']; have = dd['have']
    for s in range(int(have) + 1, b['targetStories'] + 1):
        if s <= have + (dd['m1'] - dd['m0']) + 1e-9:
            tt = t0 + (s - have) * SEC_PER_MILE
            pops.append((tt, b, s))

FONT = {}
exec(open('render.py').read().split('FONT = ')[1].split('def text')[0].join(['FONT = ', '']), globals())
def text(im, x, y, s, c, shadow=(0, 0, 0)):
    for ch in s.upper():
        g = FONT.get(ch, FONT[' '])
        for i, bit in enumerate(g):
            if bit == '1':
                for (dx, dy, cc) in ((1, 1, shadow), (0, 0, c)):
                    if cc is None: continue
                    px, py = x + i % 3 + dx, y + i // 3 + dy
                    if 0 <= px < im.width and 0 <= py < im.height: im.putpixel((px, py), cc)
        x += 4
    return x
def tw(s): return 4 * len(s) - 1

def draw_crane(d, put, mx, my, full_h, hook_drop):
    top = my - full_h - 16
    for yy in range(top, my + 1):
        put(mx, yy, (240, 192, 32)); put(mx + 1, yy, (200, 154, 16) if yy % 3 else (240, 192, 32))
    jl, jr = mx - 8, mx + 26
    d.line([jl, top, jr, top], fill=(240, 192, 32))
    d.line([mx, top - 4, jr, top], fill=(200, 154, 16))
    d.line([mx, top - 4, jl, top], fill=(200, 154, 16))
    d.rectangle([jl, top + 1, jl + 3, top + 3], fill=(128, 128, 128))
    hx = mx + 18
    d.line([hx, top, hx, top + 14 + hook_drop], fill=(64, 64, 64))
    d.rectangle([hx - 1, top + 15 + hook_drop, hx + 1, top + 16 + hook_drop], fill=(240, 192, 32))
    put(mx, top - 5, (255, 48, 48))

def state_at(t):
    """returns progress dict, active building, crane anchor (lot float coords), full_h, mile"""
    prog = {}
    prog[seq[0]['id']] = start_built
    for (t0, t1, k, dd) in segs:
        if k == 'build':
            b = dd['b']
            if t < t0: break
            f = min(1, (t - t0) / max(1e-6, t1 - t0))
            prog[b['id']] = dd['have'] + f * (dd['m1'] - dd['m0'])
            if t < t1:
                return prog, b, (b['x'], b['y']), b['targetStories'], dd['m0'] + f * (dd['m1'] - dd['m0']), 'build'
            last = (b, dd['m1'])
        elif k == 'move':
            if t < t0: break
            if t < t1:
                f = ease((t - t0) / (t1 - t0))
                a, b = dd['a'], dd['b']
                pos = (a['x'] + (b['x'] - a['x']) * f, a['y'] + (b['y'] - a['y']) * f)
                fh = a['targetStories'] + (b['targetStories'] - a['targetStories']) * f
                return prog, None, pos, fh, last[1], 'move'
        elif k == 'intro' and t < t1:
            return prog, seq[0], (seq[0]['x'], seq[0]['y']), seq[0]['targetStories'], 0.0, 'intro'
    b = seq[-1]
    return prog, b, (b['x'], b['y']), b['targetStories'], EX_MILES, 'outro'

shutil.rmtree('/tmp/mc_frames/f', ignore_errors=True); os.makedirs('/tmp/mc_frames/f')
cam = None
rng = random.Random(7)
for fi in range(NF):
    t = fi / FPS
    prog, active, pos, full_h, mile, phase = state_at(t)
    im = render_state(prog).copy()
    # SimCity-style x-ray: buildings in front of the focus lot are ghosted so
    # the construction stays readable.
    focus = active if active else state_at(t + MOVE_SEC)[1]
    fx, fy = focus['x'], focus['y']
    occ = tuple(b['id'] for b in nxt['buildings'] if b['type'] != 'capitol' and b['id'] != focus['id']
                and 0 < (b['x'] + b['y']) - (fx + fy) <= 6 and abs((b['x'] - b['y']) - (fx - fy)) <= 2)
    if occ:
        clear = render_state(prog, occ)
        Hh = focus['targetStories'] * STORY + 24
        col = [P(fx, fy + 1), P(fx + 1, fy + 1), P(fx + 1, fy), P(fx + 1, fy, Hh), P(fx, fy, Hh), P(fx, fy + 1, Hh)]
        col = [(px + (-3 if px < P(fx + .5, fy + .5)[0] else 3), py + 2) for px, py in col]
        mask = Image.new('L', im.size, 0); ImageDraw.Draw(mask).polygon(col, fill=200)
        im = Image.composite(clear, im, mask)
    d = ImageDraw.Draw(im)
    def put(x, y, c):
        if 0 <= x < im.width and 0 <= y < 430: im.putpixel((x, y), c)
    # crane
    mx, my = P(pos[0] + .12, pos[1] + .12)
    # hook dips right after each pop
    drop = 0
    for (pt, pb, ps) in pops:
        if 0 <= t - pt < 0.3: drop = int(6 * math.sin(math.pi * (t - pt) / 0.3))
    draw_crane(d, put, mx, my, int(round(full_h * STORY)), drop)
    # dust / sparkles + "+1 STORY"
    for (pt, pb, ps) in pops:
        age = t - pt
        if 0 <= age < 0.6:
            cx, cy = P(pb['x'] + .5, pb['y'] + .5, ps * STORY + 1)
            r2 = random.Random(pb['id'] * 31 + ps)
            for k in range(14):
                ang = r2.uniform(0, 2 * math.pi); sp = r2.uniform(4, 13)
                dx = int(math.cos(ang) * sp * age / 0.6 * 1.6); dy = int(math.sin(ang) * sp * age / 0.6 * 0.8 - 3 * age / 0.6)
                c = (220, 205, 170) if k % 3 else (255, 250, 200)
                if age < 0.45 or k % 2: put(cx + dx, cy + dy, c)
            if age < 0.25:
                for (sx, sy) in ((-7, -4), (8, -6), (0, -9)):
                    put(cx + sx, cy + sy, (255, 255, 255)); put(cx + sx - 1, cy + sy, (255, 240, 120)); put(cx + sx + 1, cy + sy, (255, 240, 120))
                    put(cx + sx, cy + sy - 1, (255, 240, 120)); put(cx + sx, cy + sy + 1, (255, 240, 120))
        if 0 <= age < 0.9:
            cx, cy = P(pb['x'] + .5, pb['y'] + .5, pb['targetStories'] * STORY + 10)
            s = '+1 STORY'
            text(im, cx - tw(s) // 2 + 6, cy - 8 - int(age * 14), s, (255, 230, 90) if age < 0.6 else (190, 170, 80), (60, 30, 0))
    # camera: follow crane, eased
    tx, ty = P(pos[0] + .5, pos[1] + .5)
    target = (tx - CW / 2, ty - 18 - (CH - CAP) / 2)
    if cam is None: cam = list(target)
    cam[0] += (target[0] - cam[0]) * 0.22; cam[1] += (target[1] - cam[1]) * 0.22
    cx0 = int(round(max(0, min(640 - CW, cam[0])))); cy0 = int(round(max(0, min(430 - (CH - CAP), cam[1]))))
    fr = Image.new('RGB', (CW, CH), (30, 34, 48))
    fr.paste(im.crop((cx0, cy0, cx0 + CW, cy0 + CH - CAP)), (0, 0))
    fd = ImageDraw.Draw(fr)
    # top tag
    tag = 'EXAMPLE RUN: %.1f MI' % EX_MILES
    fd.rectangle([2, 2, tw(tag) + 6, 10], fill=(30, 34, 48)); fd.rectangle([2, 2, tw(tag) + 6, 10], outline=(224, 176, 32))
    text(fr, 5, 4, tag, (255, 210, 80), None)
    # caption bar
    y0 = CH - CAP
    fd.line([0, y0, CW, y0], fill=(224, 176, 32)); fd.line([0, y0 + 1, CW, y0 + 1], fill=(138, 106, 16))
    x = text(fr, 3, y0 + 4, 'RUN', (150, 160, 180))
    x = text(fr, x + 3, y0 + 4, '%.2f/%.1f MI' % (mile, EX_MILES), (255, 255, 255))
    text(fr, 3, y0 + 11, 'CITY %.2f MI' % (base_miles + mile), (150, 160, 180))
    if phase == 'move':
        lab = 'CRANE -> NEXT LOT'; col = (255, 160, 60)
    elif phase == 'intro':
        lab = 'RUN SYNCED!'; col = (120, 220, 120)
    else:
        b = active; s = prog.get(b['id'], 0)
        nm = {'rowhouse': 'ROWHOUSE'}.get(b['type'], b['type'].upper())
        done = s >= b['targetStories'] - 1e-9
        lab = '#%d %s %s/%d%s' % (b['id'], nm, ('%.2f' % s).rstrip('0').rstrip('.') if not done else str(b['targetStories']), b['targetStories'], ' DONE' if done else '')
        col = (120, 220, 120) if done else (255, 255, 255)
    text(fr, CW - tw(lab) - 3, y0 + 4, lab, col)
    if phase == 'outro':
        s2 = 'NEXT: #%d STARTED' % seq[-1]['id']
        text(fr, CW - tw(s2) - 3, y0 + 11, s2, (255, 160, 60))
    # progress bar for run miles
    fd.rectangle([60, y0 + 11, 60 + 50, y0 + 15], outline=(90, 96, 120))
    fd.rectangle([61, y0 + 12, 61 + int(48 * mile / EX_MILES), y0 + 14], fill=(240, 192, 32))
    fr = fr.resize((CW * SCALE, CH * SCALE), Image.NEAREST)
    fr.save('/tmp/mc_frames/f/%04d.png' % fi)
print('states rendered:', len(cache))
