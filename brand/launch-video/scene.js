// Pandock launch post (16:9, 10 s, 120 BPM): the slogan beside a sealed box, then the box grows into the middle,
// trembles, its lid pops off, eight stock logos come out and circle it, then the mark and the name. Matte, no glow.
// Same box and mark as the site (web/src/components/Box.tsx, Mark.tsx); logos as the site shows them.
import { TAU, prog, rgba, E, EASE, spring, wobble, setFont, maskedText, shake, vignette, clamp, lerp } from '../../engine/core.js';
import { LOGOS } from './logos.js';

const BG = [22, 22, 24], INK = [232, 232, 234], BLUE = [96, 150, 214], DISC = [226, 226, 229], LOGO = [44, 44, 48];
const ORDER = ['NVDA', 'TSLA', 'AAPL', 'AMZN', 'META', 'GOOGL', 'MSFT', 'AMD'];

// The site's box, viewBox 320×300.
const FACES = {
  top: [[160, 40], [290, 105], [160, 170], [30, 105], '#0f0f10'],
  left: [[30, 105], [160, 170], [160, 280], [30, 215], '#2a2a2d'],
  right: [[290, 105], [160, 170], [160, 280], [290, 215], '#38383b'],
  lidL: [[30, 90], [160, 155], [160, 170], [30, 105], '#333336'],
  lidR: [[290, 90], [160, 155], [160, 170], [290, 105], '#434346'],
  lidTop: [[160, 25], [290, 90], [160, 155], [30, 90], '#505054'],
};
const MARK_PATH = 'M636.119 648.901C507.189 725.695 356.747 774.291 206.913 740.9C55.5856 707.176 -28.4499 588.517 8.77635 434.982C42.5827 295.548 156.021 179.243 276.146 106.26L276.794 105.844C289.114 97.9869 303.292 90.1729 316.184 83.1699C436.147 18.7393 573.702 -18.7487 709.096 9.56766C858.389 40.7907 943.342 159.253 908.952 310.257C876.176 454.176 762.52 568.696 641.536 645.512C639.897 646.618 637.822 647.87 636.119 648.901ZM159.615 517.34C199.159 399.856 329.092 296.062 438.1 242.984C525.65 200.354 633.719 168.895 730.873 186.753C739.461 121.281 708.252 72.2273 645.477 51.1472C631.469 46.7513 618.497 43.2765 603.742 41.778C517.506 33.0239 415.004 69.5598 339 109.634C243.633 159.924 124.516 250.604 90.0642 356.078C79.3811 388.77 78.7091 431.699 95.3211 462.581C107.938 486.03 134.47 508.972 159.615 517.34ZM203.656 704.393C199.538 700.585 195.466 696.698 191.378 692.868C150.167 654.317 143.187 605.224 150.92 550.958C140.369 545.633 130.041 541.47 119.768 535.292C75.1794 508.482 54.1581 471.06 48.3614 420.18C46.6206 426.189 44.7469 432.377 43.1353 438.404C12.9611 566.346 70.148 669.615 200.292 703.781C201.419 704.077 202.488 704.347 203.656 704.393ZM869.187 326.694C907.608 193.242 855.147 89.1558 721.504 47.7432C715.644 46.2092 709.7 44.5954 703.831 43.1364C759.266 82.8032 772.514 130.858 763.904 196.72C816.165 216.221 857.468 251.175 866.153 308.029C866.689 311.543 868.072 324.321 869.187 326.694ZM191.629 527.78C297.433 552.893 430.556 499.612 520.339 444.248C521.893 443.293 523.421 442.294 524.921 441.255C604.551 389.394 692.559 312.627 723.232 220.38C616.115 199.074 481.946 251.649 391.399 308.172C308.033 361.575 227.616 433.402 191.629 527.78ZM564.68 645.154C578.577 638.125 607.512 622.764 620.172 613.86C703.18 560.211 809.11 478.34 832.074 377.647C847.395 310.464 820.574 255.088 755.716 230.204C721.789 341.025 600.492 440.732 501.803 495.466C408.043 543.845 290.032 586.433 183.996 561.577C179.875 597.931 181.758 626.562 205.331 656.815C229.567 687.91 270.75 706.286 309.56 710.197C394.825 718.779 489.53 683.168 564.68 645.154Z';
const MARK_W = 917, MARK_H = 752;
let mark, logos;

function face(ctx, [a, b, c, d, fill]) {
  ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...c); ctx.lineTo(...d); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = fill; ctx.lineWidth = 0.8; ctx.lineJoin = 'round'; ctx.stroke();
}

/** The box, bottom-centre at the origin, `s` px per unit; lid lifted / turned / faded by `lid`. */
function drawBox(ctx, s, { lid, squash = 0 }) {
  ctx.save();
  ctx.scale(s * (1 + squash * 0.06), s * (1 - squash * 0.1)); ctx.translate(-160, -280);
  face(ctx, FACES.top); face(ctx, FACES.left); face(ctx, FACES.right);
  if (lid.a > 0.01) {
    ctx.save(); ctx.globalAlpha = lid.a;
    ctx.translate(160 + lid.x, 90 + lid.y); ctx.rotate(lid.rot); ctx.translate(-160, -90);
    face(ctx, FACES.lidL); face(ctx, FACES.lidR); face(ctx, FACES.lidTop);
    const k = (130 / MARK_W) * 0.55, [a, b, c, d] = [k, -k / 2, k, k / 2], [mx, my] = [MARK_W / 2, MARK_H / 2];
    ctx.transform(a, b, c, d, 160 - (a * mx + c * my), 90 - (b * mx + d * my));
    ctx.fillStyle = '#6a6a6f'; ctx.fill(mark);
    ctx.restore();
  }
  ctx.restore();
}

