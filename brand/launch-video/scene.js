// Pandock launch post (4:5, 12 s, 120 BPM): a sealed box drops in, trembles, blows its lid,
// eight stock tickers fly out and orbit it, then the end card. Same box and mark as the site.
import { TAU, prog, rgba, E, EASE, spring, wobble, setFont, maskedText, pill, shake, vignette, clamp, lerp } from '../../engine/core.js';
import { flash, shockRing, bloom } from '../../engine/fx.js';

const COPY = {
  en: {
    sealed: 'Sealed.',
    nobody: 'Nobody knows what’s inside.',
    slice: 'A slice of a tokenized stock.',
    open: 'Open the box.',
    own: 'Own the market.',
    price: '0.10 USDC a box · 8 US stocks & ETFs',
    live: 'Live on Arc Testnet',
    url: 'pandock.vercel.app',
    bot: 'Gift one in Telegram: @pandockbot',
  },
};

const BG = [11, 11, 12], INK = [245, 245, 247], MUTED = [150, 150, 156], BLUE = [41, 151, 255], DARK = [29, 29, 31];
const TICKERS = ['NVDA', 'TSLA', 'AAPL', 'AMZN', 'META', 'GOOGL', 'SPY', 'QQQ'];

// The site's box (web/src/components/Box.tsx), viewBox 320×300.
const FACES = {
  top: [[160, 40], [290, 105], [160, 170], [30, 105], '#0b0b0c'],
  left: [[30, 105], [160, 170], [160, 280], [30, 215], '#1d1d1f'],
  right: [[290, 105], [160, 170], [160, 280], [290, 215], '#2c2c2e'],
  lidL: [[30, 90], [160, 155], [160, 170], [30, 105], '#27272a'],
  lidR: [[290, 90], [160, 155], [160, 170], [290, 105], '#38383b'],
  lidTop: [[160, 25], [290, 90], [160, 155], [30, 90], '#48484b'],
};
const MARK_PATH = 'M636.119 648.901C507.189 725.695 356.747 774.291 206.913 740.9C55.5856 707.176 -28.4499 588.517 8.77635 434.982C42.5827 295.548 156.021 179.243 276.146 106.26L276.794 105.844C289.114 97.9869 303.292 90.1729 316.184 83.1699C436.147 18.7393 573.702 -18.7487 709.096 9.56766C858.389 40.7907 943.342 159.253 908.952 310.257C876.176 454.176 762.52 568.696 641.536 645.512C639.897 646.618 637.822 647.87 636.119 648.901ZM159.615 517.34C199.159 399.856 329.092 296.062 438.1 242.984C525.65 200.354 633.719 168.895 730.873 186.753C739.461 121.281 708.252 72.2273 645.477 51.1472C631.469 46.7513 618.497 43.2765 603.742 41.778C517.506 33.0239 415.004 69.5598 339 109.634C243.633 159.924 124.516 250.604 90.0642 356.078C79.3811 388.77 78.7091 431.699 95.3211 462.581C107.938 486.03 134.47 508.972 159.615 517.34ZM203.656 704.393C199.538 700.585 195.466 696.698 191.378 692.868C150.167 654.317 143.187 605.224 150.92 550.958C140.369 545.633 130.041 541.47 119.768 535.292C75.1794 508.482 54.1581 471.06 48.3614 420.18C46.6206 426.189 44.7469 432.377 43.1353 438.404C12.9611 566.346 70.148 669.615 200.292 703.781C201.419 704.077 202.488 704.347 203.656 704.393ZM869.187 326.694C907.608 193.242 855.147 89.1558 721.504 47.7432C715.644 46.2092 709.7 44.5954 703.831 43.1364C759.266 82.8032 772.514 130.858 763.904 196.72C816.165 216.221 857.468 251.175 866.153 308.029C866.689 311.543 868.072 324.321 869.187 326.694ZM191.629 527.78C297.433 552.893 430.556 499.612 520.339 444.248C521.893 443.293 523.421 442.294 524.921 441.255C604.551 389.394 692.559 312.627 723.232 220.38C616.115 199.074 481.946 251.649 391.399 308.172C308.033 361.575 227.616 433.402 191.629 527.78ZM564.68 645.154C578.577 638.125 607.512 622.764 620.172 613.86C703.18 560.211 809.11 478.34 832.074 377.647C847.395 310.464 820.574 255.088 755.716 230.204C721.789 341.025 600.492 440.732 501.803 495.466C408.043 543.845 290.032 586.433 183.996 561.577C179.875 597.931 181.758 626.562 205.331 656.815C229.567 687.91 270.75 706.286 309.56 710.197C394.825 718.779 489.53 683.168 564.68 645.154Z';
const MARK_W = 917, MARK_H = 752;
let mark;

