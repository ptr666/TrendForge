export const apiBase = import.meta.env.VITE_TRENDFORGE_API ?? "http://127.0.0.1:4780";

export async function api<T>(apiPath: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${apiPath}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}
