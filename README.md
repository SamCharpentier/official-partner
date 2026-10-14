# Official Partner 2026: media

Videos the site loads from jsDelivr, each URL pinned to a commit of this branch:

```
https://cdn.jsdelivr.net/gh/SamCharpentier/official-partner@<commit>/media/<file>
```

This branch holds only media files. For a commit, jsDelivr downloads the whole repository snapshot before it serves any file, and on `main` that snapshot is about 43 MB, so a commit here stays small. If jsDelivr fails, the site JS (v1.2.0 and later) loads the same file once from `rawcdn.githack.com`, same commit.

| File | Source | Size | Used on |
| --- | --- | --- | --- |
| `media/composition-3-2560.mp4` | `Composition 3.mov` on `main` (3840 x 2160, 6 fps, 13.5 s, 18.5 MB) | 2.9 MB | Home, hero showcase tile (Showcase Visual Wrap, prop Video 01) |

Encode (ffmpeg with libx264):

```
ffmpeg -i "Composition 3.mov" -map 0:v:0 -an -dn -sn -map_metadata -1 -write_tmcd 0 \
  -vf "scale=2560:-2:flags=lanczos" -c:v libx264 -preset veryslow -refs 4 \
  -profile:v high -level 5.1 -crf 24 -pix_fmt yuv420p -movflags +faststart composition-3-2560.mp4
```

Why 2560 px: the tile is about 1400 px wide on a 1440 px screen, so 2800 device pixels on a Retina screen. Measured against the original at that size (SSIM, 1 is identical): 1920 px 0.990, 2560 px 0.993, 3840 px 0.994 to 0.996 for 3.5 to 4.2 MB. No audio track: the video plays muted.

To add a video: encode it the same way, commit it here, put the commit URL in the Webflow prop, and on that visual set `Video Autoplay` to `data-autoplay` and `Video Preload` to `preload`, so it loads only once it is on screen (see `op-2026/README.md` on the `op-2026` branch).
