import { useCallback, useEffect, useState } from "react";
export async function request(path, options = {}) {
  const { timeoutMs = 15000, ...fetchOptions } = options;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;
  let response;
  try {
    response = await fetch(`/api/${path}`, { ...fetchOptions, signal });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (timeout.aborted)
      throw new Error("The backend took too long to respond. Please retry.");
    throw new Error("Cannot reach the backend. Check that it is running, then retry.");
  }
  if (!response.ok) {
    let message = `Request failed (${response.status}). Check that the backend is running.`;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") message = body.detail;
      if (Array.isArray(body.detail))
        message = body.detail.map((x) => x.msg).join("; ");
    } catch { /* use status */ }
    throw new Error(message);
  }
  try {
    return await response.json();
  } catch {
    throw new Error("The backend returned an invalid response. Check the API proxy configuration.");
  }
}

export function useApi(path, timeoutMs = 15000) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const retry = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setData(null);
    setLoading(true);
    setError("");
    if (!path) {
      setData(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }
    request(path, { signal: controller.signal, timeoutMs })
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [path, version, timeoutMs]);
  return { data, error, loading, retry };
}

export function useLatestBacktest() {
  const list = useApi("backtests");
  const latest = list.data?.find((j) => j.status === "completed");
  const detail = useApi(latest ? `backtests/${latest.id}` : null);
  return {
    data: detail.data,
    loading: list.loading || Boolean(latest && detail.loading),
    error: list.error || detail.error,
    retry: () => {
      list.retry();
      detail.retry();
    },
  };
}
