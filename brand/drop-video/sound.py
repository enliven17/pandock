"""Pandock drop-your-wallet post: soundtrack on the scene's clock (120 BPM, bar = 2 s). Run: python examples/pandock-drop/sound.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'audio'))
from ftsynth import *  # noqa: E402,F403

m = Mix.from_project(__file__)
REPLY, FLY, END = m.at(0, 10), m.at(1, 4), m.at(2)
SENT = FLY + 0.9

m.pad(0.0, chord('Em9', 2), dur=END, att=0.8, gain=0.16, cutoff=800)
m.whoosh(0.15, 0.7, 600, 3200, 0.1)                     # the ask
m.whoosh(REPLY, 0.5, 900, 3600, 0.07)                   # the reply slides up
for i in range(11):                                     # the wallet typed out
    m.add(REPLY + 0.35 + i * 0.9 / 11, keyclick(), 0.12, 0.1 * (i % 3 - 1))
m.whoosh(FLY, 0.9, 400, 5000, 0.14)                     # the little box flies
m.add(SENT, pop(880), 0.2, 0, 0.3)                      # it lands
m.add(SENT + 0.1, blip(1320), 0.14, 0.2, 0.3)
m.add(SENT + 0.2, blip(1760), 0.12, 0.2, 0.3)
m.drums(1, kick=[8], hats=range(8, 16, 2), root=40)
m.add(END + 0.05, bell(midi(76)), 0.18, 0, 0.5)         # the mark
m.pad(END, chord('Gmaj9', 3), dur=6 - END, att=0.5, gain=0.18, cutoff=1300)

m.render(drive=1.4, peak=0.55)
