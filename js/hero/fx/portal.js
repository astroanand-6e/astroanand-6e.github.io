/* Domain-expansion rift. Ported from the HyperFrames vfx-portal block (Apache-2.0): a
   noise-modulated circular edge, a glow ring with colour cycling and edge sparks. Here the
   inside is a black void with a red swirl instead of a second texture, so it can swallow
   the live page. Output is premultiplied. p: 0 closed, 1 fills the frame. */
import { createShaderFx, GLSL_NOISE } from '../gl.js';

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform vec2 u_res;
uniform float u_p;
uniform float u_time;
uniform vec2 u_center;
${GLSL_NOISE}
void main(){
  vec2 aspect = vec2(u_res.x / u_res.y, 1.0);
  vec2 c = (v_uv - u_center) * aspect;
  float dist = length(c);
  float ang = atan(c.y, c.x);
  float radius = u_p * 1.35;
  float edgeNoise = (vnoise(vec2(ang * 3.0, u_time * 2.0)) - 0.5) * 0.07 * smoothstep(0.0, 0.1, u_p);
  float edge = radius + edgeNoise;
  float inside = 1.0 - smoothstep(edge - 0.006, edge + 0.006, dist);
  float ed = abs(dist - edge);
  float ring = smoothstep(0.07, 0.0, ed) * smoothstep(0.0, 0.02, u_p);
  float halo = smoothstep(0.22, 0.0, ed) * 0.35 * smoothstep(0.0, 0.02, u_p);
  float phase = fract(ang / 6.2832 + u_time * 0.4);
  vec3 ringCol = mix(vec3(1.0, 0.16, 0.12), vec3(1.0, 0.5, 0.22), sin(phase * 6.2832) * 0.5 + 0.5);
  float spark = pow(vnoise(vec2(ang * 12.0, u_time * 8.0)), 4.0) * ring * 2.0;
  vec2 q = c * 3.0 + vec2(u_time * 0.2, 0.0);
  float swirl = fbm(q + fbm(q + ang));
  float fade = 1.0 - smoothstep(0.55, 1.0, u_p);
  vec3 voidCol = mix(vec3(0.02, 0.0, 0.0), vec3(0.45, 0.02, 0.01), smoothstep(0.35, 0.8, swirl) * 0.7 * fade);
  voidCol *= 0.55 + 0.45 * smoothstep(0.0, edge + 0.001, dist) * fade + 0.45 * (1.0 - fade);
  vec3 col = voidCol * inside + ringCol * ring * 1.9 + ringCol * halo + vec3(1.0, 0.85, 0.7) * spark;
  float a = clamp(inside + ring + halo * 0.6 + spark * 0.4, 0.0, 1.0);
  gl_FragColor = vec4(min(col, vec3(1.0)), a);
}`;

export function createPortal(canvas, { scale, maxDpr, center, seconds }) {
  return createShaderFx(canvas, {
    frag: FRAG,
    scale,
    maxDpr,
    draw(uniform, p) {
      uniform('u_p', p);
      uniform('u_time', p * seconds);
      uniform('u_center', center.x, center.y);
    },
  });
}
