# Génère repere/reperes-atomes.pdf : les repères des atomes de la vue « Molécule », 20 par page A4.
# Ids 1 à 36 du dictionnaire ARUCO_MIP_36h12, dans l'ordre de CARDS (js/molecules.js).
# Lancer depuis le dossier de l'appli : python outils/repere_atomes.py
import re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
CARDS = [('H', 8), ('C', 6), ('O', 6), ('N', 4), ('Cl', 3), ('Na', 3), ('Mg', 3), ('I', 3)]
NAMES = {'H': 'Hydrogène', 'C': 'Carbone', 'O': 'Oxygène', 'N': 'Azote',
         'Cl': 'Chlore', 'Na': 'Sodium', 'Mg': 'Magnésium', 'I': 'Iode'}

# Codes du dictionnaire, lus dans la bibliothèque de détection elle-même.
src = (ROOT / 'lib/aruco/aruco.js').read_text(encoding='utf-8')
block = re.search(r'ARUCO_MIP_36h12:\s*{.*?codeList:\s*\[(.*?)\]', src, re.S).group(1)
CODES = [int(x, 16) for x in re.findall(r'0x[0-9a-fA-F]+', block)]

DPI = 300
MM = DPI / 25.4
W, H = int(210 * MM), int(297 * MM)
COLS, ROWS = 4, 5
MARGIN_X, MARGIN_TOP, MARGIN_BOTTOM = 10 * MM, 14 * MM, 6 * MM
CELL_W = (W - 2 * MARGIN_X) / COLS
CELL_H = (H - MARGIN_TOP - MARGIN_BOTTOM) / ROWS
SIDE = 34 * MM                      # carré noir du repère : 3,4 cm
F = 'C:/Windows/Fonts/'
sym_font = ImageFont.truetype(F + 'arialbd.ttf', int(9 * MM))
name_font = ImageFont.truetype(F + 'arial.ttf', int(2.8 * MM))
head_font = ImageFont.truetype(F + 'arial.ttf', int(3.2 * MM))


def marker(code, cell):
    bits = format(code, '036b')
    img = Image.new('RGB', (8 * cell, 8 * cell), 'black')
    d = ImageDraw.Draw(img)
    for y in range(6):
        for x in range(6):
            if bits[y * 6 + x] == '1':
                d.rectangle([(x + 1) * cell, (y + 1) * cell, (x + 2) * cell - 1, (y + 2) * cell - 1], fill='white')
    return img


def dashed_rect(d, x0, y0, x1, y1):
    dash = int(2 * MM)
    grey = (170, 170, 170)
    for x in range(int(x0), int(x1), 2 * dash):
        d.line([(x, y0), (min(x + dash, x1), y0)], fill=grey, width=2)
        d.line([(x, y1), (min(x + dash, x1), y1)], fill=grey, width=2)
    for y in range(int(y0), int(y1), 2 * dash):
        d.line([(x0, y), (x0, min(y + dash, y1))], fill=grey, width=2)
        d.line([(x1, y), (x1, min(y + dash, y1))], fill=grey, width=2)


cards = []
mid = 1
for el, n in CARDS:
    for _ in range(n):
        cards.append((mid, el))
        mid += 1

per_page = COLS * ROWS
n_pages = (len(cards) + per_page - 1) // per_page
pages = []
for p in range(n_pages):
    page = Image.new('RGB', (W, H), 'white')
    d = ImageDraw.Draw(page)
    head = f'Repères des atomes (vue Molécule) - page {p + 1}/{n_pages} - imprimer à 100 %, découper le long des pointillés'
    d.text((MARGIN_X, 6 * MM), head, font=head_font, fill=(90, 90, 90))
    for i, (mid, el) in enumerate(cards[p * per_page:(p + 1) * per_page]):
        cx = MARGIN_X + (i % COLS) * CELL_W
        cy = MARGIN_TOP + (i // COLS) * CELL_H
        dashed_rect(d, cx, cy, cx + CELL_W, cy + CELL_H)
        cell = int(SIDE / 8)
        m = marker(CODES[mid], cell)
        mx = int(cx + (CELL_W - m.width) / 2)
        my = int(cy + 5 * MM)
        page.paste(m, (mx, my))
        ty = my + m.height + 1.2 * MM
        w = d.textlength(el, font=sym_font)
        d.text((cx + (CELL_W - w) / 2, ty), el, font=sym_font, fill=(20, 20, 20))
        label = f'{NAMES[el]} · n° {mid}'
        w = d.textlength(label, font=name_font)
        d.text((cx + (CELL_W - w) / 2, ty + 10.2 * MM), label, font=name_font, fill=(120, 120, 120))
    pages.append(page)

out = ROOT / 'repere/reperes-atomes.pdf'
pages[0].save(out, 'PDF', resolution=DPI, save_all=True, append_images=pages[1:])
print(out, len(cards), 'repères,', n_pages, 'pages')
