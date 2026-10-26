#!/usr/bin/env python3
"""Build the iOS asset catalog images from the website's icons.

  public/icon-512.png -> ios/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png
                         (1024x1024, upscaled on white, no alpha: App Store rule)
  public/mg-logo.jpg  -> ios/Resources/Assets.xcassets/MGLogo.imageset/mg-logo.png

Run from the repo root:  python ios/scripts/make_icons.py
Needs Pillow:            pip install pillow
"""

import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "..", ".."))
ASSETS = os.path.join(REPO, "ios", "Resources", "Assets.xcassets")


def on_white(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
    bg.alpha_composite(img)
    return bg.convert("RGB")


def main() -> None:
    icon = on_white(Image.open(os.path.join(REPO, "public", "icon-512.png")))
    icon = icon.resize((1024, 1024), Image.LANCZOS)
    icon_dir = os.path.join(ASSETS, "AppIcon.appiconset")
    os.makedirs(icon_dir, exist_ok=True)
    icon.save(os.path.join(icon_dir, "AppIcon-1024.png"), "PNG")

    logo = on_white(Image.open(os.path.join(REPO, "public", "mg-logo.jpg")))
    logo_dir = os.path.join(ASSETS, "MGLogo.imageset")
    os.makedirs(logo_dir, exist_ok=True)
    logo.save(os.path.join(logo_dir, "mg-logo.png"), "PNG")

    print("Icons written to", ASSETS)


if __name__ == "__main__":
    main()
