#!/usr/bin/env python3
"""Render city.json as a SimCity-2000-style pixel-art isometric preview."""
import json, math, os, random, sys, hashlib
from PIL import Image, ImageDraw

SRC = sys.argv[1] if len(sys.argv) > 1 else 'city.json'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'preview.png'
SCALE = int(os.environ.get('MC_SCALE', 2))   # MC_SCALE=1 for base-res frames (anim)
city = json.load(open(SRC))
S = city['summary']
N = city['map']['tiles']; PER = city['map']['period']

HW, HH = 12, 6            # half tile width/height (tile = 24x12)
STORY = 3                 # px per story
W = 640
MAP_H = 430
LEG_H = 76
H = MAP_H + LEG_H
OX = W // 2
OY = 150

img = Image.new('RGB', (W, H), (0, 0, 0))
px = img.load()
d = ImageDraw.Draw(img)

# ---------------------------------------------------------------- time-of-day lighting
# MC_TIME=HH:MM (or MC_TIME=now for this machine's local clock). Keyframes live
# in lighting.js so the browser app uses the exact same logic. Unset = classic
# daylight preview (pixel-identical to before).
LT = None
if os.environ.get('MC_TIME'):
    import subprocess, numpy as np
    _arg = [] if os.environ['MC_TIME'] == 'now' else [os.environ['MC_TIME']]
    LT = json.loads(subprocess.run(['node', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lighting.js')] + _arg,
                                   check=True, capture_output=True, text=True).stdout)
    MC_TIME_LABEL = ('%02d:%02d' % divmod(int(LT['minutes']), 60))
    def _arr(): return np.asarray(img, dtype=np.float32).copy()
    def _set(a): img.paste(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)))
WINPIX = []    # (x, y, color, storyRow) of every facade window pixel, for night lighting
CARS = []      # (x, y, along_u)

def P(u, v, z=0):
    return (int(round(OX + (u - v) * HW)), int(round(OY + (u + v) * HH - z)))

def mix(c, f):
    if f >= 1: return tuple(min(255, int(x + (255 - x) * (f - 1))) for x in c)
    return tuple(int(x * f) for x in c)
def hexc(h): h = h.lstrip('#'); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
def rnd(*k): return random.Random(hashlib.md5('|'.join(map(str, k)).encode()).hexdigest())
def put(x, y, c):
    if 0 <= x < W and 0 <= y < MAP_H: px[x, y] = c
def poly(pts, c): d.polygon(pts, fill=c)

