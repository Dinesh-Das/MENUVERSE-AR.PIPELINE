from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

from core.config import settings


def _safe_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    # FIX: relying on arial.ttf alone made Linux thumbnails fall back to Pillow's tiny bitmap font and ignore the requested size.
    candidates = [
        "arial.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    ]

    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue

    return ImageFont.load_default()


def generate_placeholder_thumbnail(model_id: str, dish_name: str, file_name: str) -> Path:
    settings.thumbnails_dir.mkdir(parents=True, exist_ok=True)

    # Thumbnails need to be keyed by modelId so the API and client can locate them deterministically.
    output_path = settings.thumbnails_dir / f"{model_id}.jpg"
    image = Image.new("RGB", (1200, 900), color="#f6ecd7")
    draw = ImageDraw.Draw(image)

    draw.rounded_rectangle((60, 60, 1140, 840), radius=36, fill="#101010")
    draw.rounded_rectangle((110, 120, 1090, 420), radius=28, fill="#f2d087")
    draw.text((160, 170), "MenuVerse AR", fill="#101010", font=_safe_font(34))
    draw.text((160, 240), dish_name or "Food Model", fill="#101010", font=_safe_font(54))
    draw.text((160, 330), file_name, fill="#5d4b1f", font=_safe_font(26))

    draw.rounded_rectangle((110, 470, 1090, 780), radius=28, fill="#f9f4ea")
    draw.text((160, 535), "Placeholder thumbnail", fill="#101010", font=_safe_font(32))
    # FIX: spacing is only respected by multiline_text(), so using text() with a newline produced inconsistent placeholder copy layout.
    draw.multiline_text(
        (160, 600),
        "The MVP uses Pillow for generated thumbnails.\nSwap this with Blender rendering later for photoreal previews.",
        fill="#4c4c4c",
        font=_safe_font(24),
        spacing=12,
    )

    square = ImageOps.fit(image, (512, 512), method=Image.LANCZOS)
    square.save(output_path, format="JPEG", quality=90)
    return output_path


def save_image_thumbnail(model_id: str, image: Image.Image) -> Path:
    settings.thumbnails_dir.mkdir(parents=True, exist_ok=True)
    output_path = settings.thumbnails_dir / f"{model_id}.jpg"

    preview = image.convert("RGB")
    # thumbnail() only preserves aspect ratio; fit() gives the square crop the frontend expects.
    square = ImageOps.fit(preview, (512, 512), method=Image.LANCZOS)
    square.save(output_path, format="JPEG", quality=90)
    return output_path
