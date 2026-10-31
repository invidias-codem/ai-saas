export async function requestWebdriver(route, method = 'GET', body) {
  const response = await fetch(`http://127.0.0.1:4444${route}`, { method, signal: AbortSignal.timeout(30000),
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok || result.value?.error) {
    const detail = typeof result.value?.message === 'string' ? result.value.message.replace(/[\u0000-\u001f]/g, ' ').slice(0, 2048) : '';
    throw new Error(`WebDriver ${method} ${route}: ${result.value?.error ?? response.status}${detail ? `: ${detail}` : ''}`);
  }
  return result.value;
}
