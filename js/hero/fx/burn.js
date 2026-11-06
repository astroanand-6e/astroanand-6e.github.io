/* Black flames with a red edge. Adapted from the HyperFrames ridged-burn block (Apache-2.0):
   abs(noise) gives the sharp crack edges, a thin red rim, dim halo and dark smoke replace the blackbody ramp, and a high-frequency
   noise threshold gives red embers. Instead of mixing two textures, burnt area becomes the page
   black so the story section underneath can arrive. The front climbs from the bottom with
   upward-stretched noise so the edge licks like flame. p: 0 clean, 1 fully burnt.
   u_light (paper theme): the same black flames and red edge, but the char behind the front
   washes out to paper, so the frame burns to the light page below. */
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
uniform float u_p;
uniform float u_time;
uniform float u_light;
${GLSL_NOISE}
void main(){
  vec2 uv = v_uv;
  vec2 a = vec2(u_res.x / u_res.y, 1.0);
  vec2 np = vec2(uv.x * a.x * 3.2, uv.y * 1.6 - u_time * 0.25);
  float n = ridged(np + vec2(0.0, 3.0));
  float tongue = fbm(vec2(uv.x * a.x * 5.0, uv.y * 0.8 - u_time * 0.5));
  float field = n * 0.3 + tongue * 0.34 + uv.y * 0.5;
  float t = mix(-0.12, 1.1, u_p);
  float burnt = 1.0 - smoothstep(t - 0.025, t + 0.025, field);
  float d = abs(field - t);
  float live = (1.0 - step(1.0, u_p)) * step(0.001, u_p);
  float rim = smoothstep(0.016, 0.0, d) * live;
  float halo = smoothstep(0.08, 0.0, d) * live;
  vec3 red = mix(vec3(0.88, 0.02, 0.0), vec3(1.0, 0.165, 0.12), rim);
  float depth = smoothstep(0.0, 0.3, t - field);
  vec3 body = mix(vec3(0.1, 0.0, 0.0), vec3(0.02, 0.0, 0.0), depth);
  float smoke = smoothstep(0.34, 0.0, field - t) * (1.0 - burnt) * smoothstep(0.35, 0.7, fbm(vec2(uv.x * a.x * 4.0, uv.y * 2.0 - u_time * 0.35))) * live;
  float ember = step(0.94, vnoise(vec2(uv.x * a.x * 90.0, uv.y * 90.0 - u_time * 6.0))) * halo;
  vec3 col = body * burnt + red * (rim * 1.1 + halo * 0.12) + vec3(1.0, 0.16, 0.1) * ember;
  float alpha = clamp(burnt + rim + halo * 0.35 + smoke * 0.45 + ember, 0.0, 1.0);
  if (u_light > 0.5) {
    vec3 paper = vec3(0.957, 0.957, 0.949);
    float wash = smoothstep(0.02, 0.2, t - field + (tongue - 0.5) * 0.12);
    vec3 char = mix(vec3(0.07, 0.02, 0.02), vec3(0.38, 0.12, 0.08), smoothstep(0.0, 0.6, wash));
    vec3 ash = mix(char, paper, wash);
    col = ash * burnt + red * (rim * 1.1 + halo * 0.12) * (1.0 - wash) + vec3(0.85, 0.05, 0.0) * ember;
  }
  gl_FragColor = vec4(min(col, vec3(1.0)), alpha);
}`;

export function createBurn(canvas, { scale, maxDpr, seconds }) {
  return createShaderFx(canvas, {
    frag: FRAG,
    scale,
    maxDpr,
    draw(uniform, p) {
      uniform('u_p', p);
      uniform('u_time', p * seconds);
      uniform('u_light', isPaper() ? 1 : 0);
    },
  });
}