/** A soft, flat floor shadow: an ellipse, no light. */
function floor(ctx, x, y, rx, ry, a) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill(); ctx.restore();
}

/** A matte disc with a stock's logo (24×24 Simple Icons path) at (x, y), radius r. */
function logoDisc(ctx, sym, x, y, r) {
  ctx.save(); ctx.translate(x, y);
  ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = r * 0.35; ctx.shadowOffsetY = r * 0.12;
  ctx.fillStyle = rgba(DISC); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.shadowColor = 'transparent';
  const k = (r * 1.05) / 24; ctx.scale(k, k); ctx.translate(-12, -12);
  ctx.fillStyle = rgba(LOGO); ctx.fill(logos[sym]);
  ctx.restore();
}

export default {
  setup() {
    mark = new Path2D(MARK_PATH);
    logos = Object.fromEntries(ORDER.map((s) => [s, new Path2D(LOGOS[s])]));
  },
  draw(ctx, t, api) {
    const { W, H } = api, at = api.at.bind(api);
    const MOVE = at(1), CENTRE = at(1, 6), POP = at(2), ORBIT = at(2, 8), END = at(3, 8);
    ctx.fillStyle = rgba(BG); ctx.fillRect(0, 0, W, H);

    const endP = EASE.expo(prog(t, END - 0.1, END + 0.9));
    const [sx, sy] = shake(t, [[POP, 16]]);
    ctx.save(); ctx.translate(sx, sy);

    // ── bar 0: the slogan on the left, the sealed box resting on the right
    const inP = EASE.expo(prog(t, 0.1, 0.9)), outP = E.inCubic(prog(t, MOVE, MOVE + 0.45));
    if (outP < 1) {
      ctx.save(); ctx.globalAlpha = 1 - outP; ctx.translate(-outP * 140, 0);
      setFont(ctx, 700, 132, 'Inter', -5); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = rgba(INK); maskedText(ctx, 'Open the box.', W * 0.08, H * 0.46, inP, { size: 132 });
      ctx.fillStyle = rgba(BLUE); maskedText(ctx, 'Own the market.', W * 0.08, H * 0.6, EASE.expo(prog(t, 0.25, 1.05)), { size: 132 });
      ctx.restore();
    }

    // ── the box and what comes out of it
    if (endP < 1) {
      ctx.save(); ctx.globalAlpha = 1 - endP; ctx.translate(0, -endP * 80);
      // it slides in on the right, then grows into the middle once the slogan has gone
      const mv = EASE.expo(prog(t, MOVE + 0.15, CENTRE + 0.4));
      const appear = EASE.expo(prog(t, 0.2, 1.1));
      const cx = lerp(W * 0.75, W / 2, mv) + (1 - appear) * 160, base = lerp(H * 0.78, H * 0.82, mv), s = lerp(1.6, 1.75, mv);
      const build = prog(t, CENTRE, POP), tr = t < POP ? build * build : 0;
      const jx = Math.sin(t * 90) * 7 * tr, rot = Math.sin(t * 70) * 0.035 * tr;
      const lp = prog(t, POP, POP + 0.9);
      const lid = { y: -E.outCubic(lp) * 520, x: E.outCubic(lp) * 170, rot: E.outCubic(lp) * 0.85, a: 1 - prog(t, POP + 0.3, POP + 0.8) };

      ctx.save(); ctx.globalAlpha *= appear;
      floor(ctx, cx, base + 8, 300 * s * 0.55, 60 * s * 0.55, 0.5);
      ctx.translate(cx + jx, base); ctx.rotate(rot);
      drawBox(ctx, s, { lid });
      ctx.restore();

      // logos rise out of the open top, then circle the box
      const mouth = base - 175 * s;
      ORDER.forEach((sym, i) => {
        const t0 = POP + 0.08 + i * api.step * 0.5, p = spring(t - t0, 10, 6);
        if (p <= 0) return;
        const a0 = -Math.PI / 2 + (i / ORDER.length) * TAU, spin = Math.max(0, t - ORBIT) * 0.32;
        const ang = a0 + spin, q = clamp(p);
        const ox = cx + Math.cos(ang) * 560, oy = H * 0.5 + Math.sin(ang) * 330;
        const x = lerp(cx, ox, p), yy = lerp(mouth, oy, p);
        logoDisc(ctx, sym, x, yy, 30 + 34 * q);
      });
      ctx.restore();
    }

    // ── the mark and the name, nothing else
    if (endP > 0) {
      // the site's lockup: the mark on the left, the name on the right, centred together
      setFont(ctx, 700, 132, 'Inter', -4.5);
      const tw = ctx.measureText('Pandock').width, mw = 190, mh = (mw * MARK_H) / MARK_W, gap = 36;
      const x0 = W / 2 - (mw + gap + tw) / 2, cy = H / 2;
      const k = clamp(spring(t - END - 0.05, 12, 7));
      if (k > 0.01) {
        ctx.save(); ctx.translate(x0 + mw / 2, cy); ctx.scale(k, k); ctx.translate(-mw / 2, -mh / 2);
        ctx.scale(mw / MARK_W, mw / MARK_W); ctx.fillStyle = rgba(INK); ctx.fill(mark); ctx.restore();
      }
      const p = EASE.expo(prog(t, END + 0.2, END + 0.95));
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = rgba(INK);
      maskedText(ctx, 'Pandock', x0 + mw + gap, cy + 132 * 0.36, p, { size: 132 });
    }
    ctx.restore();
  },
  post(ctx, t, { W, H }) { vignette(ctx, W, H, 0.22); },
};
