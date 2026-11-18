/* Arm raise for the palm scene, in-betweened with optical flow (WebGL).
   Key drawings: stand -> Qwen in-betweens -> palm. For each pair, tools/flow.py precomputed dense
   flow both ways (masked to the moving arm, so the face never wobbles). Any in-between is the
   Super SloMo linear approximation, so the hand travels through space instead of crossfading:
     F_t0 = -(1-t) t F01 + t^2 F10,  F_t1 = (1-t)^2 F01 - t(1-t) F10
     I_t  = (1-t) A(x + F_t0) + t B(x + F_t1)
   Timing follows the animation principles: a small anticipation dip, a fast middle, and an
   overshoot past the palm drawing that settles back. render(p) is a pure function of p (0..1).
   Without WebGL it falls back to the cross-dissolve on holds. */
import { clamp01, isPaper } from '../timeline-utils.js';

const VERT = 'attribute vec2 a_pos; varying vec2 v_uv; void main(){ v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }';
const FRAG = `precision highp float;
varying vec2 v_uv;
uniform sampler2D u_a, u_b, u_f01, u_f10;
uniform float u_t, u_w, u_range;
uniform vec2 u_size; /* key drawing size in px */
vec2 flowAt(sampler2D s, vec2 uv) {
  vec2 q = texture2D(s, uv).rg * 255.0;
  vec2 px = (q - 128.0) / 127.0 * u_range;
  return vec2(px.x, -px.y) / u_size; /* image y runs down, uv y runs up */
}
void main() {
  float t = u_t;
  vec2 f01 = flowAt(u_f01, v_uv);
  vec2 f10 = flowAt(u_f10, v_uv);
  vec2 ft0 = -(1.0 - t) * t * f01 + t * t * f10;
  vec2 ft1 = (1.0 - t) * (1.0 - t) * f01 - t * (1.0 - t) * f10;
  vec4 a = texture2D(u_a, v_uv + ft0);
  vec4 b = texture2D(u_b, v_uv + ft1);
  /* Positions move linearly in t, but the hand-over between drawings is quick and centred
     (u_w), so where the flow is unsure the eye sees one moving hand, not two. */
  gl_FragColor = a * (1.0 - u_w) + b * u_w;
}`;
const QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
const ANTICIPATE = 0; /* off: Anand doesn't want springy motion */ // /* how far the gesture dips back before it rises */
const OVERSHOOT = 0; // /* how far past the palm drawing it swings before settling */
const DISSOLVE = Object.freeze([0.3, 0.7]);
const HANDOVER = Object.freeze([0.38, 0.62]);
/* On paper a half-faded arm is a see-through grey ghost (on black it vanishes), so the hand-over between
   drawings is nearly a cut there: each drawing stays crisp and the double arm lasts a sliver of the scroll. */
const HANDOVER_PAPER = Object.freeze([0.46, 0.54]);

/* Gesture curve in frame space: dip, fast rise, overshoot, settle (Disney: anticipation + follow-through). */
function gesture(p) {
  const t = clamp01(p);
  const s = t * t * (3 - 2 * t);
  const dip = -ANTICIPATE * Math.sin(Math.min(1, t / 0.18) * Math.PI) * (t < 0.18 ? 1 : 0);
  const over = OVERSHOOT * Math.sin(Math.max(0, (t - 0.7) / 0.3) * Math.PI) * (t > 0.7 ? 1 : 0);
  return s + dip + over;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`flow texture failed: ${src}`));
    img.src = src;
  });
}

export function createPoseFlow(canvas, frames, flowSpec) {
  let gl = null;
  let program = null;
  let loc = {};
  let frameTex = [];
  let flowTex = [];
  let flowImgs = null;
  let ready = false;
  let failed = false;
  let lastP = 0;
  let ctx2d = null;

  function texture(img, isData) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !isData);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, isData ? gl.NONE : gl.BROWSER_DEFAULT_WEBGL);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }

  async function setup() {
    flowImgs = flowImgs || await Promise.all(flowSpec.pairs.flatMap((pair) => [loadImage(pair.f01), loadImage(pair.f10)]));
    await Promise.all(frames.map((img) => (img.complete && img.naturalWidth ? null : img.decode().catch(() => null))));
    gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) throw new Error('WebGL unavailable');
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    loc = Object.fromEntries(['u_a', 'u_b', 'u_f01', 'u_f10', 'u_t', 'u_w', 'u_range', 'u_size']
      .map((n) => [n, gl.getUniformLocation(program, n)]));
    gl.uniform1i(loc.u_a, 0);
    gl.uniform1i(loc.u_b, 1);
    gl.uniform1i(loc.u_f01, 2);
    gl.uniform1i(loc.u_f10, 3);
    frameTex = frames.map((img) => texture(img, false));
    flowTex = flowImgs.map((img) => texture(img, true));
    ready = true;
    render(lastP);
  }

  function fit() {
    const box = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(box.width * dpr));
    const h = Math.max(1, Math.round(box.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return [w, h];
  }

  function segment(p) {
    const f = Math.min(frames.length - 1, Math.max(0, gesture(p) * (frames.length - 1)));
    const k = Math.min(frames.length - 2, Math.floor(f));
    return { k, t: f - k };
  }

  /* Fallback: 2D cross-dissolve on holds. */
  function render2d(p) {
    ctx2d = ctx2d || canvas.getContext('2d');
    if (!ctx2d) return;
    const [w, h] = fit();
    ctx2d.globalCompositeOperation = 'source-over';
    ctx2d.globalAlpha = 1;
    ctx2d.clearRect(0, 0, w, h);
    if (p <= 0) return;
    const { k, t: raw } = segment(p);
    const u = clamp01((raw - DISSOLVE[0]) / (DISSOLVE[1] - DISSOLVE[0]));
    const t = u * u * (3 - 2 * u);
    ctx2d.globalCompositeOperation = 'lighter';
    [[frames[k], 1 - t], [frames[k + 1], t]].forEach(([img, a]) => {
      if (a > 0.001 && img.naturalWidth) { ctx2d.globalAlpha = a; ctx2d.drawImage(img, 0, 0, w, h); }
    });
    ctx2d.globalCompositeOperation = 'source-over';
    ctx2d.globalAlpha = 1;
  }

  function render(p) {
    lastP = clamp01(p);
    if (failed) { render2d(lastP); return; }
    if (!ready) return;
    const [w, h] = fit();
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (lastP <= 0) return;
    const { k, t } = segment(lastP);
    const pair = flowSpec.pairs[k];
    const bind = (unit, tex) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); };
    bind(0, frameTex[k]);
    bind(1, frameTex[k + 1]);
    bind(2, flowTex[k * 2]);
    bind(3, flowTex[k * 2 + 1]);
    gl.uniform1f(loc.u_t, t);
    const [h0, h1] = isPaper() ? HANDOVER_PAPER : HANDOVER;
    const u = clamp01((t - h0) / (h1 - h0));
    gl.uniform1f(loc.u_w, u * u * (3 - 2 * u));
    gl.uniform1f(loc.u_range, pair.range);
    gl.uniform2f(loc.u_size, flowSpec.width, flowSpec.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  return {
    render,
    wake() {
      if (!ready && !failed && !this.pending) {
        this.pending = setup().catch((error) => {
          console.warn(`hero: flow in-betweens unavailable, dissolving instead (${error.message})`);
          failed = true;
          render2d(lastP);
        });
      }
      render(lastP);
    },
    release() {},
    pending: null,
  };
}
