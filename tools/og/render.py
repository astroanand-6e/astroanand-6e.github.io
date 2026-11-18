"""Render the link-preview cards in cards.json to assets/og/<slug>.jpg (1200x630).

Run from the repo root:  python3 tools/og/render.py   (or name slugs: python3 tools/og/render.py calm astro)
Needs Google Chrome and Pillow. The cards use the site's Google Fonts, so it needs a network connection.
"""
import json
import pathlib
import subprocess
import sys
import tempfile
import urllib.parse

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
TEMPLATE = ROOT / 'tools' / 'og' / 'card.html'
OUT = ROOT / 'assets' / 'og'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'


def render(card, tmp):
    query = urllib.parse.urlencode({k: card[k] for k in ('kicker', 'title', 'line', 'path')})
    png = pathlib.Path(tmp) / f"{card['slug']}.png"
    subprocess.run([
        CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
        '--window-size=1200,630', '--virtual-time-budget=8000', f'--screenshot={png}',
        f'{TEMPLATE.as_uri()}?{query}',
    ], check=True, capture_output=True)
    jpg = OUT / f"{card['slug']}.jpg"
    Image.open(png).convert('RGB').crop((0, 0, 1200, 630)).save(jpg, quality=86, optimize=True, progressive=True)
    return jpg


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    cards = json.loads((ROOT / 'tools' / 'og' / 'cards.json').read_text())
    only = set(sys.argv[1:])
    with tempfile.TemporaryDirectory() as tmp:
        for card in cards:
            if only and card['slug'] not in only:
                continue
            print(render(card, tmp).relative_to(ROOT))


if __name__ == '__main__':
    main()