# ---------------------------------------------------------------- sky + mountains
if LT is None:
    sky = [hexc(c) for c in ['#5b8fd6', '#6b9fe0', '#7eb0e8', '#93c0ee', '#a9cff2', '#c0dcf4', '#d6e8f4']]
    band = 140 // len(sky) + 1
    for y in range(MAP_H):
        i = min(len(sky) - 1, y // band)
        c = sky[i]
        # dithered transition between bands
        if i + 1 < len(sky) and (y % band) > band - 4 and ((y + 0) % 2 == 0):
            for x in range(W):
                px[x, y] = sky[i + 1] if (x + y) % 2 == 0 else c
        else:
            for x in range(W): px[x, y] = c
    # clouds
    cr = random.Random(7)
    for _ in range(7):
        cx, cy = cr.randint(0, W), cr.randint(10, 70)
        for k in range(cr.randint(3, 5)):
            ex, ey = cx + cr.randint(-18, 18), cy + cr.randint(-3, 3)
            rw, rh = cr.randint(8, 16), cr.randint(3, 5)
            d.ellipse([ex - rw, ey - rh, ex + rw, ey + rh], fill=(244, 248, 252))
        d.line([cx - 22, cy + 4, cx + 22, cy + 4], fill=(214, 226, 238))
else:
    HZ = OY + 46
    t3 = [tuple(c) for c in LT['sky']]
    def _lc(a, b, f): return tuple(int(round(a[i] + (b[i] - a[i]) * f)) for i in range(3))
    sky = [(_lc(t3[0], t3[1], k / 3) if k <= 3 else _lc(t3[1], t3[2], (k - 3) / 3)) for k in range(7)]
    band = HZ // len(sky) + 1
    for y in range(MAP_H):
        i = min(len(sky) - 1, y // band); c = sky[i]
        if i + 1 < len(sky) and (y % band) > band - 4 and y % 2 == 0:
            for x in range(W): px[x, y] = sky[i + 1] if (x + y) % 2 == 0 else c
        else:
            for x in range(W): px[x, y] = c
    def _blend(x, y, c, f):
        if 0 <= x < W and 0 <= y < MAP_H:
            o = px[x, y]; px[x, y] = tuple(int(o[i] + (c[i] - o[i]) * f) for i in range(3))
    # stars
    if LT['stars'] > 0:
        sr = random.Random(42)
        for _ in range(int(260 * LT['stars'])):
            x, y = sr.randint(0, W - 1), int(sr.random() ** 1.6 * (HZ - 14))
            b_ = sr.random()
            _blend(x, y, (255, 255, 240) if b_ > .3 else (170, 190, 255), LT['stars'] * (0.45 + 0.55 * b_) * (1 - y / HZ * 0.6))
            if b_ > 0.94:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)): _blend(x + dx, y + dy, (200, 210, 255), LT['stars'] * 0.5)
    # sun / moon (drawn before mountains so they set behind the Front Range)
    def _disc(cx, cy, r, c, halo, hf):
        for rr in range(r + 7, r, -1):                     # dithered halo rings
            f = hf * (1 - (rr - r) / 8)
            for yy in range(-rr, rr + 1):
                for xx in range(-rr, rr + 1):
                    dd = (xx * xx + yy * yy) ** .5
                    if rr - 1 < dd <= rr and (xx + yy) % 2 == 0: _blend(cx + xx, cy + yy, halo, f)
        for yy in range(-r, r + 1):
            for xx in range(-r, r + 1):
                if xx * xx + yy * yy <= r * r + 1: _blend(cx + xx, cy + yy, c, 1)
    for body, r in (('sun', 6), ('moon', 5)):
        o = LT[body]
        if o['visible'] and o['alt'] > -0.05:
            cx, cy = int(o['x'] * W), int(HZ - 60 - max(0, o['alt']) ** 0.5 * (HZ - 80))
            if body == 'sun' and o['alt'] < 0.4:              # low sun: wide warm glow over the ridge
                gf = (0.4 - max(0, o['alt'])) / 0.4 * 0.55
                for yy in range(max(0, cy - 60), min(HZ, cy + 50)):
                    for xx in range(max(0, cx - 120), min(W, cx + 120)):
                        dd = (((xx - cx) / 120) ** 2 + ((yy - cy) / 60) ** 2)
                        if dd < 1 and ((xx + yy) % 2 == 0 or dd < 0.5): _blend(xx, yy, tuple(o['color']), gf * (1 - dd) ** 2)
            _disc(cx, cy, r, tuple(o['color']), tuple(o['color']), 0.45 if body == 'sun' else 0.25)
            if body == 'moon':
                for yy in range(-r, r + 1):                # crescent: bite out with sky colour
                    for xx in range(-r, r + 1):
                        if xx * xx + yy * yy <= r * r and (xx + 3) ** 2 + (yy - 1) ** 2 <= (r - 1) ** 2:
                            px[cx + xx, cy + yy] = sky[min(6, (cy + yy) // band)]
                for dx, dy in ((2, -1), (3, 2), (1, 3)): _blend(cx + dx, cy + dy, (190, 192, 180), 1)
    # clouds
    ccol = tuple(LT['cloud'])
    cr = random.Random(7)
    for _ in range(7):
        cx, cy = cr.randint(0, W), cr.randint(10, 70)
        for k in range(cr.randint(3, 5)):
            ex, ey = cx + cr.randint(-18, 18), cy + cr.randint(-3, 3)
            rw, rh = cr.randint(8, 16), cr.randint(3, 5)
            d.ellipse([ex - rw, ey - rh, ex + rw, ey + rh], fill=ccol)
        d.line([cx - 22, cy + 4, cx + 22, cy + 4], fill=tuple(int(v * .86) for v in ccol))
    _sky_snap = _arr()

def back_edge_y(x):  # y of the map's back edges at screen column x
    return OY + abs(x - OX) / 2

def ridge(seed, n, rough):
    r = random.Random(seed)
    pts = [r.random(), r.random()]
    step = 1.0
    while len(pts) < n:
        out = []
        for i in range(len(pts) - 1):
            out += [pts[i], (pts[i] + pts[i + 1]) / 2 + r.uniform(-step, step)]
        out.append(pts[-1]); pts = out; step *= rough
    return pts

HORIZON = OY + 46
def range_layer(seed, base_off, hmin, hmax, cols, snowline, rough=0.55, npk=7):
    lit, shade, snowL, snowS = cols
    raw = ridge(seed, W + 2, rough)
    lo, hi = min(raw), max(raw)
    noise = [(v - lo) / (hi - lo) for v in raw]
    r = random.Random(seed * 3)
    peaks = [((i + r.uniform(0.1, 0.9)) * W / npk, r.uniform(0.55, 1.0), r.uniform(0.35, 0.6)) for i in range(npk)]
    hs = []
    for i in range(len(noise)):
        x = i * W / len(noise)
        env = max(max(0.0, ph - abs(x - pxk) / (W / npk) * sl * 1.4) for pxk, ph, sl in peaks)
        hs.append(hmin + (hmax - hmin) * (0.75 * env + 0.25 * noise[i]))
    n = len(hs)
    for x in range(W):
        i = int(x * (n - 1) / (W - 1))
        h = hs[i]
        hp, hn = hs[max(0, i - 3)], hs[min(n - 1, i + 3)]
        litside = hn >= hp
        base = HORIZON + base_off
        top = base - int(h)
        for y in range(max(0, top), min(MAP_H, base + 40)):
            depth = y - top
            alt = base - y
            snowy = alt > snowline and depth < 3 + (alt - snowline) * 0.9 + ((x * 7) % 5)
            if snowy:
                c = snowL if litside else snowS
            else:
                c = lit if litside else shade
                # rocky streaks
                if (x * 5 + y * 3) % 23 == 0: c = mix(c, 0.85)
                if alt > snowline - 4 and (x + y) % 2 == 0 and depth < 12: c = snowS
            px[x, y] = c
        if top >= 0 and top < MAP_H: px[x, top] = mix(snowL if top < base - snowline else lit, 1.05)

range_layer(11, -4, 30, 118, (hexc('#9aa2c4'), hexc('#7a80a6'), hexc('#ffffff'), hexc('#cfd6ea')), 66, 0.6)
range_layer(23, 3, 10, 58, (hexc('#6f8a6a'), hexc('#566e58'), hexc('#f4f6fa'), hexc('#c6cede')), 46, 0.55, 9)
if LT:
    a_ = _arr(); m_ = np.any(a_ != _sky_snap, axis=2); m_[HORIZON:] = False
    lum = a_.mean(axis=2); snow = m_ & (lum > 185); rock = m_ & ~snow
    a_[snow] *= np.array(LT['snow'], np.float32); a_[rock] *= np.array(LT['mountain'], np.float32)
    # thin atmospheric haze toward the horizon colour
    hz = np.array(LT['sky'][2], np.float32)
    a_[m_] = a_[m_] * 0.88 + hz * 0.12 if LT['stars'] < 0.5 else a_[m_] * 0.9 + hz * 0.1
    _set(a_)
# foothills / plains below mountains, outside the map
for x in range(W):
    for y in range(HORIZON, MAP_H):
        t = y - HORIZON
        c = hexc('#7a7a44') if t < 8 else (hexc('#a09654') if t < 40 else hexc('#b4a660'))
        if 8 <= t < 12 and (x + y) % 2 == 0: c = hexc('#7a7a44')
        if 40 <= t < 44 and (x + y) % 2 == 0: c = hexc('#a09654')
        if ((x // 2 + y) // 9 + (x // 2 - y) // 9) % 3 == 0 and t > 14: c = mix(c, 0.94)
        if (x * 3 + y * 5) % 17 == 0: c = mix(c, 0.85)
        px[x, y] = c
# scattered scrub trees on the plains
pr = random.Random(99)
for _ in range(260):
    x = pr.randint(0, W - 1); y = pr.randint(HORIZON + 4, MAP_H - 4)
    put(x, y, hexc('#6a6a3a')); put(x + 1, y, hexc('#6a6a3a')); put(x, y - 1, hexc('#7a8040'))

if LT:
    _env_snap = _arr()
# ---------------------------------------------------------------- ground
road = set()
for y in range(N):
    for x in range(N):
        if x % PER == 0 or y % PER == 0: road.add((x, y))
ring = {(l['x'], l['y']): l['ring'] for l in city['lots']}
occupied = {}
for b in city['buildings']: occupied[(b['x'], b['y'])] = ('b', b)
for l in city['landmarks']:
    if l['key'] != 'capitol': occupied[(l['x'], l['y'])] = ('l', l)
for p in city['parks']: occupied[(p['x'], p['y'])] = ('p', p)
sq_tiles = {}
for q in city['sideQuests']:
    for dx in range(q['w']):
        for dy in range(q['h']): sq_tiles[(q['x'] + dx, q['y'] + dy)] = q

# earth skirt on the two front edges
SK = 10
poly([P(0, N), P(N, N), P(N, N, -SK), P(0, N, -SK)], hexc('#7a5230'))
poly([P(N, N), P(N, 0), P(N, 0, -SK), P(N, N, -SK)], hexc('#5e3e24'))
for k in (3, 7):
    d.line([P(0, N, -k), P(N, N, -k)], fill=hexc('#8a6440'))
    d.line([P(N, N, -k), P(N, 0, -k)], fill=hexc('#6e4a2c'))

GRASS = [hexc('#8fa452'), hexc('#889e4e'), hexc('#94a856')]
LAWN = hexc('#6aa84f')
def tile(x, y, c, edge=None):
    poly([P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)], c)
    if edge: d.line([P(x, y + 1), P(x + 1, y + 1), P(x + 1, y)], fill=edge)

for y in range(N):
    for x in range(N):
        g = GRASS[(x * 7 + y * 3) % 3]
        if (x, y) in road:
            tile(x, y, hexc('#5a5a60'))
        elif (x, y) in sq_tiles:
            tile(x, y, LAWN)
        elif (x, y) in occupied:
            kind, o = occupied[(x, y)]
            if kind == 'p': tile(x, y, hexc('#58a83e'))
            elif kind == 'b' and o['type'] == 'rowhouse': tile(x, y, hexc('#78b45a'))
            else: tile(x, y, hexc('#b4ada0'))
        else:
            tile(x, y, g)
            r = rnd('grass', x, y)
            for _ in range(4):
                u, v = x + r.random(), y + r.random()
                gx, gy = P(u, v); put(gx, gy, hexc('#6a7a3a')); put(gx + 1, gy, hexc('#a8b46a'))
# sidewalks + lane markings
for (x, y) in road:
    hr = y % PER == 0; vr = x % PER == 0
    if hr and not vr:
        a, b = P(x + 0.3, y + 0.5), P(x + 0.7, y + 0.5)
        d.line([a, b], fill=hexc('#d8c860'))
    if vr and not hr:
        a, b = P(x + 0.5, y + 0.3), P(x + 0.5, y + 0.7)
        d.line([a, b], fill=hexc('#d8c860'))
# curb lines around every block
for by in range(N // PER):
    for bx in range(N // PER):
        x0, y0 = bx * PER + 1, by * PER + 1
        d.line([P(x0, y0), P(x0 + 2, y0), P(x0 + 2, y0 + 2), P(x0, y0 + 2), P(x0, y0)], fill=hexc('#9a9a96'))
# some cars on streets near developed blocks
cr = random.Random(5)
carc = [hexc(c) for c in ['#d03030', '#f0f0f0', '#3050c0', '#e0c020', '#202020', '#30a050']]
for (x, y) in sorted(road):
    dist = math.hypot(x - N / 2, y - N / 2)
    if cr.random() < (0.22 if dist < 8 else 0.06):
        hr = y % PER == 0
        off = 0.3 if cr.random() < .5 else 0.7
        u, v = (x + cr.random() * 0.6 + 0.2, y + off) if hr else (x + off, y + cr.random() * 0.6 + 0.2)
        cx, cy = P(u, v); c = cr.choice(carc)
        put(cx, cy - 1, c); put(cx + 1, cy - 1, c); put(cx, cy, mix(c, .6)); put(cx + 1, cy, mix(c, .6))
        CARS.append((cx, cy, hr))
if LT:
    _ground_snap = _arr()

# ---------------------------------------------------------------- primitives
def faces(u0, v0, u1, v1, z0, h):
    L, F, R, B = P(u0, v1, z0), P(u1, v1, z0), P(u1, v0, z0), P(u0, v0, z0)
    return L, F, R, B

def box(u0, v0, u1, v1, z0, h, cl, cr_=None, ct=None, outline=True):
    cr_ = cr_ or mix(cl, 0.72); ct = ct or mix(cl, 1.18)
    L, F, R, B = faces(u0, v0, u1, v1, z0, h)
    up = lambda p: (p[0], p[1] - h)
    poly([L, F, up(F), up(L)], cl)
    poly([F, R, up(R), up(F)], cr_)
    poly([up(B), up(R), up(F), up(L)], ct)
    if outline:
        d.line([up(L), up(F), up(R)], fill=mix(ct, 1.1))
        d.line([up(F), F], fill=mix(cl, 1.12))
    return L, F, R, B

def face_iter(u0, v0, u1, v1, z0, side):
    """yield (t, x, ybase) along the left (side='L') or right ('R') face."""
    L, F, R, _ = faces(u0, v0, u1, v1, z0, 0)
    if side == 'L':
        for x in range(L[0], F[0] + 1): yield x - L[0], F[0] - L[0], x, L[1] + (x - L[0]) // 2
    else:
        for x in range(F[0], R[0] + 1): yield x - F[0], R[0] - F[0], x, F[1] - (x - F[0] + 1) // 2

def windows(u0, v0, u1, v1, z0, h, fn):
    for side in 'LR':
        for t, n, x, yb in face_iter(u0, v0, u1, v1, z0, side):
            for k in range(h):
                c = fn(side, t, n, k)
                if c:
                    put(x, yb - k, c)
                    if LT: WINPIX.append((x, yb - k, c, (k // STORY) * 2 + (side == 'R')))

def gable_roof(u0, v0, u1, v1, z, rh, c):
    vm = (v0 + v1) / 2
    A, B_, C, D = P(u0, v1, z), P(u1, v1, z), P(u1, vm, z + rh), P(u0, vm, z + rh)
    poly([P(u0, v0, z), P(u1, v0, z), C, D], mix(c, 0.8))  # back slope
    poly([A, B_, C, D], c)                                   # front slope
    poly([B_, P(u1, v0, z), C], mix(c, 0.65))                # gable end (right)
    d.line([D, C], fill=mix(c, 1.3))

def dome(cx, base_y, r, c):
    for dy in range(r + 1):
        w = int(math.sqrt(max(0, r * r - dy * dy)) * 1.0 + 0.5)
        for dx in range(-w, w + 1):
            col = c
            if dx < -w * 0.35: col = mix(c, 1.35)
            elif dx > w * 0.45: col = mix(c, 0.72)
            if dy > r * 0.6 and dx < 0: col = mix(c, 1.5)
            put(cx + dx, base_y - dy, col)

def tree(x, y, big=False, c=None):
    c = c or hexc('#2f7a32')
    put(x, y, hexc('#5a3a1a')); put(x, y - 1, hexc('#5a3a1a'))
    r = 3 if big else 2
    d.ellipse([x - r, y - 2 - 2 * r, x + r, y - 2], fill=c)
    put(x - 1, y - 2 - r - (1 if big else 0), mix(c, 1.4)); put(x - 2 + (0 if big else 1), y - 1 - r, mix(c, 1.25))
    put(x + r - 1, y - 3, mix(c, 0.7))

# ---------------------------------------------------------------- building styles
WIN = hexc('#2b3a55'); WIN_LIT = hexc('#ffe58a'); GLASS_HI = hexc('#bfe4ff')

def draw_skyscraper(b, x, y, stories, r):
    pal = r.choice(['#4a78a8', '#3f8f92', '#5a6472', '#8a6a4a', '#6d7fa0', '#2f5f8a'])
    base = hexc(pal)
    h = stories * STORY
    i0 = 1 / 6
    setback = stories >= 22 and r.random() < 0.7
    h1 = h if not setback else int(h * 0.78) // STORY * STORY
    u0, v0, u1, v1 = x + i0, y + i0, x + 1 - i0, y + 1 - i0
    box(u0, v0, u1, v1, 0, h1, base)
    sheen = r.randint(0, 10)
    def wf(side, t, n, k):
        if t <= 0 or t >= n or k >= h1 - 1 or k < 1: return None
        if k % STORY == 0: return mix(base, 0.85 if side == 'L' else 0.6)
        if t % 2 == 0: return None
        c = hexc('#9cc8ea') if side == 'L' else hexc('#5f86aa')
        if (t + k + sheen) % 13 < 2: c = GLASS_HI
        if r.random() < 0.04: c = WIN_LIT
        return c
    windows(u0, v0, u1, v1, 0, h1, wf)
    top = h1
    if setback:
        i1 = 2 / 6
        h2 = h - h1
        box(x + i1, y + i1, x + 1 - i1, y + 1 - i1, h1, h2, mix(base, 1.05))
        def wf2(side, t, n, k):
            if t <= 0 or t >= n or k < 1 or k >= h2 - 1: return None
            if k % STORY == 0 or t % 2 == 0: return None
            return hexc('#9cc8ea') if side == 'L' else hexc('#5f86aa')
        windows(x + i1, y + i1, x + 1 - i1, y + 1 - i1, h1, h2, wf2)
        top = h
    cx, cy = P(x + .5, y + .5, top)
    if r.random() < 0.6:  # antenna / spire
        ln = r.randint(5, 10)
        d.line([cx, cy, cx, cy - ln], fill=hexc('#d0d0d0'))
        put(cx, cy - ln, hexc('#ff3030'))
    else:
        poly([P(x + .38, y + .38, top), P(x + .62, y + .38, top), P(x + .62, y + .62, top), P(x + .38, y + .62, top)], hexc('#cfd6dc'))

def draw_office(b, x, y, stories, r):
    base = hexc(r.choice(['#b9b2a3', '#a7a9ad', '#c9b48f', '#8f9aa6', '#c2a58a', '#9aa58c']))
    h = stories * STORY; i0 = 1 / 6
    u0, v0, u1, v1 = x + i0, y + i0, x + 1 - i0, y + 1 - i0
    box(u0, v0, u1, v1, 0, h, base)
    band = r.random() < 0.5
    def wf(side, t, n, k):
        if t <= 0 or t >= n or k >= h - 1 or k < 1: return None
        if k % STORY == 0: return None
        if not band and t % 3 == 0: return None
        if band and t % 4 == 0: return None
        c = WIN if side == 'L' else mix(WIN, 0.8)
        if (k % STORY == 2) and side == 'L': c = hexc('#4a5f80')
        if r.random() < 0.06: c = WIN_LIT
        return c
    windows(u0, v0, u1, v1, 0, h, wf)
    # rooftop mechanical
    box(x + .4, y + .3, x + .6, y + .5, h, 3, hexc('#8a8a8a'), outline=False)

def draw_mixeduse(b, x, y, stories, r):
    base = hexc(r.choice(['#a0522d', '#b5653a', '#8c3b2e', '#c08850', '#7a6a9c', '#9a7a5a', '#b04a3a', '#d2b48c']))
    h = stories * STORY; i0 = 1 / 6
    u0, v0, u1, v1 = x + i0 / 2, y + i0, x + 1 - i0 / 2, y + 1 - i0 / 2
    box(u0, v0, u1, v1, 0, h, base)
    awn = hexc(r.choice(['#d03a3a', '#2f8a4a', '#2f5fb0', '#e0a020', '#e06aa0']))
    def wf(side, t, n, k):
        if t <= 0 or t >= n or k >= h - 1: return None
        if k <= 1:  # storefront
            return hexc('#7fb0d0') if t % 4 else mix(base, 0.6)
        if k == 2 or k == 3:
            return awn if (t // 2) % 2 == 0 else hexc('#f0f0e8')
        if (k - 4) % STORY == 2: return None
        if t % 3 != 1: return None
        return WIN_LIT if r.random() < 0.07 else (hexc('#304060') if side == 'L' else hexc('#263248'))
    windows(u0, v0, u1, v1, 0, h, wf)
    if r.random() < 0.45:  # water tower / rooftop garden
        cx, cy = P(x + .5, y + .5, h)
        if r.random() < 0.5:
            d.rectangle([cx - 2, cy - 6, cx + 1, cy - 2], fill=hexc('#7a5030')); put(cx - 1, cy - 7, hexc('#5a3a20'))
        else:
            tree(cx, cy, False)

def draw_rowhouse(b, x, y, stories, r):
    victorian = r.random() < 0.6
    if victorian:
        base = hexc(r.choice(['#d98c8c', '#8cb4d9', '#d9cf8c', '#9cc79c', '#c9a0d9', '#e8b07a', '#7ac0b8']))
    else:
        base = hexc(r.choice(['#9b4a35', '#a8583a', '#8a4030', '#b06a48']))
    roofc = hexc(r.choice(['#5a4a5a', '#6b3a2a', '#3d4a5a', '#4a4040', '#2f3f4f']))
    h = stories * STORY + 1
    # two attached units along the lot
    units = [(x + 1 / 6, y + 1 / 6, x + 1 - 1 / 6, y + 1 / 2 - 0.02), (x + 1 / 6, y + 1 / 2, x + 1 - 1 / 6, y + 1 - 1 / 6)] if r.random() < 0.5 else [(x + 1 / 6, y + 1 / 6, x + 5 / 6, y + 5 / 6)]
    for i, (u0, v0, u1, v1) in enumerate(units):
        bc = base if i == 0 or not victorian else hexc(r.choice(['#d98c8c', '#8cb4d9', '#d9cf8c', '#9cc79c', '#c9a0d9']))
        box(u0, v0, u1, v1, 0, h, bc, outline=False)
        def wf(side, t, n, k, bc=bc):
            if t <= 0 or t >= n or k >= h - 1: return None
            if side == 'L' and k <= 2 and abs(t - n // 2) <= 0: return hexc('#4a2a1a')  # door
            if k % STORY == 0: return None
            if t % 4 == 2: return hexc('#f8f4e8') if k % STORY == 2 and victorian else hexc('#304060')
            return None
        windows(u0, v0, u1, v1, 0, h, wf)
        gable_roof(u0, v0, u1, v1, h, 4, roofc)
    if r.random() < 0.5:
        tx, ty = P(x + 0.9, y + 0.1); tree(tx, ty + 2, False)

def draw_state(b, x, y, stories, r):
    base = hexc(r.choice(['#d8d0bc', '#e0dccc', '#cfc4a8']))
    h = stories * STORY; i0 = 1 / 6
    u0, v0, u1, v1 = x + i0, y + i0, x + 1 - i0, y + 1 - i0
    box(u0, v0, u1, v1, 0, h, base)
    def wf(side, t, n, k):
        if t <= 0 or t >= n or k >= h - 2: return None
        if k < 6:
            return mix(base, 1.15) if t % 3 == 0 else mix(base, 0.62 if side == 'L' else 0.5)
        if k % STORY == 0: return None
        return hexc('#3a4660') if t % 3 == 1 else None
    windows(u0, v0, u1, v1, 0, h, wf)
    # parapet + flag
    L, F, R, B = faces(u0, v0, u1, v1, 0, 0)
    d.line([(L[0], L[1] - h - 1), (F[0], F[1] - h - 1), (R[0], R[1] - h - 1)], fill=mix(base, 1.25))
    cx, cy = P(x + .5, y + .5, h)
    d.line([cx, cy, cx, cy - 7], fill=hexc('#e0e0e0'))
    for i in range(3): put(cx + 1 + i, cy - 7, hexc('#c02020')); put(cx + 1 + i, cy - 6, hexc('#2040a0'))

def draw_museum(b, x, y, stories, r, built=None):
    base = hexc(r.choice(['#a9b0b8', '#c8a878', '#e4e0d6', '#8a9098']))
    h = stories * STORY
    h1 = int(h * 0.6)
    box(x + 1 / 6, y + 1 / 6, x + 5 / 6, y + 5 / 6, 0, h1, base)
    def wf(side, t, n, k):
        if t <= 1 or t >= n - 1: return None
        if 3 <= k <= 6 and side == 'L': return hexc('#7ab0d0')
        if k > 8 and k % 6 == 0 and side == 'R': return mix(base, 0.55)
        return None
    windows(x + 1 / 6, y + 1 / 6, x + 5 / 6, y + 5 / 6, 0, h1, wf)
    # cantilevered upper volume
    box(x + 2 / 6, y + 0 / 6, x + 1, y + 4 / 6, h1, h - h1, mix(base, 1.08))
    h2 = h - h1
    banner = hexc(r.choice(['#c03030', '#2f6fb0', '#e0a020', '#2f8a4a']))
    def wf3(side, t, n, k):
        if t <= 0 or t >= n or k >= h2 - 1: return None
        if k % 4 == 0: return mix(base, 0.85 if side == 'L' else 0.6)
        if side == 'L' and 1 <= k <= 2 and t % 2: return hexc('#7ab0d0')
        return None
    windows(x + 2 / 6, y + 0 / 6, x + 1, y + 4 / 6, h1, h2, wf3)
    for t, n, px_, yb in face_iter(x + 1 / 6, y + 1 / 6, x + 5 / 6, y + 5 / 6, 0, 'L'):
        if n // 2 - 1 <= t <= n // 2 + 1:
            for k in range(h1 - 12, h1 - 2): put(px_, yb - k, banner)
    for t, n, px_, yb in face_iter(x + 1 / 6, y + 1 / 6, x + 5 / 6, y + 5 / 6, 0, 'R'):
        if 1 <= t < n:
            for k in range(1, 4): put(px_, yb - k, hexc('#5f86aa'))
    cx, cy = P(x + 0.66, y + 0.33, h)
    poly([(cx - 4, cy), (cx + 3, cy), (cx - 2, cy - 8)], mix(base, 1.25))

def draw_capitol(x, y):
    stone = hexc('#ece6d8')
    # broad base (4 stories), wings
    box(x + 0.02, y + 0.12, x + 0.98, y + 0.88, 0, 12, stone)
    def wf(side, t, n, k):
        if t <= 0 or t >= n or k >= 11: return None
        if 2 <= k <= 9: return mix(stone, 1.2) if t % 3 == 0 else (hexc('#8a8478') if side == 'L' else hexc('#6a645a'))
        return None
    windows(x + 0.02, y + 0.12, x + 0.98, y + 0.88, 0, 12, wf)
    # portico pediment on left face
    L, F, R, B = faces(x + 0.3, y + 0.12, x + 0.7, y + 0.88, 0, 0)
    poly([(L[0], L[1] - 12), (F[0], F[1] - 12), ((L[0] + F[0]) // 2, (L[1] + F[1]) // 2 - 18)], mix(stone, 1.1))
    # drum
    box(x + 1 / 3, y + 1 / 3, x + 2 / 3, y + 2 / 3, 12, 12, hexc('#e6dfcf'))
    def wf2(side, t, n, k):
        if t <= 0 or t >= n: return None
        return hexc('#c8bfa8') if t % 2 == 0 and 2 < k < 10 else None
    windows(x + 1 / 3, y + 1 / 3, x + 2 / 3, y + 2 / 3, 12, 12, wf2)
    cx, cy = P(x + .5, y + .5, 24)
    cy += 2
    dome(cx, cy, 7, hexc('#e0b020'))
    d.line([cx - 7, cy, cx + 7, cy], fill=hexc('#b88a10'))
    d.rectangle([cx - 1, cy - 11, cx, cy - 8], fill=hexc('#f0d060'))
    put(cx, cy - 12, hexc('#fff0a0')); put(cx - 1, cy - 12, hexc('#f0d060'))

def draw_union_station(x, y):
    tan = hexc('#d6b88a')
    box(x + 0.0, y + 0.22, x + 1.0, y + 0.78, 0, 8, tan)
    def wf(side, t, n, k):
        if t <= 0 or t >= n or k >= 7: return None
        if side == 'L' and 1 <= k <= 5 and t % 4 in (1, 2): return hexc('#3a3040') if k < 5 else mix(tan, 0.8)
        if side == 'R' and 2 <= k <= 5 and t % 3 == 1: return hexc('#3a3040')
        return None
    windows(x + 0.0, y + 0.22, x + 1.0, y + 0.78, 0, 8, wf)
    box(x + 0.32, y + 0.22, x + 0.68, y + 0.78, 8, 7, mix(tan, 1.05))
    # big arched windows + red sign
    for t, n, px_, yb in face_iter(x + 0.32, y + 0.22, x + 0.68, y + 0.78, 8, 'L'):
        if 1 <= t <= n - 1:
            for k in range(1, 5): put(px_, yb - k, hexc('#3a4a6a') if t % 2 else hexc('#5a6a8a'))
            put(px_, yb - 6, hexc('#d02828'))
    cx, cy = P(x + .5, y + .5, 15)
    poly([(cx - 5, cy + 1), (cx + 5, cy + 1), (cx, cy - 3)], hexc('#7a4a3a'))

def draw_courthouse(x, y):
    st = hexc('#cfc8b8')
    box(x + 0.12, y + 0.12, x + 0.88, y + 0.88, 0, 15, st)
    def wf(side, t, n, k):
        if t <= 0 or t >= n or k >= 14: return None
        if k < 8: return mix(st, 1.18) if t % 2 == 0 else mix(st, 0.55 if side == 'L' else 0.45)
        if k % 3 == 0: return None
        return hexc('#3a4660') if t % 3 == 1 else None
    windows(x + 0.12, y + 0.12, x + 0.88, y + 0.88, 0, 15, wf)
    L, F, R, B = faces(x + 0.12, y + 0.12, x + 0.88, y + 0.88, 0, 0)
    poly([(L[0], L[1] - 8), (F[0], F[1] - 8), ((L[0] + F[0]) // 2, (L[1] + F[1]) // 2 - 13)], mix(st, 1.12))
    box(x + 0.4, y + 0.4, x + 0.6, y + 0.6, 15, 6, hexc('#9ab0a0'))
    cx, cy = P(x + .5, y + .5, 21); dome(cx, cy + 1, 3, hexc('#7fa898'))

def draw_art_museum(x, y):
    ti = hexc('#b8c0c8')
    box(x + 0.1, y + 0.3, x + 0.6, y + 0.9, 0, 10, hexc('#8a8478'))  # Ponti tower-ish base
    for t, n, px_, yb in face_iter(x + 0.1, y + 0.3, x + 0.6, y + 0.9, 0, 'L'):
        for k in range(2, 9, 3):
            if t % 3 == 1: put(px_, yb - k, hexc('#d8d4cc'))
    # Hamilton titanium shards
    a = P(x + 0.35, y + 0.15); b = P(x + 0.95, y + 0.15); c = P(x + 0.95, y + 0.75)
    poly([P(x + .35, y + .75), P(x + .95, y + .75), (c[0], c[1] - 10), (a[0] - 10, a[1] - 26)], ti)
    poly([P(x + .95, y + .75), P(x + .95, y + .15), (b[0] + 2, b[1] - 14), (c[0], c[1] - 10)], mix(ti, 0.7))
    poly([(a[0] - 10, a[1] - 26), (c[0], c[1] - 10), (b[0] + 2, b[1] - 14), (a[0] + 2, a[1] - 18)], mix(ti, 1.25))
    d.line([(a[0] - 10, a[1] - 26), (c[0], c[1] - 10)], fill=hexc('#ffffff'))

def draw_park(p, x, y):
    r = rnd('park', p['name'])
    name = p['name']
    if name == 'Washington Park' or name == 'City Park':
        cx, cy = P(x + .55, y + .55)
        d.ellipse([cx - 6, cy - 3, cx + 6, cy + 3], fill=hexc('#3a7ad0'))
        d.line([cx - 3, cy - 1, cx + 1, cy - 1], fill=hexc('#a0d0ff'))
    # path
    d.line([P(x + .1, y + .5), P(x + .9, y + .5)], fill=hexc('#d8cc98'))
    if name == 'Cheesman Park':
        box(x + .38, y + .38, x + .62, y + .62, 0, 6, hexc('#f0ece0'), outline=False)
        cx, cy = P(x + .5, y + .5, 6)
        for i in range(-3, 4): put(cx + i, cy, hexc('#c0b8a8'))
        for t, n, px_, yb in face_iter(x + .38, y + .38, x + .62, y + .62, 0, 'L'):
            if t % 2: 
                for k in range(1, 5): put(px_, yb - k, hexc('#6a9a5a'))
    spots = [(.2, .2), (.8, .2), (.2, .8), (.8, .8), (.5, .15), (.15, .5), (.85, .5), (.5, .85)]
    r.shuffle(spots)
    nt = 6 if name == 'City Park' else (3 if name == 'Washington Park' else 5)
    for (u, v) in sorted(spots[:nt], key=lambda s: s[0] + s[1]):
        tx, ty = P(x + u, y + v)
        tree(tx, ty, r.random() < .5, hexc(r.choice(['#2f7a32', '#3a8a3a', '#286a2c', '#4a9a3a'])))

def draw_crane(b, x, y, built_h, full_h):
    r = rnd('crane', b['id'])
    # wireframe for unbuilt stories
    i0 = 1 / 6
    L, F, R, B = faces(x + i0, y + i0, x + 1 - i0, y + 1 - i0, 0, 0)
    steel = hexc('#e07a20')
    for k in range(built_h, full_h + 1, STORY):
        d.line([(L[0], L[1] - k), (F[0], F[1] - k), (R[0], R[1] - k)], fill=steel)
    for p in (L, F, R):
        d.line([(p[0], p[1] - built_h), (p[0], p[1] - full_h)], fill=steel)
    # scaffolding on the built part (left face)
    for t, n, px_, yb in face_iter(x + i0, y + i0, x + 1 - i0, y + 1 - i0, 0, 'L'):
        if t % 4 == 0:
            for k in range(0, built_h): 
                if k % 2 == 0: put(px_ - 1, yb - k + 1, hexc('#c8b070'))
    if os.environ.get('MC_NO_TOWER'): return   # animation draws its own moving crane
    # tower crane at back corner
    mx, my = P(x + .12, y + .12)
    top = my - full_h - 16
    for yy in range(top, my + 1):
        put(mx, yy, hexc('#f0c020')); put(mx + 1, yy, hexc('#c89a10') if yy % 3 else hexc('#f0c020'))
    jl, jr = mx - 8, mx + 26
    d.line([jl, top, jr, top], fill=hexc('#f0c020'))
    d.line([mx, top - 4, jr, top], fill=hexc('#c89a10'))
    d.line([mx, top - 4, jl, top], fill=hexc('#c89a10'))
    d.rectangle([jl, top + 1, jl + 3, top + 3], fill=hexc('#808080'))  # counterweight
    hx = mx + 18
    d.line([hx, top, hx, top + 14], fill=hexc('#404040'))
    d.rectangle([hx - 1, top + 15, hx + 1, top + 16], fill=hexc('#f0c020'))
    put(mx, top - 5, hexc('#ff3030'))

# ---------------------------------------------------------------- side quests (2x2 blocks)
def ellipse_stack(cx, cy, rx, ry, h, c_wall, c_top):
    for k in range(h):
        d.ellipse([cx - rx, cy - ry - k, cx + rx, cy + ry - k], fill=c_wall if k < h - 1 else c_top)

def draw_sidequest(q):
    x, y, w = q['x'], q['y'], q['w']
    cx, cy = P(x + w / 2, y + w / 2)
    n = q['name']
    if n == 'Coors Field':
        tile_fill = hexc('#b4ada0')
        poly([P(x, y), P(x + w, y), P(x + w, y + w), P(x, y + w)], tile_fill)
        ellipse_stack(cx, cy, 21, 11, 9, hexc('#8a3a2a'), hexc('#a84a34'))
        for i in range(-20, 21, 3): put(cx + i, cy - 4 + int(abs(i) * 0.1), hexc('#d8c8b0'))
        d.ellipse([cx - 16, cy - 8 - 8, cx + 16, cy + 8 - 8], fill=hexc('#2c6a3a'))
        d.ellipse([cx - 14, cy - 7 - 8, cx + 14, cy + 7 - 8], fill=hexc('#3fa048'))
        # infield diamond
        poly([(cx, cy - 4), (cx + 6, cy - 7), (cx, cy - 10), (cx - 6, cy - 7)], hexc('#c89060'))
        poly([(cx, cy - 5), (cx + 4, cy - 7), (cx, cy - 9), (cx - 4, cy - 7)], hexc('#3fa048'))
        for i in range(5): put(cx - 18 + i * 9, cy - 16 - (2 if i == 2 else 0), hexc('#f0f0f0'))  # lights
    elif n == 'Ball Arena':
        poly([P(x, y), P(x + w, y), P(x + w, y + w), P(x, y + w)], hexc('#9a9a9a'))
        ellipse_stack(cx, cy, 19, 10, 10, hexc('#6a7a8a'), hexc('#8a9aaa'))
        for i in range(-18, 19, 2): put(cx + i, cy - 3, hexc('#2a3a4a'))
        for k in range(6):
            d.ellipse([cx - 16 + k * 2, cy - 18 - k, cx + 16 - k * 2, cy - 2 - k], fill=mix(hexc('#e8ecf0'), 1 - 0.03 * (5 - k)))
        d.line([cx - 8, cy - 20, cx + 4, cy - 22], fill=hexc('#ffffff'))
    elif n == 'Empower Field at Mile High':
        poly([P(x, y), P(x + w, y), P(x + w, y + w), P(x, y + w)], hexc('#9a9a9a'))
        ellipse_stack(cx, cy, 22, 11, 12, hexc('#3a5aa0'), hexc('#e07020'))
        d.ellipse([cx - 15, cy - 19, cx + 15, cy - 5], fill=hexc('#3fa048'))
    elif n == 'Confluence Park bridge':
        poly([P(x, y), P(x + w, y), P(x + w, y + w), P(x, y + w)], hexc('#6aa84f'))
        poly([P(x + .6, y), P(x + 1.4, y), P(x + 1.4, y + w), P(x + .6, y + w)], hexc('#3a7ad0'))
        for k in range(0, 2 * w * 6, 3):
            a = P(x + 0.8, y + k / 12); put(a[0], a[1], hexc('#a0d0ff'))
        poly([P(x + .6, y + 0.85), P(x + 1.4, y + 0.85), P(x + 1.4, y + 1.15), P(x + .6, y + 1.15)], hexc('#e8e8e0'))
        a, b = P(x + 0.6, y + 1.15), P(x + 1.4, y + 1.15)
        for i in range(a[0], b[0] + 1):
            t = (i - a[0]) / max(1, b[0] - a[0])
            yy = a[1] + (b[1] - a[1]) * t - math.sin(t * math.pi) * 6
            put(i, int(yy), hexc('#ffffff')); put(i, int(yy) - 1, hexc('#d0d0d0'))
        for (u, v) in [(.25, .3), (.2, 1.6), (1.7, .4), (1.75, 1.5), (.3, 1.0)]:
            tx, ty = P(x + u, y + v); tree(tx, ty, True)
    elif n == '16th Street Mall':
        poly([P(x, y), P(x + w, y), P(x + w, y + w), P(x, y + w)], hexc('#b06a5a'))
        for yy in range(y * 6, (y + w) * 6):
            pass
        for i in range(8):
            for j in range(8):
                if (i + j) % 2 == 0:
                    a = P(x + i / 4 + 0.125, y + j / 4 + 0.125); put(a[0], a[1], hexc('#8a8a8a'))
        for (u, v) in [(.3, .3), (.3, 1.0), (.3, 1.7), (1.7, .3), (1.7, 1.0), (1.7, 1.7)]:
            tx, ty = P(x + u, y + v); tree(tx, ty, False)
        box(x + .85, y + .45, x + 1.15, y + 1.2, 0, 5, hexc('#f0f0f0'), outline=False)  # MallRide bus
        for t, n_, px_, yb in face_iter(x + .85, y + .45, x + 1.15, y + 1.2, 0, 'R'):
            put(px_, yb - 1, hexc('#2050b0'))
            if t % 2: put(px_, yb - 3, hexc('#304060'))
        for (u, v) in [(1.0, .2), (1.0, 1.8)]:
            a = P(x + u, y + v); d.line([a[0], a[1], a[0], a[1] - 7], fill=hexc('#303030')); put(a[0], a[1] - 8, hexc('#ffe58a'))
    elif n == 'Red Rocks Amphitheatre':
        poly([P(x, y), P(x + w, y), P(x + w, y + w), P(x, y + w)], hexc('#8a7a50'))
        # seating rows
        for k in range(6):
            a, b = P(x + .5 + k * .12, y + 1.6 - k * .1), P(x + 1.5 + k * .05, y + .5 + k * .02)
            d.line([a, b], fill=hexc('#d8d0c0') if k % 2 == 0 else hexc('#a89880'))
        # stage
        poly([P(x + 1.2, y + 1.3), P(x + 1.6, y + 1.3), P(x + 1.6, y + 1.7), P(x + 1.2, y + 1.7)], hexc('#404040'))
        # monoliths
        def slab(base_pts, top_pts, c):
            poly(base_pts + top_pts[::-1], c)
        a = P(x + 0.1, y + 0.2); b = P(x + 0.5, y + 1.9)
        poly([a, b, (b[0] + 2, b[1] - 30), (a[0] + 8, a[1] - 34)], hexc('#b84a2a'))
        poly([b, (b[0] + 6, b[1] - 2), (b[0] + 8, b[1] - 26), (b[0] + 2, b[1] - 30)], hexc('#8a3018'))
        e = P(x + 1.9, y + 0.1); f = P(x + 1.9, y + 1.0)
        poly([(e[0] - 4, e[1]), f, (f[0] - 2, f[1] - 26), (e[0] - 10, e[1] - 30)], hexc('#c85a34'))
        poly([f, (f[0] + 5, f[1] - 3), (f[0] + 2, f[1] - 24), (f[0] - 2, f[1] - 26)], hexc('#8a3018'))
        for i in range(0, 30, 4): put(a[0] + 4 + i // 6, a[1] - 4 - i, hexc('#d86a44'))

# ---------------------------------------------------------------- draw objects in depth order
objs = []
for b in city['buildings']:
    objs.append((b['x'] + b['y'], b['x'], 'b', b))
for l in city['landmarks']:
    if l['key'] != 'capitol': objs.append((l['x'] + l['y'], l['x'], 'l', l))
for p in city['parks']: objs.append((p['x'] + p['y'], p['x'], 'p', p))
for q in city['sideQuests']: objs.append((q['x'] + q['y'] + 2, q['x'] + 1, 'q', q))
objs.sort(key=lambda o: (o[0], o[1]))
DRAW = {'skyscraper': draw_skyscraper, 'office': draw_office, 'mixeduse': draw_mixeduse,
        'rowhouse': draw_rowhouse, 'state': draw_state, 'museum': draw_museum}
for _, _, kind, o in objs:
    x, y = o.get('x'), o.get('y')
    if kind == 'b':
        if o['type'] == 'capitol':
            draw_capitol(x, y); continue
        r = rnd('b', o['id'], o['variant'])
        if o['status'] == 'complete':
            DRAW[o['type']](o, x, y, o['targetStories'], r)
        else:
            built = int(o['storiesBuilt'])
            if built > 0: DRAW[o['type']](o, x, y, built, r)
            draw_crane(o, x, y, built * STORY, o['targetStories'] * STORY)
    elif kind == 'l':
        {'unionStation': draw_union_station, 'courthouse': draw_courthouse,
         'artMuseum': draw_art_museum}.get(o['key'], lambda *a: None)(x, y)
    elif kind == 'p': draw_park(o, x, y)
    elif kind == 'q': draw_sidequest(o)

# ---------------------------------------------------------------- legend strip (3x5 pixel font)
FONT = {
 'A':'010101111101101','B':'110101110101110','C':'011100100100011','D':'110101101101110','E':'111100110100111',
 'F':'111100110100100','G':'011100101101011','H':'101101111101101','I':'111010010010111','J':'001001001101010',
 'K':'101101110101101','L':'100100100100111','M':'101111111101101','N':'110101101101101','O':'010101101101010',
 'P':'110101110100100','Q':'010101101110011','R':'110101110101101','S':'011100010001110','T':'111010010010010',
 'U':'101101101101111','V':'101101101101010','W':'101101111111101','X':'101101010101101','Y':'101101010010010',
 'Z':'111001010100111','0':'111101101101111','1':'010110010010111','2':'110001010100111','3':'110001010001110',
 '4':'101101111001001','5':'111100110001110','6':'011100111101111','7':'111001010010010','8':'111101111101111',
 '9':'111101111001110',' ':'000000000000000','.':'000000000000010',',':'000000000010100',':':'000010000010000',
 '-':'000000111000000','/':'001001010100100','+':'000010111010000','#':'101111101111101','(':'010100100100010',
 ')':'010001001001010',"'":'010010000000000','%':'101001010100101','&':'010101010101011','=':'000111000111000',
 '>':'100010001010100','<':'001010100010001','!':'010010010000010','*':'000101010101000'}
def text(x, y, s, c, shadow=None):
    for ch in s.upper():
        g = FONT.get(ch, FONT[' '])
        for i, bit in enumerate(g):
            if bit == '1':
                if shadow: img.putpixel((x + i % 3 + 1, y + i // 3 + 1), shadow)
                img.putpixel((x + i % 3, y + i // 3), c)
        x += 4
    return x

if LT:
    import hashlib as _h
    def _hf(*k): return int(_h.md5(('|'.join(map(str, k))).encode()).hexdigest()[:8], 16) / 0xffffffff
    a_ = _arr()
    cm_ = np.zeros(a_.shape[:2], bool); cm_[:MAP_H] = np.any(a_[:MAP_H] != _env_snap[:MAP_H], axis=2)
    cm_[HORIZON:MAP_H] = True                                       # plains + map
    amb = np.array(LT['ambient'], np.float32)
    M = np.ones_like(a_); M[cm_] = amb
    grd = np.all(a_ == _ground_snap, axis=2)                        # ground still visible
    SL = LT['streetLights']; WL = LT['windowLight']
    warm = np.array([1.25, 1.02, 0.70], np.float32)
    def _pool(cx, cy, rx, ry, strength, col=warm, ground_only=True):
        x0, x1 = max(0, int(cx - rx)), min(W - 1, int(cx + rx)); y0, y1 = max(0, int(cy - ry)), min(MAP_H - 1, int(cy + ry))
        for yy in range(y0, y1 + 1):
            for xx in range(x0, x1 + 1):
                dd = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
                if dd < 1 and (grd[yy, xx] or not ground_only):
                    f = strength * (1 - dd) ** 1.5
                    if (xx + yy) % 2 and dd > 0.55: f *= 0.5                 # dithered edge
                    M[yy, xx] = M[yy, xx] + (col - M[yy, xx]) * min(1, f)
    emis = []                                                        # (x, y, rgb) drawn after tint
    # streetlights at every intersection (poles visible at all times)
    for (x, y) in sorted(road):
        if x % PER or y % PER: continue
        bx, by = P(x + 0.85, y + 0.85)
        if not (0 <= bx < W and 0 <= by < MAP_H) or not grd[by, bx]: continue
        for k in range(1, 7): a_[by - k, bx] = (96, 98, 110)
        a_[by - 6, bx + 1] = (96, 98, 110)
        if SL > 0.05:
            _pool(bx, by, 10, 5, 0.85 * SL)
            emis.append((bx + 1, by - 6, (255, 238, 170)))
            emis.append((bx + 1, by - 5, (255, 214, 130)))
    # car head/tail lights
    for (cx, cy, hr) in CARS:
        if not (0 <= cx < W - 2 and 0 <= cy < MAP_H) or not grd[cy, cx]: continue
        if SL > 0.05:
            if hr: hx, hy, tx, ty, dx = cx + 1, cy, cx, cy - 1, 1
            else:  hx, hy, tx, ty, dx = cx, cy, cx + 1, cy - 1, -1
            _pool(hx + dx * 4, hy + 2, 4, 2, 0.8 * SL, np.array([1.3, 1.25, 1.0], np.float32))
            emis.append((hx, hy, (255, 250, 214))); emis.append((tx, ty, (220, 40, 40)))
    # facade windows: deterministic random subset glows warm
    lit_cols = [(255, 214, 110), (255, 228, 150), (250, 190, 95), (255, 240, 190)]
    frac = 0.5 * WL
    for (x, y, c, row) in WINPIX:
        if not (0 <= x < W and 0 <= y < MAP_H) or tuple(a_[y, x]) != tuple(c): continue
        if c == WIN_LIT and WL > 0.3:
            emis.append((x, y, (255, 226, 130))); continue
        lum = sum(c) / 3
        h_ = _hf(x // 2, row)
        if lum < 140 and h_ < frac:
            emis.append((x, y, lit_cols[int(_hf(x // 2, row, 'c') * 4)]))
    # floodlit gold (Capitol dome, crane) stays readable at night
    gold = cm_ & (a_[..., 0] > 200) & (a_[..., 1] > 140) & (a_[..., 2] < 90)
    M[gold] = np.maximum(M[gold], 0.82)
    a_ = a_ * M
    for (x, y, c) in emis: a_[y, x] = c
    _set(a_)

top = MAP_H
d.rectangle([0, top, W - 1, H - 1], fill=hexc('#1e2230'))
d.line([0, top, W - 1, top], fill=hexc('#e0b020'))
d.line([0, top + 1, W - 1, top + 1], fill=hexc('#8a6a10'))
Y = top + 6
WHITE, GOLD, GREY, GREEN = hexc('#f0f0f0'), hexc('#f0c040'), hexc('#9aa0b0'), hexc('#80d070')
x = text(6, Y, 'MARATHON CITY', GOLD, hexc('#5a4410'))
x = text(x + 8, Y, 'DENVER, CO  -  BUILT FROM %d RUNS, AS OF %s' % (S['activities']['run']['count'], S['asOf']), GREY)
if LT: text(x + 10, Y, 'LOCAL TIME %s - %s' % (MC_TIME_LABEL, LT['phase'].upper()), hexc('#f0a040'))
Y += 10
ip = S['inProgress'][0] if S['inProgress'] else None
x = text(6, Y, 'RUN MILES %.2f = %.2f STORIES' % (S['totalRunMiles'], S['totalStoriesBuilt']), WHITE)
x = text(x + 12, Y, 'BUILDINGS DONE %d + STATE CAPITOL' % (S['buildingsCompleted'] - (1 if S['capitol'] and S['capitol']['status'] == 'complete' else 0)), WHITE)
if ip:
    text(x + 12, Y, 'UNDER CONSTRUCTION: %s %.2f/%d ST (%.1f%%)' % (ip['label'].upper(), ip['storiesBuilt'], ip['targetStories'], ip['progressPct']), hexc('#f0a040'))
Y += 10
sw = {'skyscraper': '#4a78a8', 'office': '#b9b2a3', 'mixeduse': '#b5653a', 'rowhouse': '#d98c8c', 'state': '#d8d0bc', 'museum': '#a9b0b8'}
names = {'skyscraper': 'SKYSCRAPERS', 'office': 'MID-RISE OFFICES', 'mixeduse': 'MIXED-USE', 'rowhouse': 'ROWHOUSES', 'state': 'STATE BLDGS', 'museum': 'MUSEUMS'}
x = 6
for k in ['skyscraper', 'office', 'mixeduse', 'rowhouse', 'state', 'museum']:
    d.rectangle([x, Y, x + 4, Y + 4], fill=hexc(sw[k])); d.rectangle([x, Y, x + 4, Y], fill=mix(hexc(sw[k]), 1.3))
    x = text(x + 7, Y, '%s %d' % (names[k], S['completedByType'].get(k, 0)), WHITE) + 10
Y += 10
short = {'Denver Art Museum': 'ART MUSEUM'}
x = text(6, Y, 'LANDMARKS:', GOLD)
for l in S['landmarksEarned']:
    x = text(x + 4, Y, short.get(l['name'], l['name']) + " '" + l['date'][2:4], WHITE)
x = text(x + 10, Y, 'LOCKED:', hexc('#e06060'))
for l in S['landmarksLocked']: x = text(x + 4, Y, l['name'] + ' (NEEDS 13.1 MI RUN)' if l['key'] == 'cathedral' else l['name'], GREY)
Y += 10
pk = S['parks']
named = [p['name'].replace('Washington', 'WASH') for p in pk if not p['name'].startswith('Neighborhood')]
x = text(6, Y, 'PARKS %d:' % len(pk), GREEN)
x = text(x + 4, Y, ', '.join(named) + ' + %d NEIGHBORHOOD' % (len(pk) - len(named)), WHITE)
Y += 10
x = text(6, Y, 'SIDE QUESTS:', hexc('#70b0f0'))
x = text(x + 4, Y, ', '.join(q['name'].replace('Amphitheatre', '').replace(' bridge', '').strip() for q in S['sideQuestsEarned']), WHITE)
x = text(x + 10, Y, 'LOCKED:', hexc('#e06060'))
x = text(x + 4, Y, ', '.join(q['name'].replace(' at Mile High', '').replace('Denver Athletic Club', 'DAC') for q in S['sideQuestsLocked']), GREY)
Y += 10
text(6, Y, 'TALLEST: %d STORIES   LOTS USED %d/%d   1 RUN MILE = 1 STORY' % (
    max(b['targetStories'] for b in city['buildings'] if b['status'] == 'complete' and b['type'] != 'capitol'), S['lotsUsed'], S['lotsTotal']), GREY)

img = img.resize((W * SCALE, H * SCALE), Image.NEAREST)
img.save(OUT)
print('wrote', OUT, img.size)
