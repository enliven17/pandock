"""Pandock launch post: soundtrack on the scene's clock (120 BPM, bar = 2 s). Run: python examples/pandock-launch/sound.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'audio'))
from ftsynth import *  # noqa: E402,F403

m = Mix.from_project(__file__)
LAND, BUILD, POP, ORBIT, END = m.at(0, 8), m.at(1), m.at(2), m.at(2, 8), m.at(3, 8)

# the box falls and lands
m.pad(0.0, chord('Em9', 2), dur=POP, att=1.2, gain=0.18, cutoff=700)
m.whoosh(0.2, LAND - 0.2, 400, 2200, 0.12)
m.impact(LAND, gain=0.7, bright=False)
m.kick(LAND, gain=0.6)

# it trembles
m.riser(BUILD, POP, f0=300, f1=6000, gain=0.24)
m.drums(1, hats=range(8, 16, 1), hat_gain=0.06)

# the lid pops, eight logos come out
m.impact(POP, gain=0.9, bright=False)
for i in range(8):
    m.add(POP + 0.08 + i * m.step * 0.5, pop(520 + 70 * i), 0.16, (i / 7) * 1.2 - 0.6, 0.3)
m.pad(POP, chord('Cmaj9', 3), dur=END - POP, att=0.3, gain=0.2, cutoff=1500)
m.drums(2, kick=[8], snare=[12], hats=range(8, 16, 2), root=40)
m.drums(3, kick=[0], snare=[4], hats=range(0, 8, 2), root=40)

# the mark and the name
m.add(END + 0.05, bell(midi(76)), 0.22, 0, 0.5)
m.add(END + 0.3, bell(midi(83)), 0.14, 0.2, 0.5)
m.pad(END, chord('Gmaj9', 3), dur=10 - END, att=0.6, gain=0.2, cutoff=1300)

m.render(drive=1.8, peak=0.74)
