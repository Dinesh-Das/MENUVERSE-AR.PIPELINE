from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from core.config import settings


def _safe_font(size: int) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype("arial.ttf", size)
    except OSError:
        return ImageFont.load_default()


def generate_placeholder_thumbnail(model_id: str, dish_name: str, file_name: str) -> Path:
    settings.thumbnails_dir.mkdir(parents=True, exist_ok=True)

    output_path = settings.thumbnails_dir / f"{model_id}.png"
    image = Image.new("RGB", (1200, 900), color="#f6ecd7")
    draw = ImageDraw.Draw(image)

    draw.rounded_rectangle((60, 60, 1140, 840), radius=36, fill="#101010")
    draw.rounded_rectangle((110, 120, 1090, 420), radius=28, fill="#f2d087")
    draw.text((160, 170), "MenuVerse AR", fill="#101010", font=_safe_font(34))
    draw.text((160, 240), dish_name or "Food Model", fill="#101010", font=_safe_font(54))
    draw.text((160, 330), file_name, fill="#5d4b1f", font=_safe_font(26))

    draw.rounded_rectangle((110, 470, 1090, 780), radius=28, fill="#f9f4ea")
    draw.text((160, 535), "Placeholder thumbnail", fill="#101010", font=_safe_font(32))
    draw.text(
        (160, 600),
        "The MVP uses Pillow for generated thumbnails.\nSwap this with Blender rendering later for photoreal previews.",
        fill="#4c4c4c",
        font=_safe_font(24),
        spacing=12,
    )

    image.save(output_path, format="PNG")
    return output_path


def save_image_thumbnail(model_id: str, image: Image.Image) -> Path:
    settings.thumbnails_dir.mkdir(parents=True, exist_ok=True)
    output_path = settings.thumbnails_dir / f"{model_id}.png"

    preview = image.convert("RGB")
    preview.thumbnail((1200, 1200))
    canvas = Image.new("RGB", (1200, 900), color="#0f0d0a")

    offset_x = max(0, (canvas.width - preview.width) // 2)
    offset_y = max(0, (canvas.height - preview.height) // 2)
    canvas.paste(preview, (offset_x, offset_y))
    canvas.save(output_path, format="PNG")
    return output_path
