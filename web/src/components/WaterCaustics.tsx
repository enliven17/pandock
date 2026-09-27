import { useEffect, useRef } from 'react'
import { gsap } from '../motion'

// Adapted from portfolio/registry/motion/backgrounds/WaterCaustics.jsx.
// Same wave-refraction caustic model, cut down for a hero background:
//  - one pass of raw WebGL instead of three.js + a 4-pass bloom (no dependency, a light canvas has nothing to bloom)
//  - colours are uniforms, defaulting to white water with Action Blue light instead of the Caribbean palette
//  - analytic surface slope (6 cos) instead of a 4-tap finite difference (24 sin); one caustic layer
//  - the bottom fade happens in the shader, not a CSS mask (a mask repaints the layer every frame)
//  - drawn on GSAP's ticker so it shares a frame with Lenis/ScrollTrigger; resolution adapts to frame time
//  - pauses offscreen, draws one still frame under reduced motion
//  - the pointer (mouse or finger) ripples the water and lifts the light around it

const VERT = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`

const FRAG = `
precision mediump float;
uniform float uTime;
uniform vec2 uRes;
uniform float uScale;
uniform vec3 uWater;
uniform vec3 uHalo;
uniform vec3 uCore;
uniform float uStrength; // overall visibility of the light, 0..1
uniform vec2 uMouse;     // pointer in 0..1 canvas space (GL origin, bottom-left)
uniform float uHover;    // 0..1, eases in while a pointer is over the hero

// Slope of the swell field, differentiated by hand (same waves as the original height()).
vec2 slope(vec2 p, float t) {
  return vec2(
     cos(p.x * 1.35 + p.y * 0.75 + t * 1.25) * 0.540 - cos(-p.x * 0.85 + p.y * 1.45 - t * 1.10) * 0.2975
   + cos(p.x * 1.10 - p.y * 1.30 + t * 1.40) * 0.330 - cos(-p.x * 1.40 - p.y * 0.65 - t * 0.95) * 0.350
   + cos(p.x * 2.8 + p.y * 2.1 - t * 2.2) * 0.336 - cos(-p.x * 2.4 + p.y * 2.7 + t * 2.0) * 0.240,
     cos(p.x * 1.35 + p.y * 0.75 + t * 1.25) * 0.300 + cos(-p.x * 0.85 + p.y * 1.45 - t * 1.10) * 0.5075
   - cos(p.x * 1.10 - p.y * 1.30 + t * 1.40) * 0.390 - cos(-p.x * 1.40 - p.y * 0.65 - t * 0.95) * 0.1625
   + cos(p.x * 2.8 + p.y * 2.1 - t * 2.2) * 0.252 + cos(-p.x * 2.4 + p.y * 2.7 + t * 2.0) * 0.270);
}

