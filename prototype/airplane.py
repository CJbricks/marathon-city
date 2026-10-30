# Marathon City: airplane banner event preview (every 4th run > 5 mi).
import json, math, random, subprocess, os, re, sys
from PIL import Image
W, H, FPS, DUR, UP = 320, 200, 15, 8.0, 3
src = open('loading.js').read()
FONT = json.loads(re.search(r'const FONT = (\{.*?\});', src).group(1))
NAVY=(13,42,107); GOLD=(253,216,53); GOLDD=(184,138,0); RED=(214,40,40)
WHITE=(255,255,255); GREY=(201,214,242); DGREY=(111,134,201); LINE=(60,60,70)
CLOTH=(255,243,160); CLOTHS=(230,200,110)
seed = int(sys.argv[1]) if len(sys.argv) > 1 else 4
quote = random.Random(seed).choice(json.load(open('quotes.json'))['quotes'])['text'].upper()
print('QUOTE:', quote)
bg = Image.open('preview.png').convert('RGB')
s = bg.width / W
bg = bg.crop((0, 0, bg.width, int(H * s))).resize((W, H), Image.NEAREST)
tw = 4 * len(quote) - 1
BW, BH = tw + 8, 11
def put(im, x, y, c):
    if 0 <= x < W and 0 <= y < H: im.putpixel((int(x), int(y)), c)
def plane(im, x, y, f):  # nose points right, x,y = tail left
    for i in range(16): put(im, x+i, y+2, WHITE); put(im, x+i, y+3, GREY)
    for i in range(2,15): put(im, x+i, y+1, WHITE)
    for i in range(3,14): put(im, x+i, y+4, DGREY)
    for i in range(2,15): put(im, x+i, y+2, RED if i in (6,7,8,9,10,11) and False else im.getpixel((int(x+i),int(y+2))) if 0<=x+i<W else WHITE)
    for i in range(1,15): put(im, x+i, y+3, RED) if i % 1 == 0 else None  # red stripe
    for j in range(-1,2): put(im, x, y+j, WHITE); put(im, x+1, y+j, GREY)  # tail fin
    put(im, x, y-2, RED); put(im, x+1, y-2, RED)
    for i in range(6,11): put(im, x+i, y+5, GOLD); put(im, x+i, y+6, GOLDD)  # wing
    put(im, x+11, y+1, NAVY); put(im, x+12, y+1, NAVY)  # cockpit
    put(im, x+16, y+2, GOLD); put(im, x+16, y+3, GOLD)  # spinner
    for j in ([(-1,0),(1,4),(5,6)] [f % 3:f % 3 + 1]):    # prop blur
        pass
    pr = [(0,1,4,5),(1,2,3,4),(-1,0,5,6)][f % 3]
    for yy in pr: put(im, x+17, y+yy, DGREY)
def banner(im, x, y, f):
    for i in range(BW):
        off = round(math.sin(i * 0.35 - f * 2.1) * (0.4 + i / BW))
        for j in range(BH):
            c = CLOTHS if (i == 0 or j in (0, BH-1)) else CLOTH
            if (i + f) % 9 == 0 and 0 < j < BH-1: c = CLOTHS
            put(im, x+i, y+j+off, c)
    cx = x + 4
    for k, ch in enumerate(quote):
        g = FONT.get(ch, FONT[' ']); off = round(math.sin((cx-x+1) * 0.35 - f * 2.1) * (0.4 + (cx-x) / BW))
        for b, bit in enumerate(g):
            if bit == '1': put(im, cx + b % 3, y + 3 + b // 3 + off, NAVY)
        cx += 4
frames = []
NF = int(DUR * FPS); total = W + BW + 40 + 22
for n in range(NF):
    im = bg.copy(); f = n // 2
    px = -BW - 30 + total * n / (NF - 1)
    py = 26 + round(math.sin(n * 0.3) * 1)
    bx = px - 10 - BW
    for i in range(int(bx + BW), int(px)): put(im, i, py + 3 + (i - bx - BW) * 0 // 1 if False else py + 4 - round((px - i) * 0) , LINE)
    banner(im, bx, py - 1, f)
    plane(im, px, py, n)
    frames.append(im)
os.makedirs('air_frames', exist_ok=True)
for i, im in enumerate(frames): im.save(f'air_frames/{i:03d}.png')
frames[min(range(NF), key=lambda n: abs((-BW-30+total*n/(NF-1)) - 10 - BW - (W-BW-30)//2))].resize((W*UP, H*UP), Image.NEAREST).save('airplane_still.png')
sc = f'scale={W*UP}:{H*UP}:flags=neighbor'
subprocess.run(['ffmpeg','-y','-loglevel','error','-framerate',str(FPS),'-i','air_frames/%03d.png','-vf',sc,'-c:v','libx264','-pix_fmt','yuv420p','-crf','16','airplane_anim.mp4'],check=True)
subprocess.run(['ffmpeg','-y','-loglevel','error','-framerate',str(FPS),'-i','air_frames/%03d.png','-vf',sc+',split[a][b];[a]palettegen[p];[b][p]paletteuse=dither=none','airplane_anim.gif'],check=True)
