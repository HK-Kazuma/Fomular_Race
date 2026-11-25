// WebGL2が使えるか（3D版の可否判定）
let cached = null;
export function webgl2() {
  if (cached != null) return cached;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    cached = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    cached = false;
  }
  return cached;
}
