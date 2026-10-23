import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // If response has already started sending
  if (res.headersSent) {
    return next(err);
  }

  // Zod validation error
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      details: err.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      })),
    });
    return;
  }

  // Prisma unique constraint violation
  if (err.code === "P2002") {
    const target = Array.isArray(err.meta?.target) ? err.meta.target.join(", ") : "field";
    res.status(409).json({
      error: `Conflict: Unique constraint violation on ${target}`,
    });
    return;
  }

  // Explicit status codes attached to error
  const statusCode = err.statusCode || (err.status && typeof err.status === "number" ? err.status : 500);
  const message = err.message || "Internal server error";

  if (statusCode >= 500 && process.env.NODE_ENV !== "test") {
    console.error("[Unhandled Server Error]:", err);
  }

  res.status(statusCode).json({
    error: message,
    ...(err.details ? { details: err.details } : {}),
  });
};
