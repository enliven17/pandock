"""Pandock launch post: soundtrack on the scene's clock (120 BPM, bar = 2 s). Run: python examples/pandock-launch/sound.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'audio'))
from ftsynth import *  # noqa: E402,F403

m = Mix.from_project(__file__)
LAND, POP, ORBIT, END = m.at(0, 8), m.at(2), m.at(3), m.at(4)

# bar 0: a low pad, the box falling and landing
m.pad(0.0, chord('Em9', 2), dur=m.at(2), att=1.2, gain=0.18, cutoff=700)
m.whoosh(0.25, LAND - 0.25, 400, 2200, 0.12)
m.impact(LAND, gain=0.7, bright=False)
m.kick(LAND, gain=0.6)

# bar 1: tension builds while it trembles
m.riser(m.at(1), POP, f0=300, f1=7000, gain=0.26)
m.drums(1, hats=range(8, 16, 1), hat_gain=0.06)

# bar 2: the lid blows off, eight tickers pop out
m.impact(POP, gain=1.0, bright=True)
for i in range(8):
    m.add(POP + 0.06 + i * m.step * 0.5, pop(520 + 70 * i), 0.16, (i / 7) * 1.2 - 0.6, 0.3)
m.pad(POP, chord('Cmaj9', 3), dur=m.at(2), att=0.3, gain=0.2, cutoff=1800)

# bar 3: the orbit, a light groove
m.drums(3, kick=[0, 8], snare=[4, 12], hats=range(0, 16, 2), root=40)

# bar 4+: the end card
m.add(END + 0.05, bell(midi(76)), 0.22, 0, 0.5)
m.add(END + 0.25, bell(midi(83)), 0.14, 0.2, 0.5)
m.pad(END, chord('Gmaj9', 3), dur=m.at(2), att=0.6, gain=0.2, cutoff=1400)

m.render(drive=1.8, peak=0.74)
