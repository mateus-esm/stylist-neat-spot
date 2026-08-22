import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";

/**
 * Middleware that ensures the request has a valid Clerk session.
 * Returns 401 if no authenticated user is found.
 */
export function requireClinicAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
