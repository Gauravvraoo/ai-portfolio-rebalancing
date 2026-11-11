import { useCallback, useEffect, useState } from "react";
export async function request(path, options = {}) {
  const response = await fetch(`/api/${path}`, options);
  if (!response.ok) {
    let message = `Request failed (${response.status}). Check that the backend is running.`;
    try {
      const body = await response.json();
      if (Array.isArray(body.detail))
        message = body.detail.map((x) => x.msg).join("; ");
    } catch {
      /* use status */
    }
    throw new Error(message);
  }
  return response.json();
}
export function useApi(path) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const retry = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    request(path)
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
    };
  }, [path, version]);
  return { data, error, loading, retry };
}
