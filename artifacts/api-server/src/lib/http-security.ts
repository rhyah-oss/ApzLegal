import type { RequestHandler } from "express";
import { allowedOrigins } from "./cors-policy";

export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
    const storageOrigins = [...allowedOrigins({ CORS_ALLOWED_ORIGINS: process.env.CSP_STORAGE_ORIGINS })].join(" ");
    const policy = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: ${storageOrigins}; connect-src 'self' ${storageOrigins}; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`;
    // Observe real deployment origins before enforcing; frame/type protection is enforced now.
    res.setHeader(process.env.CSP_ENFORCE === "true" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", policy);
  }
  next();
};