// Light bending through the moving surface converges into ribbons on the floor.
float caustic(vec2 p, float t, float scale, float tight) {
  vec2 uv = p * scale;
  vec2 p2 = uv + vec2(sin(uv.y * 1.5 + t * 1.15) * 0.42 + sin(uv.x * 2.8 - t * 1.3) * 0.18,
                      cos(uv.x * 1.4 - t * 1.05) * 0.42 + cos(uv.y * 2.5 + t * 1.2) * 0.18);
  vec2 p3 = p2 + vec2(sin(p2.y * 2.2 - t * 1.4 + 1.2) * 0.28, cos(p2.x * 2.0 + t * 1.3 - 0.8) * 0.28);
  float c = (sin(p3.x * 2.1 + p3.y * 1.2 + t * 1.5) + sin(-p3.x * 1.4 + p3.y * 2.3 - t * 1.3)
           + sin(p3.x * 1.8 - p3.y * 1.9 + t * 1.6) + sin(-p3.x * 2.2 - p3.y * 1.1 - t * 1.2)) * 0.25;
  float ribbon = clamp(1.0 - abs(c), 0.0, 1.0);
  float core = smoothstep(mix(0.76, 0.86, tight), 0.99, ribbon);
  float halo = smoothstep(mix(0.56, 0.72, tight), 0.96, ribbon) * 0.26;
  return core + halo;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  // Looking down into shallow water: tighter ripples recede toward the top.
  float persp = mix(1.24, 0.86, uv.y);
  vec2 q = (uv - vec2(0.5, 0.28)) * persp + vec2(0.5, 0.28);
  q.x *= aspect;
  float t = uTime * 0.26;

  // Pointer: rings spread from it and nudge the floor, and the light comes up around it like a torch.
  // Few, slow, wide rings: dense fast ones alias into shimmer at this canvas resolution.
  vec2 d = (uv - uMouse) * vec2(aspect, 1.0);
  float r = length(d);
  float near = exp(-r * r * 7.0) * uHover;
  vec2 ripple = (r > 0.0001 ? d / r : vec2(0.0)) * sin(r * 16.0 - uTime * 1.8) * 0.009 * near;

  vec2 floorUv = q - slope(q * 3.2, t) * 0.012 + ripple;
  float c = caustic(floorUv, t, 11.0 * uScale, mix(0.35, 0.85, uv.y));
  c *= sin(q.x * 2.6 - q.y * 1.8 + t * 0.85) * 0.08 + 0.92;

  vec3 light = mix(uHalo, uCore, smoothstep(0.3, 0.9, c));
  float amount = clamp(c * 0.86, 0.0, 1.0) * mix(uStrength, 1.0, near);
  amount *= smoothstep(0.0, 0.38, uv.y); // fade into the white section below
  gl_FragColor = vec4(mix(uWater, light, amount), 1.0);
}
`

type RGB = [number, number, number]
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB

// Resolution steps (fraction of CSS pixels). The soft ribbons read the same at a fraction of full size.
const STEPS = [0.6, 0.45, 0.34, 0.26]

type Options = { water: string; halo: string; core: string; strength: number; scale: number }

/** Sets up the program and the render loop; returns the cleanup. */
function start(gl: WebGLRenderingContext, canvas: HTMLCanvasElement, { water, halo, core, strength, scale }: Options) {
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader compile failed')
    return s
  }
  const prog = gl.createProgram()!
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT))
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(prog)
  gl.useProgram(prog)

  // One triangle that covers the screen.
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'p')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

  const u = (n: string) => gl.getUniformLocation(prog, n)
  gl.uniform1f(u('uScale'), scale)
  gl.uniform3fv(u('uWater'), hex(water))
  gl.uniform3fv(u('uHalo'), hex(halo))
  gl.uniform3fv(u('uCore'), hex(core))
  gl.uniform1f(u('uStrength'), strength)
  const uTime = u('uTime')
  const uRes = u('uRes')
  const uMouse = u('uMouse')
  const uHover = u('uHover')

  // Phones and very dense screens start two steps lower; everything steps down further if frames run long.
  let step = window.innerWidth < 700 || window.devicePixelRatio > 2 ? 2 : 0
  const resize = () => {
    const k = Math.min(window.devicePixelRatio, 2) * STEPS[step]
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * k))
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * k))
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.uniform2f(uRes, canvas.width, canvas.height)
  }

  // Pointer target and the eased value the shader sees, in 0..1 canvas space.
  const target = { x: 0.5, y: 0.5, hover: 0 }
  const eased = { x: 0.5, y: 0.5, hover: 0 }
  const onMove = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    // Normalised, so a resolution step never makes the pointer jump.
    target.x = (e.clientX - rect.left) / rect.width
    target.y = 1 - (e.clientY - rect.top) / rect.height
    const inside = e.clientY >= rect.top && e.clientY <= rect.bottom
    // Mouse: lit while hovering. Touch/pen: lit while the finger is down, so a tap or drag ripples.
    target.hover = inside && (e.pointerType === 'mouse' || e.buttons > 0 || e.type === 'pointerdown') ? 1 : 0
  }
  const onUp = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') target.hover = 0
  }
  const onLeave = () => (target.hover = 0)
  window.addEventListener('pointermove', onMove, { passive: true })
  window.addEventListener('pointerdown', onMove, { passive: true })
  window.addEventListener('pointerup', onUp, { passive: true })
  window.addEventListener('pointercancel', onUp, { passive: true })
  document.documentElement.addEventListener('pointerleave', onLeave)

  // Time-based easing (exponential smoothing): the follow feels the same at 30, 60 or 120 fps,
  // where a fixed per-frame lerp stutters whenever frame times wobble.
  let last = 0
  const draw = (seconds: number) => {
    const dt = last ? Math.min(seconds - last, 0.1) : 1 / 60
    last = seconds
    const follow = 1 - Math.exp(-dt * 4.5)
    const fade = 1 - Math.exp(-dt * 2.2)
    eased.x += (target.x - eased.x) * follow
    eased.y += (target.y - eased.y) * follow
    eased.hover += (target.hover - eased.hover) * fade
    gl.uniform2f(uMouse, eased.x, eased.y)
    gl.uniform1f(uHover, eased.hover)
    gl.uniform1f(uTime, seconds)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let visible = true
  let slowFrames = 0
  // gsap.ticker hands us (time in s, delta in ms). Frames over ~22ms for a sustained stretch
  // mean the effect is costing the page its smoothness: drop a resolution step and carry on.
  const tick = (time: number, delta: number) => {
    if (!visible || document.hidden) return
    draw(time)
    slowFrames = delta > 22 ? slowFrames + 1 : Math.max(0, slowFrames - 1)
    if (slowFrames > 45 && step < STEPS.length - 1) {
      step++
      slowFrames = 0
      resize()
    }
  }

  const ro = new ResizeObserver(() => {
    resize()
    if (still) draw(4)
  })
  ro.observe(canvas)
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting))
  io.observe(canvas)
  resize()
  if (still) draw(4)
  else gsap.ticker.add(tick)

  return () => {
    gsap.ticker.remove(tick)
    ro.disconnect()
    io.disconnect()
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerdown', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    document.documentElement.removeEventListener('pointerleave', onLeave)
    // Free what we made but keep the context alive: StrictMode remounts reuse this same canvas,
    // and a lost context would make the next compile fail.
    gl.deleteBuffer(buf)
    gl.deleteProgram(prog)
  }
}

export default function WaterCaustics({
  // White water with the light drawn in pale tints of Action Blue (#0066cc): halo fades into the
  // white, the core ribbon is the strongest tint. Kept light enough that ink type stays readable.
  water = '#ffffff',
  halo = '#f6f9fd',
  core = '#d4e4f6',
  strength = 0.32, // how much of the light shows away from the pointer
  scale = 1,
  className,
}: {
  water?: string
  halo?: string
  core?: string
  strength?: number
  scale?: number
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const gl = canvas.getContext('webgl', {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    })
    // No WebGL, or a context that is already lost: the CSS background colour shows instead.
    if (!gl || gl.isContextLost()) return
    try {
      return start(gl, canvas, { water, halo, core, strength, scale })
    } catch (e) {
      console.error('WaterCaustics disabled:', e) // a background effect must never take the page down
    }
  }, [water, halo, core, strength, scale])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}
