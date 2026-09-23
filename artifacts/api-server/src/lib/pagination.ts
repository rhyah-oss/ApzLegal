import type { Request, Response } from "express";
export function parsePagination(query: Record<string, unknown>) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const requested = query.limit === undefined ? 100 : Number(query.limit);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || !Number.isSafeInteger(requested) || requested < 1) return null;
  const limit = Math.min(requested, 200);
  return { page, limit, offset: (page - 1) * limit };
}
export function pagination(req: Request, res: Response) {
  const value = parsePagination(req.query);
  if (!value) { res.status(400).json({ error: "Invalid page or limit", code: "INVALID_PAGINATION" }); return null; }
  res.setHeader("X-Page", value.page);
  res.setHeader("X-Page-Limit", value.limit);
  // Arrays stay compatible; clients can explicitly page or follow this metadata.
  const send = res.json.bind(res);
  res.json = (body: unknown) => {
    if (Array.isArray(body) && body.length === value.limit && value.page < 10000) res.setHeader("X-Next-Page", value.page + 1);
    return send(body);
  };
  return value;
}
