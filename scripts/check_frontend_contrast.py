"""Check Yama's source tokens using CSS Color 4 conversion and WCAG luminance.

https://www.w3.org/TR/css-color-4/#color-conversion-code
https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
This checks opaque enabled text/control tokens, not rendered anti-aliasing.
"""
import json
import math
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
css = (root / "src/app/globals.css").read_text()
tokens = {name: list(map(float, values.split())) for name, values in re.findall(r"--([\w-]+): oklch\(([^)]+)\)", css)}


def luminance(name):
    lightness, chroma, hue = tokens[name]
    lab = [lightness, chroma * math.cos(math.radians(hue)), chroma * math.sin(math.radians(hue))]
    multiply = lambda matrix, vector: [sum(a * b for a, b in zip(row, vector)) for row in matrix]
    lms = multiply([[1, .3963377773761749, .2158037573099136], [1, -.1055613458156586, -.0638541728258133], [1, -.0894841775298119, -1.2914855480194092]], lab)
    xyz = multiply([[1.2268798758459243, -.5578149944602171, .2813910456659647], [-.0405757452148008, 1.112286803280317, -.0717110580655164], [-.0763729366746601, -.4214933324022432, 1.5869240198367816]], [value ** 3 for value in lms])
    rgb = multiply([[12831/3959, -329/214, -1974/3959], [-851781/878810, 1648619/878810, 36519/878810], [705/12673, -2585/12673, 705/667]], xyz)
    assert all(0 <= value <= 1 for value in rgb), f"{name} is outside sRGB; review gamut mapping"
    return sum(value * weight for value, weight in zip(rgb, [.2126, .7152, .0722]))


checks = []
for foreground in ["ink", "muted", "primary", "accent", "error"]:
    for background in ["bg", "surface", "raised"]:
        checks.append((foreground, background, 4.5))
checks.append(("primary-ink", "primary", 4.5))
checks += [("control", background, 3) for background in ["bg", "surface", "raised"]]
report = []
for foreground, background, minimum in checks:
    values = sorted([luminance(foreground), luminance(background)])
    ratio = (values[1] + .05) / (values[0] + .05)
    report.append(dict(foreground=foreground, background=background, ratio=round(ratio, 3), minimum=minimum, passed=ratio >= minimum))
destination = root / "docs/design/frontend/contrast.json"
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(report, indent=2) + "\n")
print(f"{sum(item['passed'] for item in report)}/{len(report)} token pairs meet their contrast target")
raise SystemExit(0 if all(item["passed"] for item in report) else 1)
