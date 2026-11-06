// A no-op 2D context good enough to run every game's draw() in Node.
export function stubCanvas() {
  const grad = { addColorStop() {} };
  const target = {
    canvas: { width: 800, height: 1440 },
    measureText: (t) => ({ width: String(t).length * (parseFloat(target.font) || 10) * 0.6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    createConicGradient: () => grad,
    createPattern: () => ({}),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    getLineDash: () => [],
    isPointInPath: () => false,
    font: '10px sans-serif',
  };
  return new Proxy(target, {
    get(o, k) { return k in o ? o[k] : () => {}; },
    set(o, k, v) { o[k] = v; return true; },
  });
}
