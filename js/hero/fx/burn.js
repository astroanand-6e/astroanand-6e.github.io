/* Black flames with a red edge. Adapted from the HyperFrames ridged-burn block (Apache-2.0):
   abs(noise) gives the sharp crack edges, a blackbody ramp gives the heat and a high-frequency
   noise threshold gives the embers. Instead of mixing two textures, burnt area becomes the page
   black so the story section underneath can arrive. The front climbs from the bottom with
   upward-stretched noise so the edge licks like flame. p: 0 clean, 1 fully burnt. */
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
${GLSL_NOISE}
void main(){
  vec2 uv = v_uv;
  vec2 a = vec2(u_res.x / u_res.y, 1.0);
  vec2 np = vec2(uv.x * a.x * 3.2, uv.y * 1.6 - u_time * 0.25);
  float n = ridged(np + vec2(0.0, 3.0));
  float tongue = fbm(vec2(uv.x * a.x * 6.0, uv.y * 2.2 - u_time * 0.5));
  float field = n * 0.42 + tongue * 0.18 + uv.y * 0.5;
  float t = mix(-0.12, 1.1, u_p);
  float burnt = 1.0 - smoothstep(t - 0.025, t + 0.025, field);
  float d = abs(field - t);
  float heat = smoothstep(0.1, 0.0, d) * (1.0 - step(1.0, u_p)) * step(0.001, u_p);
  vec3 ramp = mix(vec3(0.35, 0.0, 0.0), vec3(1.0, 0.1, 0.04), smoothstep(0.0, 0.3, heat));
  ramp = mix(ramp, vec3(1.0, 0.4, 0.12), smoothstep(0.35, 0.7, heat));
  float rim = smoothstep(0.045, 0.0, field - t) * smoothstep(-0.12, 0.0, field - t) * (1.0 - burnt);
  float ember = step(0.93, vnoise(vec2(uv.x * a.x * 90.0, uv.y * 90.0 - u_time * 6.0))) * heat * 2.5;
  vec3 col = vec3(0.02) * burnt + ramp * (heat * 0.9 + rim * 1.2) + vec3(1.0, 0.6, 0.2) * ember;
  float alpha = clamp(burnt + heat * 0.85 + rim + ember, 0.0, 1.0);
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
    },
  });
}
