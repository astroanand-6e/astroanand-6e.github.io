/* Palm vortex: a disc of red light that swirls in his open palm. The disc is squashed vertically so it
   lies flat on the palm; inside it, three spiral arms are wound by radius and warped by noise sampled in
   a swirled frame (inner rings turn faster), so it moves like a liquid, not a spinning sprite. As the
   pull grows the disc tightens toward its core; the flare blows the core out to white.
   Turns clockwise on screen, the same way the tool icons orbit (scenes/palm.js). Output is premultiplied;
   the paper theme draws it in red ink. */
import { createShaderFx, GLSL_NOISE } from '../gl.js';
import { isPaper } from '../timeline-utils.js';

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform vec2 u_res;
uniform float u_build;
uniform float u_spin;
uniform float u_pull;
uniform float u_flare;
uniform float u_light;
${GLSL_NOISE}
const float TILT = 0.36;
void main(){
  vec2 c = (v_uv - 0.5) * 2.0;
  vec2 q = vec2(c.x, c.y / TILT);
  float r = length(q);
  float a = atan(q.y, q.x);
  float radius = mix(0.9, 0.14, u_pull);
  float twist = 2.2 + 6.0 * u_pull;
  float ang = u_spin + twist / (r + 0.35);
  float cs = cos(ang);
  float sn = sin(ang);
  vec2 p = mat2(cs, sn, -sn, cs) * q;
  float n = fbm(p * 2.2 + 4.3);
  float fine = fbm(p * 6.0 - 2.1);
  float arms = pow(0.5 + 0.5 * cos(3.0 * a - 2.0 * twist * r + n * 5.0 + u_spin * 3.0), 2.0);
  float body = smoothstep(radius, radius * 0.2, r) * u_build;
  float ring = exp(-pow((r - radius * 0.8) / 0.09, 2.0)) * 0.35 * u_build * (0.6 + 0.4 * n);
  float energy = arms * (0.45 + 0.8 * fine) * body + ring;
  float d2 = dot(c, c);
  float core = exp(-d2 / (0.004 + 0.012 * u_build + 0.06 * u_flare)) * (0.5 * u_build + 1.6 * u_flare);
  float halo = exp(-d2 / (0.05 + 0.25 * u_flare)) * (0.25 * u_build + 0.5 * u_flare);
  float alpha = clamp(energy * 1.25 + core + halo * 0.6, 0.0, 1.0);
  alpha *= smoothstep(1.0, 0.82, max(abs(c.x), abs(c.y)));
  vec3 col = mix(vec3(0.6, 0.03, 0.0), vec3(1.0, 0.36, 0.16), clamp(energy * 1.5, 0.0, 1.0));
  col = mix(col, vec3(1.0, 0.9, 0.84), clamp(core, 0.0, 1.0));
  if (u_light > 0.5) {
    col = mix(vec3(0.62, 0.0, 0.0), vec3(0.9, 0.08, 0.03), clamp(energy * 1.5 + core * 0.5, 0.0, 1.0));
    alpha *= 0.9;
  }
  gl_FragColor = vec4(col * alpha, alpha);
}`;

/* state: build 0..1 (the disc forms), spin (radians), pull 0..1 (collapses inward), flare 0..1. */
export function createPalmSwirl(canvas, { maxDpr }) {
  let state = Object.freeze({ build: 0, spin: 0, pull: 0, flare: 0 });
  let isBlank = true;
  const fx = createShaderFx(canvas, {
    frag: FRAG,
    scale: 1,
    maxDpr,
    draw(uniform) {
      uniform('u_build', state.build);
      uniform('u_spin', state.spin);
      uniform('u_pull', state.pull);
      uniform('u_flare', state.flare);
      uniform('u_light', isPaper() ? 1 : 0);
    },
  });
  return {
    /* Repaints only while something is visible, plus the one clearing frame after it goes. */
    set(next) {
      state = Object.freeze({ ...state, ...next });
      const blank = state.build <= 0.001 && state.flare <= 0.001;
      if (blank && isBlank) return;
      isBlank = blank;
      fx.render(state.build);
    },
    wake: () => fx.wake(),
    release: () => fx.release(),
    repaint: () => fx.repaint(),
    get gl() { return fx.gl; },
  };
}
