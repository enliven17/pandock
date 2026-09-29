# Pandock brand

| File | Use | Size |
|---|---|---|
| `x-profile.png` | X and Telegram (@pandockbot) avatar; circle-safe | 800×800 (upload as is, X shows 400×400) |
| `x-banner.png` | X header; copy upper left, clear of the avatar | 3000×1000 (X's 1500×500 at 2×) |
| `launch.mp4` | first X post: the slogan beside a sealed box, the box grows into the middle, trembles, opens, eight stock logos come out and circle it, then the mark; matte palette | 1920×1080, 10 s, 60 fps, with sound |
| `web/public/tg/*.png` | the Telegram bot's cards: linked, gift, bought (the personal part goes in the caption) | 1280×720 |

Colours and type follow `DESIGN.md`: ink `#1d1d1f`, dark canvas `#0b0b0c`, Action Blue `#2997ff` on dark, Inter (SIL OFL, `source/fonts/LICENSE-Inter.txt`) standing in for SF Pro. The box and the mark are the site's own (`web/src/components/Box.tsx`, `Mark.tsx`).

## Images

Plain HTML in `source/` (open them in a browser to edit), exported by headless Edge:

```sh
cd brand
npm install
npm run render     # → x-profile.png, x-banner.png
```

## Launch video

Made with [ft-motion](https://github.com/imserhatdemir/ft-motion). The project is in `launch-video/` (`project.json`, `scene.js`, `sound.py`, `logos.js`: Simple Icons paths, as on the site); ft-motion scenes import its engine by relative path, so render it from an ft-motion checkout:

```sh
git clone https://github.com/imserhatdemir/ft-motion ../../ft-motion && cd ../../ft-motion && npm install
cp -r ../pandock/brand/launch-video examples/pandock-launch
python examples/pandock-launch/sound.py          # → out/audio.wav
node ft.mjs sheet examples/pandock-launch 16     # contact sheet to check the frames
node ft.mjs render examples/pandock-launch       # → out/pandock-launch.mp4
```

The video's only copy is the slogan and the name. The logos are stocks listed on ArcStocks; six of them (not MSFT and AMD) are among the eight the testnet box pays in, as mock tokens.
