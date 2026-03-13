export function resolveEventId(): number {
  const qs = new URLSearchParams(window.location.search);
  const fromQS = qs.get('e');
  if (fromQS && !Number.isNaN(Number(fromQS))) return Number(fromQS);

  const env = (import.meta as any).env?.VITE_DEFAULT_EVENT_ID;
  if (env && !Number.isNaN(Number(env))) return Number(env);

  return 1;
}
