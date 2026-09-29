# Pandock brand

| File | Use | Size |
|---|---|---|
| `x-profile.png` | X and Telegram (@pandockbot) avatar; circle-safe | 800×800 (upload as is, X shows 400×400) |
| `x-banner.png` | X header; copy upper left, clear of the avatar | 3000×1000 (X's 1500×500 at 2×) |
| `launch.mp4` | first X post: the box drops, pops, the tickers fly out, end card | 1080×1350, 12 s, 60 fps, with sound |

Colours and type follow `DESIGN.md`: ink `#1d1d1f`, dark canvas `#0b0b0c`, Action Blue `#2997ff` on dark, Inter (SIL OFL, `source/fonts/LICENSE-Inter.txt`) standing in for SF Pro. The box and the mark are the site's own (`web/src/components/Box.tsx`, `Mark.tsx`).

## Images

Plain HTML in `source/` (open them in a browser to edit), exported by headless Edge:

```sh
cd brand
npm install
npm run render     # → x-profile.png, x-banner.png
```

## Launch video

Made with [ft-motion](https://github.com/imserhatdemir/ft-motion). The project is in `launch-video/` (`project.json`, `scene.js`, `sound.py`); ft-motion scenes import its engine by relative path, so render it from an ft-motion checkout:

```sh
git clone https://github.com/imserhatdemir/ft-motion ../../ft-motion && cd ../../ft-motion && npm install
cp -r ../pandock/brand/launch-video examples/pandock-launch
python examples/pandock-launch/sound.py          # → out/audio.wav
node ft.mjs sheet examples/pandock-launch 16     # contact sheet to check the frames
node ft.mjs render examples/pandock-launch       # → out/pandock-launch.mp4
```

Copy is limited to what is true today: 0.10 USDC a box, eight US stocks and ETFs, tokenized (mock tokens on testnet), live on Arc Testnet.
