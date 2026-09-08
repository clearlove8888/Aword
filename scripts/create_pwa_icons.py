"""Generate the PNG icons referenced by the web app manifest."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "icons"
OUTPUT.mkdir(parents=True, exist_ok=True)


def font(size):
    candidates = [
        Path("C:/Windows/Fonts/segoeuib.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def create_icon(size, path, maskable=False):
    image = Image.new("RGB", (size, size), "#eaf7ff")
    draw = ImageDraw.Draw(image)
    margin = int(size * (0.15 if maskable else 0.08))
    radius = int(size * 0.22)
    draw.rounded_rectangle(
        (margin, margin, size - margin, size - margin),
        radius=radius,
        fill="#ffffff",
    )
    label_font = font(int(size * 0.52))
    box = draw.textbbox((0, 0), "A", font=label_font)
    width, height = box[2] - box[0], box[3] - box[1]
    draw.text(
        ((size - width) / 2, (size - height) / 2 - box[1]),
        "A",
        font=label_font,
        fill="#249cde",
    )
    image.save(path, optimize=True)


create_icon(192, OUTPUT / "icon-192.png")
create_icon(512, OUTPUT / "icon-512.png")
create_icon(512, OUTPUT / "icon-maskable-512.png", maskable=True)
