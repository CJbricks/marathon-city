#!/usr/bin/env python3
"""Render the city at several local times and assemble a 2x2 contact sheet.
Usage: python3 tod_sheet.py [HH:MM ...]  (default 08:30 12:30 18:45 22:00)"""
import os, sys, json, subprocess
from PIL import Image, ImageDraw
times = sys.argv[1:] or ['08:30', '12:30', '18:45', '22:00']
src = open('render.py').read()
FONT = {}
exec('FONT = ' + src.split('FONT = ')[1].split('def text')[0], globals())
def label(s, fg, bg=(20, 22, 36), border=(224, 176, 32)):
    w = 4 * len(s) + 5; im = Image.new('RGB', (w, 11), bg); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w - 1, 10], outline=border)
    x = 3
    for ch in s.upper():
        for i, bit in enumerate(FONT.get(ch, FONT[' '])):
            if bit == '1': im.putpixel((x + i % 3, 3 + i // 3), fg)
        x += 4
    return im.resize((w * 3, 33), Image.NEAREST)
cells = []
for t in times:
    out = 'tod_%s.png' % t.replace(':', '')
    subprocess.run(['python3', 'render.py', 'city.json', out], check=True, env=dict(os.environ, MC_TIME=t), capture_output=True)
    base = '/tmp/tod_base_%s.png' % t.replace(':', '')
    subprocess.run(['python3', 'render.py', 'city.json', base], check=True, env=dict(os.environ, MC_TIME=t, MC_SCALE='1'), capture_output=True)
    L = json.loads(subprocess.run(['node', 'lighting.js', t], capture_output=True, text=True, check=True).stdout)
    cell = Image.open(base).convert('RGB').crop((0, 0, 640, 430))
    cells.append((cell, '%s  %s' % (t, L['phase'])))
    print('wrote', out)
cw, ch = 640, 430; gap = 4
sheet = Image.new('RGB', (cw * 2 + gap * 3, ch * 2 + gap * 3), (20, 22, 36))
for i, (cell, txt) in enumerate(cells):
    x, y = gap + (i % 2) * (cw + gap), gap + (i // 2) * (ch + gap)
    sheet.paste(cell, (x, y))
    sheet.paste(label(txt, (255, 214, 90)), (x + 8, y + 8))
sheet.save('tod_sheet.png'); print('wrote tod_sheet.png', sheet.size)
