'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useThemeStore } from '@/lib/stores/theme-store';
import { getSectionFromPath } from '@/lib/section-colors';

// ═══════════════════════════════════════════════════════════════════
// AuraOrbs — подвижные орбы на raw WebGL fragment shader.
// Только для темы t-aura. Рендерится под контентом (fixed, z-0,
// pointer-events:none). Цвет реагирует на раздел через uniform с
// плавной интерполяцией. CSS-орбы (в globals.css) — независимый
// базовый слой; этот канвас работает ПОВЕРХ них, поэтому если WebGL
// недоступен — атмосфера всё равно остаётся (CSS), а не исчезает.
// ═══════════════════════════════════════════════════════════════════

// RGB 0..1 палитра орбов по разделам (синхронно с [data-section] в globals.css)
const SECTION_COLORS: Record<string, [[number, number, number], [number, number, number]]> = {
  dashboard: [[0.78, 0.48, 0.12], [0.49, 0.36, 0.83]], // янтарь + фиолет
  today:     [[0.78, 0.48, 0.12], [0.49, 0.36, 0.83]], // Сегодня — как Дашборд
  leads:     [[0.78, 0.48, 0.12], [0.88, 0.63, 0.23]], // янтарь
  projects:  [[0.78, 0.48, 0.12], [0.88, 0.63, 0.23]],
  tasks:     [[0.49, 0.36, 0.83], [0.63, 0.47, 0.88]], // фиолет
  calendar:  [[0.49, 0.36, 0.83], [0.63, 0.47, 0.88]],
  meetings:  [[0.49, 0.36, 0.83], [0.63, 0.47, 0.88]],
  analytics: [[0.23, 0.50, 0.83], [0.35, 0.66, 0.88]], // голубой
  contacts:  [[0.15, 0.65, 0.60], [0.18, 0.56, 0.36]], // бирюза/зелёный
  companies: [[0.15, 0.65, 0.60], [0.18, 0.56, 0.36]],
  calls:     [[0.15, 0.65, 0.60], [0.18, 0.56, 0.36]],
  settings:  [[0.51, 0.51, 0.59], [0.59, 0.59, 0.66]], // нейтраль
};

const FALLBACK: [[number, number, number], [number, number, number]] =
  SECTION_COLORS.dashboard;

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// Фрагментный шейдер: 3 движущихся орба у краёв, мягкое сложение.
// Premultiplied alpha: gl_FragColor.rgb уже умножен на alpha — корректно
// сочетается с blendFunc(ONE, ONE_MINUS_SRC_ALPHA) на белом фоне.
const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform vec3  uC1;
uniform vec3  uC2;

float orb(vec2 uv, vec2 c, float r) {
  float d = length(uv - c);
  return smoothstep(r, 0.0, d);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float ar = uRes.x / uRes.y;
  uv.x *= ar;

  float t = uTime * 0.05;

  // Орбы у углов: правый-верх, левый-низ, правый-низ
  vec2 p1 = vec2(ar * (0.94 + 0.05 * sin(t * 1.1)), 0.06 + 0.05 * cos(t * 0.9));
  vec2 p2 = vec2(ar * (0.05 + 0.05 * cos(t * 0.8)), 0.95 + 0.05 * sin(t * 1.2));
  vec2 p3 = vec2(ar * (0.88 + 0.06 * sin(t * 0.7 + 1.5)), 0.93 + 0.05 * cos(t * 1.0));

  float g1 = orb(uv, p1, 0.60);
  float g2 = orb(uv, p2, 0.58);
  float g3 = orb(uv, p3, 0.45);

  vec3 col = uC1 * g1 + uC2 * g2 + mix(uC1, uC2, 0.5) * g3;
  float a = max(max(g1, g2 * 0.9), g3 * 0.75);

  // Интенсивность атмосферы (заметно, но данные живут на белом)
  a *= 0.30;

  // premultiplied: rgb * alpha
  gl_FragColor = vec4(col * a, a);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function AuraOrbs() {
  const theme = useThemeStore((s) => s.theme);
  const pathname = usePathname();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const targetRef = useRef<[[number, number, number], [number, number, number]]>(FALLBACK);

  useEffect(() => {
    const section = getSectionFromPath(pathname);
    targetRef.current = SECTION_COLORS[section] ?? FALLBACK;
  }, [pathname]);

  useEffect(() => {
    if (theme !== 't-aura') return;
    if (typeof window === 'undefined') return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cvRaw = canvasRef.current;
    if (!cvRaw) return;

    const glRaw =
      (cvRaw.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false }) as WebGLRenderingContext | null) ||
      (cvRaw.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!glRaw) return; // нет WebGL → CSS-орбы остаются (они независимый слой)

    const cv: HTMLCanvasElement = cvRaw;
    const gl: WebGLRenderingContext = glRaw;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    gl.enable(gl.BLEND);
    // premultiplied alpha blending
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uTime = gl.getUniformLocation(prog, 'uTime');
    const uC1 = gl.getUniformLocation(prog, 'uC1');
    const uC2 = gl.getUniformLocation(prog, 'uC2');

    const cur: [[number, number, number], [number, number, number]] = [
      [...FALLBACK[0]] as [number, number, number],
      [...FALLBACK[1]] as [number, number, number],
    ];

    const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    function resize() {
      const w = Math.max(1, Math.floor(window.innerWidth * DPR));
      const h = Math.max(1, Math.floor(window.innerHeight * DPR));
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }
      gl.viewport(0, 0, cv.width, cv.height);
    }
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    let last = 0;
    const start = performance.now();
    const FRAME_MS = 1000 / 40;

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      if (now - last < FRAME_MS) return;
      last = now;

      const tgt = targetRef.current;
      const k = 0.05;
      for (let i = 0; i < 3; i++) {
        cur[0][i] += (tgt[0][i] - cur[0][i]) * k;
        cur[1][i] += (tgt[1][i] - cur[1][i]) * k;
      }

      const elapsed = reduced ? 0 : (now - start) / 1000;
      gl.uniform2f(uRes, cv.width, cv.height);
      gl.uniform1f(uTime, elapsed);
      gl.uniform3f(uC1, cur[0][0], cur[0][1], cur[0][2]);
      gl.uniform3f(uC2, cur[1][0], cur[1][1], cur[1][2]);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, [theme]);

  if (theme !== 't-aura') return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
}
