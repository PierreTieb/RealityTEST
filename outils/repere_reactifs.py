# Génère repere/reperes-reactifs.pdf : les repères du module « Transformation chimique », 20 par page A4.
# Les réactifs, leur nombre d'exemplaires et les ids viennent de js/chemistry.js (même calcul que CARDS) :
# un repère par réactif, autant d'exemplaires que son plus grand coefficient, ids à partir de 1
# (dictionnaire ARUCO_MIP_36h12 ; l'id 0 est le repère universel du module Atome).
# Lancer depuis le dossier de l'appli : python outils/repere_reactifs.py
import re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
chem = (ROOT / 'js/chemistry.js').read_text(encoding='utf-8')

# Noms des espèces : lignes  'H2': ["Dihydrogène", "H₂", ...
NAMES = dict(re.findall(r"^\s*'([^']+)':\s*\[\"([^\"]+)\"", chem, re.M))
# Réactions : lignes  '2 H2 + O2 -> 2 H2O',
block = re.search(r'const RAW_REACTIONS = \[(.*?)\];', chem, re.S).group(1)
reactions = re.findall(r"'([^']+->[^']+)'", block)

cards = []                        # [(clé, nombre)] dans l'ordre d'apparition
for text in reactions:
    for term in text.split(' -> ')[0].split(' + '):
        m = re.match(r'^(\d+)?\s*(\S+)$', term.strip())
        n, key = int(m.group(1) or 1), m.group(2)
        for c in cards:
            if c[0] == key:
                c[1] = max(c[1], n)
                break
        else:
            cards.append([key, n])

src = (ROOT / 'lib/aruco/aruco.js').read_text(encoding='utf-8')
codes_block = re.search(r'ARUCO_MIP_36h12:\s*{.*?codeList:\s*\[(.*?)\]', src, re.S).group(1)
CODES = [int(x, 16) for x in re.findall(r'0x[0-9a-fA-F]+', codes_block)]

DPI = 300
MM = DPI / 25.4
W, H = int(210 * MM), int(297 * MM)
COLS, ROWS = 4, 5
MARGIN_X, MARGIN_TOP, MARGIN_BOTTOM = 10 * MM, 14 * MM, 6 * MM
CELL_W = (W - 2 * MARGIN_X) / COLS
CELL_H = (H - MARGIN_TOP - MARGIN_BOTTOM) / ROWS
SIDE = 34 * MM                      # carré noir du repère : 3,4 cm
F = 'C:/Windows/Fonts/'
big = ImageFont.truetype(F + 'segoeuib.ttf', int(7.5 * MM))
sub = ImageFont.truetype(F + 'segoeuib.ttf', int(5 * MM))
name_font = ImageFont.truetype(F + 'segoeui.ttf', int(3.1 * MM))
head_font = ImageFont.truetype(F + 'segoeui.ttf', int(3.2 * MM))


def marker(code, cell):
    bits = format(code, '036b')
    img = Image.new('RGB', (8 * cell, 8 * cell), 'black')
    d = ImageDraw.Draw(img)
    for y in range(6):
        for x in range(6):
            if bits[y * 6 + x] == '1':
                d.rectangle([(x + 1) * cell, (y + 1) * cell, (x + 2) * cell - 1, (y + 2) * cell - 1], fill='white')
    return img


def formula_parts(key):
    """'Ca(OH)2' -> [('Ca(OH)', False), ('2', True)] : chiffres en indice."""
    return [(p, p.isdigit()) for p in re.findall(r'\d+|[^\d]+', key)]


def draw_formula(d, key, cx, y):
    parts = formula_parts(key)
    widths = [d.textlength(t, font=sub if s else big) for t, s in parts]
    x = cx - sum(widths) / 2
    for (t, s), w in zip(parts, widths):
        d.text((x, y + (3.4 * MM if s else 0)), t, font=sub if s else big, fill=(20, 20, 20))
        x += w


def dashed_rect(d, x0, y0, x1, y1):
    dash = int(2 * MM)
    grey = (170, 170, 170)
    for x in range(int(x0), int(x1), 2 * dash):
        d.line([(x, y0), (min(x + dash, x1), y0)], fill=grey, width=2)
        d.line([(x, y1), (min(x + dash, x1), y1)], fill=grey, width=2)
    for y in range(int(y0), int(y1), 2 * dash):
        d.line([(x0, y), (x0, min(y + dash, y1))], fill=grey, width=2)
        d.line([(x1, y), (x1, min(y + dash, y1))], fill=grey, width=2)


items = []
mid = 1
for key, n in cards:
    for _ in range(n):
        items.append((mid, key))
        mid += 1

per_page = COLS * ROWS
n_pages = (len(items) + per_page - 1) // per_page
pages = []
for p in range(n_pages):
    page = Image.new('RGB', (W, H), 'white')
    d = ImageDraw.Draw(page)
    head = f'Repères des réactifs (Transformation chimique) - page {p + 1}/{n_pages} - imprimer à 100 %, découper le long des pointillés'
    d.text((MARGIN_X, 6 * MM), head, font=head_font, fill=(90, 90, 90))
    for i, (mid, key) in enumerate(items[p * per_page:(p + 1) * per_page]):
        cx = MARGIN_X + (i % COLS) * CELL_W
        cy = MARGIN_TOP + (i // COLS) * CELL_H
        dashed_rect(d, cx, cy, cx + CELL_W, cy + CELL_H)
        m = marker(CODES[mid], int(SIDE / 8))
        mx = int(cx + (CELL_W - m.width) / 2)
        my = int(cy + 4 * MM)
        page.paste(m, (mx, my))
        ty = my + m.height + 0.6 * MM
        draw_formula(d, key, cx + CELL_W / 2, ty)
        name = NAMES[key]
        w = d.textlength(name, font=name_font)
        d.text((cx + (CELL_W - w) / 2, ty + 10.2 * MM), name, font=name_font, fill=(90, 90, 90))
    pages.append(page)

out = ROOT / 'repere/reperes-reactifs.pdf'
pages[0].save(out, 'PDF', resolution=DPI, save_all=True, append_images=pages[1:])
print(len(items), 'repères,', n_pages, 'pages :', ', '.join(f'{k}×{n}' for k, n in cards))
