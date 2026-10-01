// Pandock "how it works" post (16:9, 16 s, 120 BPM, a bar is 2 s): the architecture builds one piece per bar,
// with one plain line on top: buy, open, the AI Treasurer, the decision log, the share desk; then the mark.
import { TAU, prog, rgba, E, EASE, spring, setFont, maskedText, vignette, clamp, lerp, rrect, pill } from '../../engine/core.js';
import { LOGOS } from './logos.js';

const BG = [22, 22, 24], INK = [232, 232, 234], MUTED = [140, 140, 146], NODE = [32, 32, 35], EDGE = [62, 62, 68];
const DISC = [226, 226, 229], LOGO = [44, 44, 48], CHIP = [48, 48, 52];
const MARK_PATH = 'M636.119 648.901C507.189 725.695 356.747 774.291 206.913 740.9C55.5856 707.176 -28.4499 588.517 8.77635 434.982C42.5827 295.548 156.021 179.243 276.146 106.26L276.794 105.844C289.114 97.9869 303.292 90.1729 316.184 83.1699C436.147 18.7393 573.702 -18.7487 709.096 9.56766C858.389 40.7907 943.342 159.253 908.952 310.257C876.176 454.176 762.52 568.696 641.536 645.512C639.897 646.618 637.822 647.87 636.119 648.901ZM159.615 517.34C199.159 399.856 329.092 296.062 438.1 242.984C525.65 200.354 633.719 168.895 730.873 186.753C739.461 121.281 708.252 72.2273 645.477 51.1472C631.469 46.7513 618.497 43.2765 603.742 41.778C517.506 33.0239 415.004 69.5598 339 109.634C243.633 159.924 124.516 250.604 90.0642 356.078C79.3811 388.77 78.7091 431.699 95.3211 462.581C107.938 486.03 134.47 508.972 159.615 517.34ZM203.656 704.393C199.538 700.585 195.466 696.698 191.378 692.868C150.167 654.317 143.187 605.224 150.92 550.958C140.369 545.633 130.041 541.47 119.768 535.292C75.1794 508.482 54.1581 471.06 48.3614 420.18C46.6206 426.189 44.7469 432.377 43.1353 438.404C12.9611 566.346 70.148 669.615 200.292 703.781C201.419 704.077 202.488 704.347 203.656 704.393ZM869.187 326.694C907.608 193.242 855.147 89.1558 721.504 47.7432C715.644 46.2092 709.7 44.5954 703.831 43.1364C759.266 82.8032 772.514 130.858 763.904 196.72C816.165 216.221 857.468 251.175 866.153 308.029C866.689 311.543 868.072 324.321 869.187 326.694ZM191.629 527.78C297.433 552.893 430.556 499.612 520.339 444.248C521.893 443.293 523.421 442.294 524.921 441.255C604.551 389.394 692.559 312.627 723.232 220.38C616.115 199.074 481.946 251.649 391.399 308.172C308.033 361.575 227.616 433.402 191.629 527.78ZM564.68 645.154C578.577 638.125 607.512 622.764 620.172 613.86C703.18 560.211 809.11 478.34 832.074 377.647C847.395 310.464 820.574 255.088 755.716 230.204C721.789 341.025 600.492 440.732 501.803 495.466C408.043 543.845 290.032 586.433 183.996 561.577C179.875 597.931 181.758 626.562 205.331 656.815C229.567 687.91 270.75 706.286 309.56 710.197C394.825 718.779 489.53 683.168 564.68 645.154Z';
const MARK_W = 917, MARK_H = 752;
const NW = 340, NH = 130;
let mark, logos;

// Where things sit, and the edges as u→[x, y] curves.
const N = {
  you: [360, 690, 'You', 'Any wallet'],
  box: [960, 690, 'Pandock', 'Box contract'],
  desk: [1560, 690, 'Share desk', 'Sell or trade'],
  ai: [960, 380, 'AI Treasurer', 'Gemini · Circle wallet'],
  log: [1560, 380, 'Decision log', 'Hash-chained'],
};
const line = (a, b) => (u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];
const EDGES = {
  buy: line([360 + NW / 2, 665], [960 - NW / 2, 665]),
  win: line([960 - NW / 2, 715], [360 + NW / 2, 715]),
  set: line([960, 380 + NH / 2], [960, 690 - NH / 2]),
  anchor: line([960 + NW / 2, 380], [1560 - NW / 2, 380]),
  // under the box, from you to the desk and back
  sell: (u) => { const x = lerp(360, 1560, u); return [x, 690 + NH / 2 + 30 + Math.sin(u * Math.PI) * 130]; },
  back: (u) => { const x = lerp(1560, 360, u); return [x, 690 + NH / 2 + 30 + Math.sin(u * Math.PI) * 130]; },
};

