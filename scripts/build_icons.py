"""Build deterministic PWA icons for the personal study app."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FONTS = [
    "/usr/share/fonts/truetype/liberation2/LiberationSerif-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
]

for size in (192, 512):
    n = size * 3
    canvas = Image.new("RGB", (n, n), "#f6f6ef")
    draw = ImageDraw.Draw(canvas)
    margin = int(n * 0.012)
    draw.rounded_rectangle(
        (margin, margin, n - margin, n - margin), radius=int(n * 0.22),
        fill="#2d4c38",
    )
    font_path = next((f for f in FONTS if Path(f).exists()), None)
    font = ImageFont.truetype(font_path, int(n * 0.68)) if font_path else ImageFont.load_default()
    box = draw.textbbox((0, 0), "a", font=font)
    width, height = box[2] - box[0], box[3] - box[1]
    draw.text(((n-width)/2-box[0], (n-height)/2-box[1]-int(n*0.023)),
              "a", font=font, fill="#f8f8f2")
    draw.ellipse(
        (int(n*.73), int(n*.235), int(n*.775), int(n*.28)),
        fill="#c4a56f",
    )
    canvas = canvas.resize((size, size), Image.Resampling.LANCZOS)
    output = ROOT / "public" / ("icon-" + str(size) + ".png")
    canvas.quantize(colors=40, method=Image.Quantize.MEDIANCUT,
                    dither=Image.Dither.NONE).save(output, optimize=True)
    print(output.name, output.stat().st_size, "bytes")
