// src/utils/auth.ts
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

export class AuthUtils {
  static async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  static async comparePassword(
    password: string,
    hashedPassword: string
  ): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  static generateAccessToken(userId: string): string {
    return jwt.sign({ userId, type: "access" }, process.env.JWT_SECRET!, {
      expiresIn: process.env.JWT_ACCESS_EXPIRES || "15m",
    });
  }

  static generateRefreshToken(userId: string): string {
    return jwt.sign({ userId, type: "refresh" }, process.env.JWT_SECRET!, {
      expiresIn: process.env.JWT_REFRESH_EXPIRES || "7d",
    });
  }
  ß;
  static verifyAccessToken(token: string): { userId: string } {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      if (decoded.type !== "access") {
        throw new Error("Invalid token type");
      }
      return { userId: decoded.userId };
    } catch (error) {
      throw new Error("Invalid or expired token");
    }
  }

  static verifyRefreshToken(token: string): { userId: string } {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      if (decoded.type !== "refresh") {
        throw new Error("Invalid token type");
      }
      return { userId: decoded.userId };
    } catch (error) {
      throw new Error("Invalid or expired refresh token");
    }
  }

  static generateResetToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  static generateVerificationToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  static isPasswordStrong(password: string): {
    valid: boolean;
    message?: string;
  } {
    if (password.length < 8) {
      return {
        valid: false,
        message: "Password must be at least 8 characters long",
      };
    }
    if (!/(?=.*[a-z])/.test(password)) {
      return {
        valid: false,
        message: "Password must contain at least one lowercase letter",
      };
    }
    if (!/(?=.*[A-Z])/.test(password)) {
      return {
        valid: false,
        message: "Password must contain at least one uppercase letter",
      };
    }
    if (!/(?=.*\d)/.test(password)) {
      return {
        valid: false,
        message: "Password must contain at least one number",
      };
    }
    if (!/(?=.*[@$!%*?&])/.test(password)) {
      return {
        valid: false,
        message: "Password must contain at least one special character",
      };
    }
    return { valid: true };
  }
}
