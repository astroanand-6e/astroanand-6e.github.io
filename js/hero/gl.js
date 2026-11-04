/* Minimal full-screen-quad WebGL runner for the shader effects.
   Context is created on wake() and freed on release(), so only scenes near the viewport hold one.
   Quad and program setup follow the HyperFrames shader blocks (Apache-2.0). */

const VERT = 'attribute vec2 a_pos; varying vec2 v_uv; void main(){ v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }';
const QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

function compile(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`hero shader: ${log}`);
  }
  return shader;
}

function link(gl, fragSrc) {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`hero link: ${gl.getProgramInfoLog(program)}`);
  return program;
}

/* options: { frag, scale, maxDpr, draw(setUniform, p) } ; returns the fx handle. */
export function createShaderFx(canvas, options) {
  let node = canvas;
  let gl = null;
  let program = null;
  let uniforms = {};
  let lastP = 0;
  let isActive = false;

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, options.maxDpr);
    const w = Math.max(2, Math.round(node.clientWidth * dpr * options.scale));
    const h = Math.max(2, Math.round(node.clientHeight * dpr * options.scale));
    if (node.width !== w || node.height !== h) {
      node.width = w;
      node.height = h;
    }
    gl.viewport(0, 0, w, h);
  }

  function setup() {
    gl = node.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('hero: WebGL unavailable');
    program = link(gl, options.frag);
    gl.useProgram(program);
    uniforms = {};
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  function uniform(name, ...values) {
    if (!(name in uniforms)) uniforms[name] = gl.getUniformLocation(program, name);
    const loc = uniforms[name];
    if (loc === null) return;
    if (values.length === 1) gl.uniform1f(loc, values[0]);
    else if (values.length === 2) gl.uniform2f(loc, values[0], values[1]);
    else gl.uniform3f(loc, values[0], values[1], values[2]);
  }

  function paint() {
    size();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    uniform('u_res', node.width, node.height);
    options.draw(uniform, lastP);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  return {
    get canvas() { return node; },
    get gl() { return gl; },
    render(p) {
      lastP = p;
      if (isActive) paint();
    },
    wake() {
      if (isActive) return;
      try {
        setup();
        isActive = true;
        paint();
      } catch (error) {
        console.warn(error.message);
        isActive = false;
      }
    },
    release() {
      if (!isActive) return;
      isActive = false;
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      gl = null;
      const fresh = node.cloneNode(false);
      node.replaceWith(fresh);
      node = fresh;
    },
    get isActive() { return isActive; },
  };
}

/* Shared GLSL: hash, value noise, fbm and ridged fbm (from the ridged-burn and domain-warp blocks). */
export const GLSL_NOISE = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*f*(f*(f*6.-15.)+10.);
return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;mat2 R=mat2(.8,.6,-.6,.8);for(int i=0;i<5;i++){v+=a*vnoise(p);p=R*p*2.02;a*=.5;}return v;}
float ridged(vec2 p){float v=0.,a=.5;mat2 R=mat2(.8,.6,-.6,.8);for(int i=0;i<5;i++){v+=a*abs(vnoise(p)*2.-1.);p=R*p*2.02;a*=.5;}return v;}
`;
