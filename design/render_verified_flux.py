from PIL import Image, ImageDraw, ImageFont
import math
import random

W, H = 1800, 1125
BG = "#07110F"
PANEL = "#0D1A17"
PANEL_2 = "#11231E"
GRID = "#18342C"
WHITE = "#ECF7F2"
MUTED = "#7D9B90"
GREEN = "#39E58C"
CYAN = "#62D7E6"
AMBER = "#F3B84B"
RED = "#F46D62"

FONT_DIR = r"C:\Users\dingd\.codex\skills\canvas-design\canvas-fonts"
DISPLAY = ImageFont.truetype(FONT_DIR + r"\BigShoulders-Bold.ttf", 142)
DISPLAY_SM = ImageFont.truetype(FONT_DIR + r"\BigShoulders-Bold.ttf", 64)
BODY = ImageFont.truetype(FONT_DIR + r"\InstrumentSans-Regular.ttf", 26)
BODY_B = ImageFont.truetype(FONT_DIR + r"\InstrumentSans-Bold.ttf", 25)
MONO = ImageFont.truetype(FONT_DIR + r"\GeistMono-Regular.ttf", 18)
MONO_B = ImageFont.truetype(FONT_DIR + r"\GeistMono-Bold.ttf", 18)

im = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(im)

# Patiently repeated analytical grid.
for x in range(60, W, 36):
    d.line((x, 0, x, H), fill=GRID, width=1)
for y in range(45, H, 36):
    d.line((0, y, W, y), fill=GRID, width=1)

# Left datum and identity.
d.rectangle((0, 0, 18, H), fill=GREEN)
d.text((78, 62), "COMPUTE / CONTROL", font=MONO_B, fill=GREEN)
d.text((78, 112), "VERIFIED", font=DISPLAY, fill=WHITE)
d.text((78, 242), "FLUX", font=DISPLAY, fill=WHITE)
d.text((86, 386), "TRUST IS A MEASURABLE STATE", font=BODY_B, fill=CYAN)
d.text((86, 430), "CAPACITY  ·  DELIVERY  ·  AUDIT", font=MONO, fill=MUTED)

# Primary capacity field.
field = (78, 520, 1088, 1038)
d.rounded_rectangle(field, radius=12, fill=PANEL, outline="#295044", width=2)
d.text((112, 556), "LIVE CAPACITY FIELD", font=MONO_B, fill=WHITE)
d.text((890, 559), "REGION CN-EAST / 09", font=MONO, fill=MUTED)

random.seed(12)
origin = (145, 930)
destinations = []
for row in range(6):
    for col in range(10):
        x = 180 + col * 82
        y = 642 + row * 55 + (col % 2) * 6
        destinations.append((x, y))
        live = random.random() > 0.18
        c = GREEN if live else AMBER
        r = 5 if live else 7
        d.ellipse((x-r, y-r, x+r, y+r), fill=c)
        if (row + col) % 4 == 0:
            d.line((origin[0], origin[1], x, y), fill="#1D5A48", width=1)

# Flow trajectory and pulse points.
path = [(132, 954), (310, 892), (472, 920), (620, 814), (790, 840), (1034, 690)]
d.line(path, fill=CYAN, width=4, joint="curve")
for idx, (x, y) in enumerate(path):
    d.ellipse((x-8, y-8, x+8, y+8), outline=WHITE, width=2, fill=BG)
    d.text((x+14, y-11), f"0{idx+1}", font=MONO, fill=MUTED)

# Right-side operational truth cards.
cards = [
    ("AVAILABLE", "08,496", "GPU EQUIV.", GREEN),
    ("DELIVERY", "08:42", "P95 / MIN", CYAN),
    ("RISK", "00.12", "FAULT / %", AMBER),
]
for idx, (label, value, unit, color) in enumerate(cards):
    y = 112 + idx * 218
    box = (1180, y, 1718, y + 184)
    d.rounded_rectangle(box, radius=10, fill=PANEL_2, outline="#2B4A40", width=2)
    d.rectangle((1180, y, 1188, y + 184), fill=color)
    d.text((1222, y + 24), label, font=MONO_B, fill=color)
    d.text((1220, y + 54), value, font=DISPLAY_SM, fill=WHITE)
    d.text((1474, y + 132), unit, font=MONO, fill=MUTED)

# Verification strip.
d.rounded_rectangle((1180, 768, 1718, 1038), radius=10, fill="#EAF5EF")
d.text((1222, 806), "PROOF / 6A-91-CX", font=MONO_B, fill="#17342B")
d.text((1222, 862), "VERIFIED", font=DISPLAY_SM, fill="#07110F")
d.line((1224, 946, 1674, 946), fill="#9FB8AE", width=2)
for i in range(28):
    x = 1224 + i * 16
    h = 13 + (i * 17 % 39)
    d.rectangle((x, 1003-h, x+6, 1003), fill=GREEN if i % 5 else "#17342B")
d.text((1222, 1011), "TRACE COMPLETE / NO UNRESOLVED EVENTS", font=MONO, fill="#45665A")

# Tiny reference markers reward close inspection without competing for space.
d.text((1180, 1070), "ISO/CONTROL-07  ·  STATE/HEALTHY", font=MONO, fill=MUTED)
right_note = "SLA/99.95  ·  LEDGER/SEALED"
right_width = d.textbbox((0, 0), right_note, font=MONO)[2]
d.text((1718 - right_width, 1070), right_note, font=MONO, fill=MUTED)

out = r"C:\Users\dingd\Documents\ChatGPT\app\computer-x-clean\computer X\compute-x\web\public\verified-flux.png"
im.save(out, "PNG", optimize=True)
print(out)
