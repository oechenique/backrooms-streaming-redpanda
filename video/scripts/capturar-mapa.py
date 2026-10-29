"""Captura del dashboard real del mapa de los perdidos para el Reel Senpai: solo el mapa (laberinto y rastros), sin el
panel ni los controles, en alta resolución, en video/clips/mapa-dashboard.png (no va a git, como los clips).

Hace falta el dashboard corriendo (por defecto en http://localhost:5174) y Playwright para Python con Chromium:

    python scripts/capturar-mapa.py [url]

La seed es la del día de las grabaciones (visuales.seed en src/escenas.json) y la capa, la del Nivel 0 con más
rastros en el Gold de esa seed.
"""

import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
escenas = json.loads((ROOT / "src/escenas.json").read_text(encoding="utf8"))
seed, world_v = escenas["visuales"]["seed"], escenas["visuales"]["world_v"]
gold = json.loads((ROOT.parent / f"data/gold/mapa/{seed}-v{world_v}.json").read_text(encoding="utf8"))
capa = max((c for c in gold["capas"] if c["level"] == 0), key=lambda c: len(c["rastros"]))
base = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5174/"
url = f"{base}?seed={seed}&capa={capa['z']}"
out = ROOT / "clips/mapa-dashboard.png"

with sync_playwright() as p:
    browser = p.chromium.launch()
    # Cuadrada y a 2x (el dashboard dibuja a lo sumo a 2x): 3840 × 3840, para recortarla en vertical con zoom.
    page = browser.new_page(viewport={"width": 1920, "height": 1920}, device_scale_factor=2)
    # El panel y los controles se ocultan antes de que cargue el mapa: así se encuadra sobre la pantalla entera.
    page.add_init_script(
        "addEventListener('DOMContentLoaded', () => document.head.insertAdjacentHTML('beforeend',"
        " '<style>#panel, #zoom, #tooltip, #status { display: none !important; }</style>'))"
    )
    page.goto(url, wait_until="networkidle")
    page.wait_for_timeout(1500)
    # El encuadre automático llega a 24 px por celda; con el + (×1,5, hasta 40) los rastros quedan más grandes.
    page.evaluate("for (let i = 0; i < 2; i++) document.getElementById('zoom-in').click()")
    page.wait_for_timeout(800)
    page.screenshot(path=str(out))
    browser.close()

print(f"{url} (capa {capa['z']}, {len(capa['rastros'])} rastros) -> {out.relative_to(ROOT)}")
