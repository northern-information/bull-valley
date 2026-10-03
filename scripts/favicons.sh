#!/usr/bin/env bash
# Regenerate the raster favicons from public/favicon.svg with ImageMagick 7.
#
#   public/favicon.ico        16, 32 and 48 px frames, transparent, for
#                             browsers without SVG favicon support (Safari)
#   public/apple-touch-icon.png  180 px on the game's black, since iOS fills
#                             transparency with black and rounds the corners
#
# Each frame is rendered from the vector at its own size (-density), never
# scaled from another raster. Run after editing favicon.svg.
set -euo pipefail

cd "$(dirname "$0")/.." > /dev/null

svg=public/favicon.svg
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# The SVG is a 32 px viewBox, so 96 dpi renders it at 32 px.
for size in 16 32 48; do
  magick -background none -density $((size * 3)) "$svg" \
    -resize "${size}x${size}" -strip "$tmp/$size.png"
done
magick "$tmp/48.png" "$tmp/32.png" "$tmp/16.png" public/favicon.ico

# Same triangle, side 120 in a 180 box, on black.
cat > "$tmp/touch.svg" <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">
  <rect width="180" height="180" fill="#000000" />
  <polygon points="90,38.04 150,141.96 30,141.96" fill="#dc2626" />
</svg>
SVG
magick -density 96 "$tmp/touch.svg" -resize 180x180 -depth 8 -strip \
  public/apple-touch-icon.png

magick identify public/favicon.ico public/apple-touch-icon.png
