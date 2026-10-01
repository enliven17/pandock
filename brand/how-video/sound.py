"""Pandock how-it-works post: soundtrack on the scene's clock (120 BPM, bar = 2 s). Run: python examples/pandock-how/sound.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'audio'))
from ftsynth import *  # noqa: E402,F403

m = Mix.from_project(__file__)
B = [m.at(i) for i in range(8)]

m.pad(0.0, chord('Em9', 2), dur=B[1], att=0.8, gain=0.16, cutoff=700)
m.pad(B[1], chord('Cmaj9', 3), dur=B[3] - B[1], att=0.4, gain=0.17, cutoff=1100)
m.pad(B[3], chord('Am9', 3), dur=B[5] - B[3], att=0.4, gain=0.17, cutoff=1200)
m.pad(B[5], chord('Dmaj9', 3), dur=B[7] - B[5], att=0.4, gain=0.17, cutoff=1300)
m.pad(B[7], chord('Gmaj9', 3), dur=16 - B[7], att=0.6, gain=0.18, cutoff=1300)
for bar in range(1, 7):
    m.drums(bar, kick=[0, 8], hats=range(0, 16, 2), root=40)

# one soft note per piece that lands, one per packet that moves
for i, n in enumerate([76, 79, 81, 83, 86]):
    m.add(B[i + 1] + 0.05, bell(midi(n)), 0.16, 0, 0.5)
for t in [B[1] + 0.9, B[2] + 0.5, B[3] + 0.8, B[4] + 0.8, B[5] + 0.9, B[5] + 1.4]:
    m.add(t, blip(1320), 0.1, 0.2, 0.2)
m.add(B[6] + 0.1, bell(midi(88)), 0.16, 0, 0.5)
m.add(B[7] + 0.05, bell(midi(76)), 0.18, 0, 0.5)

m.render(drive=1.4, peak=0.55)
