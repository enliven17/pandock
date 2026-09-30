"""Pandock buy post: soundtrack on the scene's clock (120 BPM, bar = 2 s). Run: python examples/pandock-buy/sound.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'audio'))
from ftsynth import *  # noqa: E402,F403

m = Mix.from_project(__file__)
CLICK, TAP, POP, END = m.at(0, 12), m.at(1, 8), m.at(2), m.at(3)

m.pad(0.0, chord('Em9', 2), dur=POP, att=0.8, gain=0.16, cutoff=700)

# buy: the click, then the payment going through
m.add(CLICK, mouseclick(), 0.22, 0.2)
m.add(CLICK + 0.14, blip(1320), 0.16, 0.2, 0.2)
m.add(CLICK + 0.24, blip(1760), 0.14, 0.2, 0.3)

# open: a tap on the box, then it trembles
m.add(TAP, mouseclick(), 0.22, 0.0)
m.riser(TAP, POP, f0=300, f1=6000, gain=0.22)

# the lid pops, the prize rises
m.impact(POP, gain=0.9, bright=False)
m.add(POP + 0.12, bell(midi(79)), 0.2, 0, 0.5)
m.add(POP + 0.45, bell(midi(86)), 0.14, 0.15, 0.5)
m.pad(POP, chord('Cmaj9', 3), dur=END - POP, att=0.3, gain=0.2, cutoff=1500)
m.drums(2, kick=[8], snare=[12], hats=range(8, 16, 2), root=40)

# the mark
m.add(END + 0.05, bell(midi(76)), 0.18, 0, 0.5)
m.pad(END, chord('Gmaj9', 3), dur=8 - END, att=0.6, gain=0.18, cutoff=1300)

m.render(drive=1.4, peak=0.55)