function face(ctx, [a, b, c, d, fill]) {
  ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...c); ctx.lineTo(...d); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = fill; ctx.lineWidth = 0.8; ctx.lineJoin = 'round'; ctx.stroke();
}

/** The box at (cx, cy) = centre of its 320×300 box, `s` px per unit; lid lifted / tilted / faded by `lid`. */
function drawBox(ctx, cx, cy, s, { lid = { y: 0, x: 0, rot: 0, a: 1 }, squash = 0 } = {}) {
  ctx.save();
  ctx.translate(cx, cy + 150 * s); ctx.scale(s * (1 + squash * 0.06), s * (1 - squash * 0.1)); ctx.translate(-160, -300);
  face(ctx, FACES.top); face(ctx, FACES.left); face(ctx, FACES.right);
  if (lid.a > 0.01) {
    ctx.save(); ctx.globalAlpha = lid.a;
    ctx.translate(160 + lid.x, 90 + lid.y); ctx.rotate(lid.rot); ctx.translate(-160, -90);
    face(ctx, FACES.lidL); face(ctx, FACES.lidR); face(ctx, FACES.lidTop);
    // the mark on the lid's top face, same affine as the site
    const k = (130 / MARK_W) * 0.55, [a, b, c, d] = [k, -k / 2, k, k / 2], [mx, my] = [MARK_W / 2, MARK_H / 2];
    ctx.transform(a, b, c, d, 160 - (a * mx + c * my), 90 - (b * mx + d * my));
    ctx.fillStyle = '#5e5e62'; ctx.fill(mark);
    ctx.restore();
  }
  ctx.restore();
}

function glow(ctx, x, y, r, a, col = BLUE) {
  if (a <= 0.005) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(col, a)); g.addColorStop(0.45, rgba(col, a * 0.35)); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** A headline that rises out of a mask and sinks away again. */
function line(ctx, text, x, y, t, t0, t1, { size = 84, weight = 700, color = INK, align = 'center' } = {}) {
  const pin = EASE.expo(prog(t, t0, t0 + 0.7)), pout = E.inCubic(prog(t, t1 - 0.35, t1));
  if (pin <= 0 || pout >= 1) return;
  setFont(ctx, weight, size, 'Inter', -size * 0.035); ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = rgba(color, 1 - pout);
  maskedText(ctx, text, x, y - pout * size * 0.4, pin, { size });
}

