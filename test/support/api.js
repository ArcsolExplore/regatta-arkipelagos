// Calls Vercel-style Web handlers (GET/POST exports) in-process.
export async function call(mod, method, path, body, headers = {}) {
  const init = { method, headers: { 'content-type': 'application/json', ...headers } };
  if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
  const res = await mod[method](new Request('https://app.test' + path, init));
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}
