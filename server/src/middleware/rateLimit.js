export function createRateLimit({ windowMs, max, message }) {
  const hits = new Map();

  return (request, response, next) => {
    const forwarded = request.headers["x-forwarded-for"];
    const key = Array.isArray(forwarded)
      ? forwarded[0]
      : typeof forwarded === "string" && forwarded.length > 0
        ? forwarded.split(",")[0].trim()
        : request.ip || "local";

    const now = Date.now();
    const windowStart = now - windowMs;
    const existing = hits.get(key) ?? [];
    const recent = existing.filter((timestamp) => timestamp > windowStart);

    if (recent.length >= max) {
      response.status(429).json({ message });
      return;
    }

    recent.push(now);
    hits.set(key, recent);
    next();
  };
}
