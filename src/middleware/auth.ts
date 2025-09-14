// // src/middleware/auth.ts
// // import { Request, Response, NextFunction } from "express";

// import * as express from "express";

// type Request = express.Request;
// type Response = express.Response;
// type NextFunction = express.NextFunction;
// import jwt from "jsonwebtoken";

// // Extend Request interface to include user
// declare global {
//   namespace Express {
//     interface Request {
//       user?: {
//         userId: string;
//         email: string;
//       };
//     }
//   }
// }

// export const authenticateToken = (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   const authHeader = req.headers.authorization;
//   const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

//   if (!token) {
//     return res.status(401).json({ error: "Access token required" });
//   }

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
//       userId: string;
//       email: string;
//     };

//     req.user = decoded;
//     next();
//   } catch (error) {
//     return res.status(403).json({ error: "Invalid or expired token" });
//   }
// };

// src/middleware/auth.ts
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { AuthUtils } from "../utils/auth.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    console.log(authHeader);

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Access token required" });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    console.log(token);

    try {
      const decoded = AuthUtils.verifyAccessToken(token);

      // Verify user still exists and is verified
      const user = await prisma.user.findUnique({
        where: {
          id: decoded.userId,
          isVerified: true,
        },
        select: {
          id: true,
          email: true,
          name: true,
          isVerified: true,
        },
      });

      if (!user) {
        res.status(401).json({ error: "Invalid token or user not found" });
        return;
      }

      // Add user info to request object
      (req as any).userId = user.id;
      (req as any).user = user;

      next();
    } catch (tokenError) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Optional: Middleware for routes that work with or without auth
export const optionalAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);

      try {
        const decoded = AuthUtils.verifyAccessToken(token);
        const user = await prisma.user.findUnique({
          where: {
            id: decoded.userId,
            isVerified: true,
          },
          select: {
            id: true,
            email: true,
            name: true,
            isVerified: true,
          },
        });

        if (user) {
          (req as any).userId = user.id;
          (req as any).user = user;
        }
      } catch (tokenError) {
        // Token invalid, but that's okay for optional auth
      }
    }

    next();
  } catch (error) {
    console.error("Optional auth middleware error:", error);
    next(); // Continue even if there's an error
  }
};