function node(ctx, [x, y, title, sub], k) {
  if (k <= 0.01) return;
  ctx.save(); ctx.globalAlpha *= clamp(k); ctx.translate(x, y); const s = 0.9 + 0.1 * k; ctx.scale(s, s);
  ctx.fillStyle = rgba(NODE); rrect(ctx, -NW / 2, -NH / 2, NW, NH, 24); ctx.fill();
  ctx.strokeStyle = rgba(EDGE, 0.7); ctx.lineWidth = 2; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  setFont(ctx, 600, 38, 'Inter', -0.8); ctx.fillStyle = rgba(INK); ctx.fillText(title, 0, -2);
  setFont(ctx, 400, 25, 'Inter', -0.2); ctx.fillStyle = rgba(MUTED); ctx.fillText(sub, 0, 36);
  ctx.restore();
}

/** The edge drawn from its start up to `p`. */
function edge(ctx, f, p) {
  if (p <= 0) return;
  ctx.save(); ctx.strokeStyle = rgba([92, 92, 100]); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.setLineDash([2, 12]);
  ctx.beginPath();
  for (let i = 0; i <= 48; i++) { const [x, y] = f((i / 48) * p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke(); ctx.restore();
}

/** Something travelling along an edge between t0 and t1: a label chip, or a stock logo. */
function packet(ctx, f, t, t0, t1, what) {
  const a = prog(t, t0 - 0.15, t0) * (1 - prog(t, t1, t1 + 0.2));
  if (a <= 0.01) return;
  const [x, y] = f(E.inOutCubic(prog(t, t0, t1)));
  ctx.save(); ctx.globalAlpha *= a;
  if (LOGOS[what]) {
    ctx.translate(x, y); ctx.fillStyle = rgba(DISC); ctx.beginPath(); ctx.arc(0, 0, 34, 0, TAU); ctx.fill();
    const k = 36 / 24; ctx.scale(k, k); ctx.translate(-12, -12); ctx.fillStyle = rgba(LOGO); ctx.fill(logos[what]);
  } else {
    setFont(ctx, 600, 26, 'Inter', -0.3);
    const w = ctx.measureText(what).width + 44;
    ctx.fillStyle = rgba(CHIP); pill(ctx, x, y, w, 50); ctx.fill();
    ctx.fillStyle = rgba(INK); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(what, x, y + 1);
  }
  ctx.restore();
}

/** The line on top for a bar: rises in, fades before the next one. */
function caption(ctx, text, t, t0, t1, W) {
  const a = 1 - prog(t, t1 - 0.25, t1);
  if (t < t0 || a <= 0.01) return;
  ctx.save(); ctx.globalAlpha *= a;
  setFont(ctx, 600, 52, 'Inter', -1.4); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = rgba(INK);
  maskedText(ctx, text, W / 2, 170, EASE.expo(prog(t, t0, t0 + 0.7)), { size: 52 });
  ctx.restore();
}

export default {
  setup() {
    mark = new Path2D(MARK_PATH);
    logos = Object.fromEntries(Object.keys(LOGOS).map((s) => [s, new Path2D(LOGOS[s])]));
  },
  draw(ctx, t, api) {
    const { W, H } = api, at = api.at.bind(api);
    const B = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => at(i)), END = B[7];
    ctx.fillStyle = rgba(BG); ctx.fillRect(0, 0, W, H);

    // bar 0: the title
    if (t < B[1]) {
      ctx.save(); ctx.globalAlpha = 1 - prog(t, B[1] - 0.35, B[1] - 0.05);
      setFont(ctx, 700, 120, 'Inter', -4); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = rgba(INK);
      maskedText(ctx, 'How Pandock works', W / 2, H / 2 + 40, EASE.expo(prog(t, 0.1, 0.9)), { size: 120 });
      ctx.restore();
    }

    // bars 1–6: the diagram, one piece a bar; it steps back for the last line
    const dim = 1 - 0.75 * EASE.expo(prog(t, B[6] - 0.1, B[6] + 0.6)), out = 1 - prog(t, END - 0.4, END - 0.05);
    ctx.save(); ctx.globalAlpha = dim * out;
    const pop = (t0) => spring(t - t0, 12, 8);
    const draw = (t0, dur = 0.6) => E.outCubic(prog(t, t0, t0 + dur));

    edge(ctx, EDGES.buy, draw(B[1] + 0.4)); edge(ctx, EDGES.win, draw(B[2]));
    edge(ctx, EDGES.set, draw(B[3] + 0.3)); edge(ctx, EDGES.anchor, draw(B[4] + 0.3));
    edge(ctx, EDGES.sell, draw(B[5] + 0.3, 0.8));
    node(ctx, N.you, pop(B[1])); node(ctx, N.box, pop(B[1] + 0.2));
    node(ctx, N.ai, pop(B[3])); node(ctx, N.log, pop(B[4])); node(ctx, N.desk, pop(B[5]));

    packet(ctx, EDGES.buy, t, B[1] + 0.9, B[1] + 1.6, '0.10 USDC');
    packet(ctx, EDGES.win, t, B[2] + 0.5, B[2] + 1.4, 'NVDA');
    packet(ctx, EDGES.set, t, B[3] + 0.8, B[3] + 1.6, 'Prizes, capped');
    packet(ctx, EDGES.anchor, t, B[4] + 0.8, B[4] + 1.6, '#42 · 0x9c…e1');
    packet(ctx, EDGES.sell, t, B[5] + 0.6, B[5] + 1.2, 'NVDA');
    packet(ctx, EDGES.back, t, B[5] + 1.3, B[5] + 1.95, 'USDC or boxes');
    ctx.restore();

    caption(ctx, 'Buy a sealed box for 0.10 USDC.', t, B[1] + 0.1, B[2], W);
    caption(ctx, 'Open it, and a slice of a real stock comes out.', t, B[2], B[3], W);
    caption(ctx, 'An AI Treasurer sets the prizes. The contract caps them.', t, B[3], B[4], W);
    caption(ctx, 'Each decision is hash-chained and anchored on Arc.', t, B[4], B[5], W);
    caption(ctx, 'Keep the shares, sell them, or trade them for boxes.', t, B[5], B[6], W);

    // bar 6: where it runs
    if (t >= B[6] && t < END) {
      ctx.save(); ctx.globalAlpha = 1 - prog(t, END - 0.4, END - 0.05);
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = rgba(INK);
      setFont(ctx, 700, 104, 'Inter', -3.5);
      maskedText(ctx, 'Live on Arc Testnet.', W / 2, H / 2 + 10, EASE.expo(prog(t, B[6] + 0.1, B[6] + 0.8)), { size: 104 });
      setFont(ctx, 400, 44, 'Inter', -0.5); ctx.fillStyle = rgba(MUTED);
      maskedText(ctx, 'pandock.xyz', W / 2, H / 2 + 100, EASE.expo(prog(t, B[6] + 0.4, B[6] + 1.1)), { size: 44 });
      ctx.restore();
    }

    // bar 7: the site's lockup, mark left, name right
    if (t >= END) {
      setFont(ctx, 700, 132, 'Inter', -4.5);
      const tw = ctx.measureText('Pandock').width, mw = 190, mh = (mw * MARK_H) / MARK_W, gap = 36;
      const x0 = W / 2 - (mw + gap + tw) / 2, cy = H / 2;
      const k = clamp(spring(t - END - 0.05, 12, 7));
      if (k > 0.01) {
        ctx.save(); ctx.translate(x0 + mw / 2, cy); ctx.scale(k, k); ctx.translate(-mw / 2, -mh / 2);
        ctx.scale(mw / MARK_W, mw / MARK_W); ctx.fillStyle = rgba(INK); ctx.fill(mark); ctx.restore();
      }
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = rgba(INK);
      maskedText(ctx, 'Pandock', x0 + mw + gap, cy + 132 * 0.36, EASE.expo(prog(t, END + 0.2, END + 0.95)), { size: 132 });
    }
  },
  post(ctx, t, { W, H }) { vignette(ctx, W, H, 0.22); },
};
