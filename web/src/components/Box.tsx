import { MARK_H, MARK_PATH, MARK_W } from './Mark'

// The lid's top face is an isometric square: logo x runs along (130,-65), y along (130,65).
// Scale the mark to 55% of the face and centre it on (160,90).
const LID_MARK = (() => {
  const k = (130 / MARK_W) * 0.55
  const [a, b, c, d] = [k, -k / 2, k, k / 2]
  const [cx, cy] = [MARK_W / 2, MARK_H / 2]
  return `matrix(${a} ${b} ${c} ${d} ${160 - (a * cx + c * cy)} ${90 - (b * cx + d * cy)})`
})()

/** Clean isometric box: three flat tones per part, no ribbon, no outlines.
 *  Each face gets a same-colour hairline stroke so anti-aliasing never opens a seam between faces. */
export default function Box({ className = 'box' }: { className?: string }) {
  const face = (points: string, fill: string) => (
    <polygon points={points} fill={fill} stroke={fill} strokeWidth="0.8" strokeLinejoin="round" />
  )
  return (
    <svg className={className} viewBox="0 0 320 300" aria-hidden="true">
      {face('160,40 290,105 160,170 30,105', '#0b0b0c')}
      <g className="box-body">
        {face('30,105 160,170 160,280 30,215', '#1d1d1f')}
        {face('290,105 160,170 160,280 290,215', '#2c2c2e')}
      </g>
      <g className="box-lid">
        {face('30,90 160,155 160,170 30,105', '#27272a')}
        {face('290,90 160,155 160,170 290,105', '#38383b')}
        {face('160,25 290,90 160,155 30,90', '#48484b')}
        <path d={MARK_PATH} fill="#5e5e62" transform={LID_MARK} />
      </g>
    </svg>
  )
}
