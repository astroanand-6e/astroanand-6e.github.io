/* Red-sky world. The warp field is the cascaded fbm(p + fbm(p)) from the HyperFrames
   domain-warp-dissolve block, the radial ripple comes from ripple-waves (both Apache-2.0).
   Layers: red gradient sky, drifting black cloud bands, a black moon disc, and a front that
   floods the frame from the eyes. p: 0 black, 1 fully flipped. t is seconds of scene time. */
import { createShaderFx, GLSL_NOISE } from '../gl.js';

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform vec2 u_res;
uniform float u_flip;
uniform float u_moon;
uniform float u_time;
uniform vec2 u_center;
${GLSL_NOISE}
void main(){
  vec2 aspect = vec2(u_res.x / u_res.y, 1.0);
  vec2 uv = v_uv;
  vec2 c = (uv - u_center) * aspect;
  float dist = length(c);
  vec2 dir = c / (dist + 0.001);
  float ripple = exp(sin(dist * 22.0 - u_time * 2.2) - 1.0) + 0.5 * exp(sin(dist * 46.0 - u_time * 3.4) - 1.0);
  vec2 q = vec2(fbm(uv * 2.5 + u_time * 0.02), fbm(uv * 2.5 + vec2(5.2, 1.3)));
  vec2 warp = (q - 0.5) * 0.07 + dir * ripple * 0.012 * smoothstep(1.4, 0.0, dist);
  vec2 w = uv + warp;
  float h = w.y;
  vec3 sky = mix(vec3(0.42, 0.0, 0.01), vec3(0.95, 0.07, 0.03), pow(1.0 - h, 1.3));
  sky += vec3(0.5, 0.12, 0.0) * smoothstep(0.35, 0.0, h) * 0.5;
  float band = 0.5 + 0.5 * sin(w.y * 9.0 + fbm(vec2(w.x * 1.2, w.y * 3.0)) * 4.0);
  float cloudN = fbm(vec2(w.x * 1.6 - u_time * 0.035, w.y * 7.0));
  float cloud = smoothstep(0.52, 0.72, cloudN * (0.55 + 0.6 * band)) * smoothstep(0.0, 0.25, h);
  vec2 mc = (w - vec2(0.68, 0.7 - (1.0 - u_moon) * 0.5)) * aspect;
  float moonR = 0.17;
  float moon = 1.0 - smoothstep(moonR - 0.004, moonR + 0.004, length(mc));
  float corona = smoothstep(moonR + 0.16, moonR, length(mc)) * 0.45;
  vec3 world = sky + vec3(1.0, 0.18, 0.08) * corona;
  world = mix(world, vec3(0.0), clamp(cloud * 0.92 + moon, 0.0, 1.0));
  float front = u_flip * 1.7;
  float edgeN = (fbm(c * 5.0 + u_time * 0.1) - 0.5) * 0.22;
  float reach = 1.0 - smoothstep(front - 0.03, front + 0.03, dist + edgeN);
  float glint = smoothstep(0.1, 0.0, abs(dist + edgeN - front)) * step(0.001, u_flip) * (1.0 - smoothstep(0.85, 1.0, u_flip));
  vec3 col = mix(vec3(0.02), world, reach) + vec3(1.0, 0.25, 0.15) * glint * 0.9;
  gl_FragColor = vec4(col, 1.0);
}`;

export function createGenjutsu(canvas, { scale, maxDpr, center }) {
  const state = { flip: 0, moon: 0, time: 0 };
  const fx = createShaderFx(canvas, {
    frag: FRAG,
    scale,
    maxDpr,
    draw(uniform) {
      uniform('u_flip', state.flip);
      uniform('u_moon', state.moon);
      uniform('u_time', state.time);
      uniform('u_center', center.x, center.y);
    },
  });
  return {
    wake: () => fx.wake(),
    release: () => fx.release(),
    get isActive() { return fx.isActive; },
    /* One call per frame sets every driver, so a seek costs a single paint. */
    set(next) {
      Object.assign(state, next);
      fx.render(0);
    },
    fx,
  };
}