export default {
  setup() { mark = new Path2D(MARK_PATH); },
  draw(ctx, t, api) {
    const { W, H, lang } = api, c = COPY[lang] ?? COPY.en, at = api.at.bind(api);
    const LAND = at(0, 8), POP = at(2), ORBIT = at(3), END = at(4);
    ctx.fillStyle = rgba(BG); ctx.fillRect(0, 0, W, H);

    // spotlight on the stage
    const sp = ctx.createRadialGradient(W / 2, H * 0.52, 0, W / 2, H * 0.52, H * 0.62);
    sp.addColorStop(0, 'rgba(70,70,76,0.55)'); sp.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sp; ctx.fillRect(0, 0, W, H);

    const endP = EASE.expo(prog(t, END - 0.1, END + 0.9));
    const [sx, sy] = shake(t, [[LAND, 16], [POP, 24]]);
    ctx.save(); ctx.translate(sx, sy);

    // ── stage: box, chips, headlines (fades and lifts away into the end card)
    if (endP < 1) {
      ctx.save(); ctx.globalAlpha = 1 - endP; ctx.translate(0, -endP * 120);
      const cx = W / 2, rest = H * 0.55, s = 1.8;
      // drop: accelerate down onto the floor, squash on landing
      const fall = E.inCubic(prog(t, 0.25, LAND)), y = lerp(-420, rest, fall);
      const squash = wobble(t - LAND, 18, 8) * (t >= LAND ? 1 : 0);
      // tremble between landing and the pop, growing towards it
      const build = prog(t, at(1), POP), tr = t < POP ? build * build : 0;
      const jx = Math.sin(t * 90) * 7 * tr, rot = Math.sin(t * 70) * 0.04 * tr;
      // lid: blows up and off at the pop
      const lp = prog(t, POP, POP + 0.9);
      const lid = { y: -E.outCubic(lp) * 520, x: E.outCubic(lp) * 180, rot: E.outCubic(lp) * 0.9, a: 1 - prog(t, POP + 0.35, POP + 0.9) };

      // floor shadow
      const sh = clamp(fall) * (1 - squash * 0.2);
      glow(ctx, cx, rest + 205 * s * 0.55, 230 * s, 0.28 * sh, [0, 0, 0]);
      glow(ctx, cx, rest, 360 + 260 * tr, 0.1 + 0.45 * tr + 0.4 * (1 - prog(t, POP, POP + 1.2)) * (t >= POP ? 1 : 0));

      ctx.save(); ctx.translate(cx + jx, y); ctx.rotate(rot);
      drawBox(ctx, 0, 0, s, { lid, squash: t >= LAND && t < POP ? squash : 0 });
      ctx.restore();
      // light spilling out of the open box
      if (t >= POP) glow(ctx, cx, y - 45 * s, 300 * s * (0.8 + 0.2 * Math.sin(t * 3)), 0.5 * prog(t, POP, POP + 0.4), [120, 190, 255]);

      // tickers: out of the box on the pop, then a slow orbit
      TICKERS.forEach((tk, i) => {
        const t0 = POP + 0.06 + i * api.step * 0.5, p = spring(t - t0, 11, 6);
        if (p <= 0) return;
        const a0 = -Math.PI / 2 + (i / TICKERS.length) * TAU, spin = Math.max(0, t - ORBIT) * 0.35;
        const ang = a0 + spin + (1 - clamp(p)) * 0.6, rx = 370 * p, ry = 290 * p;
        const x = cx + Math.cos(ang) * rx, yy = rest + 20 + Math.sin(ang) * ry;
        const sc = 0.6 + 0.4 * clamp(p);
        setFont(ctx, 700, 38 * sc, 'Inter', -0.5);
        const w = ctx.measureText(tk).width + 44 * sc;
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
        ctx.fillStyle = rgba(INK); pill(ctx, x, yy, w, 68 * sc); ctx.fill(); ctx.restore();
        ctx.fillStyle = rgba(DARK); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(tk, x, yy + 2);
      });

      const top = H * 0.17;
      line(ctx, c.sealed, W / 2, top, t, 1.05, at(1));
      line(ctx, c.nobody, W / 2, top, t, at(1), POP, { size: 64 });
      line(ctx, c.slice, W / 2, top, t, POP + 0.25, ORBIT, { size: 64 });
      line(ctx, c.open, W / 2, top - 10, t, ORBIT, END, { size: 88 });
      line(ctx, c.own, W / 2, top + 88, t, ORBIT + 0.12, END, { size: 88, color: BLUE });
      line(ctx, c.price, W / 2, H * 0.9, t, ORBIT + 0.3, END, { size: 34, weight: 600, color: MUTED });
      ctx.restore();
    }

    // ── end card
    if (endP > 0) {
      const p = endP, m = spring(t - END - 0.05, 12, 7);
      const size = 230 * clamp(m);
      if (size > 1) {
        ctx.save(); ctx.translate(W / 2 - size / 2, H * 0.36 - (size * MARK_H / MARK_W) / 2);
        ctx.scale(size / MARK_W, size / MARK_W); ctx.fillStyle = rgba(INK); ctx.fill(mark); ctx.restore();
      }
      glow(ctx, W / 2, H * 0.36, 380, 0.25 * p);
      line(ctx, 'Pandock', W / 2, H * 0.53, t, END + 0.2, 99, { size: 120 });
      line(ctx, c.price, W / 2, H * 0.61, t, END + 0.45, 99, { size: 34, weight: 600, color: MUTED });
      line(ctx, c.live, W / 2, H * 0.72, t, END + 0.7, 99, { size: 44, weight: 600, color: BLUE });
      line(ctx, c.url, W / 2, H * 0.8, t, END + 0.85, 99, { size: 52, weight: 700 });
      line(ctx, c.bot, W / 2, H * 0.87, t, END + 1.0, 99, { size: 32, weight: 400, color: MUTED });
    }
    ctx.restore();

    flash(ctx, W, H, t, POP, 0.55, 0.09, [220, 235, 255]);
    shockRing(ctx, W / 2, H * 0.52, t, POP, { color: BLUE, life: 0.7, radius: 900, width: 40 });
    shockRing(ctx, W / 2, H * 0.55 + 190, t, LAND, { color: [120, 120, 128], life: 0.45, radius: 420, width: 14 });
  },
  post(ctx, t, { W, H }) { bloom(ctx, W, H, { alpha: 0.14 }); vignette(ctx, W, H, 0.35); },
};
