// src/controllers/authController.ts
import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthUtils } from "../utils/auth.js";
import { EmailService } from "../services/emailServices";
import { z } from "zod";

const prisma = new PrismaClient();
const emailService = new EmailService();

// Validation schemas
const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required"),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export class AuthController {
  // Sign up with email/password
  static async signup(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, name } = signupSchema.parse(req.body);

      // Check password strength
      const passwordCheck = AuthUtils.isPasswordStrong(password);
      if (!passwordCheck.valid) {
        res.status(400).json({ error: passwordCheck.message });
        return;
      }

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        res.status(409).json({ error: "User already exists with this email" });
        return;
      }

      // Hash password and generate verification token
      const hashedPassword = await AuthUtils.hashPassword(password);
      const verificationToken = AuthUtils.generateVerificationToken();
      const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Create user
      const user = await prisma.user.create({
        data: {
          email,
          name,
          password: hashedPassword,
          verificationToken,
          verificationExpires,
        },
        select: {
          id: true,
          email: true,
          name: true,
          isVerified: true,
          createdAt: true,
        },
      });

      // Send verification email
      try {
        await emailService.sendVerificationEmail(
          email,
          name,
          verificationToken
        );
      } catch (emailError) {
        console.error("Failed to send verification email:", emailError);
        // Don't fail the signup if email fails
      }

      res.status(201).json({
        message:
          "Account created successfully. Please check your email to verify your account.",
        user,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors[0].message });
        return;
      }
      console.error("Signup error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  // Login with email/password
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = loginSchema.parse(req.body);

      // Find user
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user || !user.password) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      // Check password
      const isValidPassword = await AuthUtils.comparePassword(
        password,
        user.password
      );
      if (!isValidPassword) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      // Check if email is verified
      if (!user.isVerified) {
        res.status(401).json({
          error: "Please verify your email address before logging in",
          code: "EMAIL_NOT_VERIFIED",
        });
        return;
      }

      // Generate tokens
      const accessToken = AuthUtils.generateAccessToken(user.id);
      const refreshToken = AuthUtils.generateRefreshToken(user.id);

      // Store refresh token
      const refreshTokenExpires = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      ); // 7 days
      await prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.id,
          expiresAt: refreshTokenExpires,
        },
      });

      res.json({
        message: "Login successful",
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          isVerified: user.isVerified,
        },
        tokens: {
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors[0].message });
        return;
      }
      console.error("Login error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  // Verify email
  static async verifyEmail(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.params;

      const user = await prisma.user.findFirst({
        where: {
          verificationToken: token,
          verificationExpires: {
            gt: new Date(),
          },
        },
      });

      if (!user) {
        res
          .status(400)
          .json({ error: "Invalid or expired verification token" });
        return;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          isVerified: true,
          verificationToken: null,
          verificationExpires: null,
        },
      });

      res.json({ message: "Email verified successfully" });
    } catch (error) {
      console.error("Email verification error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  // Resend verification email
  static async resendVerification(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;

      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      if (user.isVerified) {
        res.status(400).json({ error: "Email is already verified" });
        return;
      }

      // Generate new verification token
      const verificationToken = AuthUtils.generateVerificationToken();
      const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          verificationToken,
          verificationExpires,
        },
      });

      await emailService.sendVerificationEmail(
        email,
        user.name || "User",
        verificationToken
      );

      res.json({ message: "Verification email sent successfully" });
    } catch (error) {
      console.error("Resend verification error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  // Forgot password
  static async forgotPassword(req: Request, res: Response): Promise<void> {
    try {
      const { email } = forgotPasswordSchema.parse(req.body);

      const user = await prisma.user.findUnique({
        where: { email },
      });

      // Always return success to prevent email enumeration
      if (!user) {
        res.json({
          message:
            "If an account with that email exists, we have sent a password reset link.",
        });
        return;
      }

      // Generate reset token
      const resetToken = AuthUtils.generateResetToken();
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetPasswordToken: resetToken,
          resetPasswordExpires: resetExpires,
        },
      });

      await emailService.sendPasswordResetEmail(
        email,
        user.name || "User",
        resetToken
      );

      res.json({
        message:
          "If an account with that email exists, we have sent a password reset link.",
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors[0].message });
        return;
      }
      console.error("Forgot password error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  // Reset password
  static async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const { token, password } = resetPasswordSchema.parse(req.body);

      // Check password strength
      const passwordCheck = AuthUtils.isPasswordStrong(password);
      if (!passwordCheck.valid) {
        res.status(400).json({ error: passwordCheck.message });
        return;
      }

      const user = await prisma.user.findFirst({
        where: {
          resetPasswordToken: token,
          resetPasswordExpires: {
            gt: new Date(),
          },
        },
      });

      if (!user) {
        res.status(400).json({ error: "Invalid or expired reset token" });
        return;
      }

      // Hash new password
      const hashedPassword = await AuthUtils.hashPassword(password);

      // Update password and clear reset token
      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          resetPasswordToken: null,
          resetPasswordExpires: null,
        },
      });

      // Invalidate all refresh tokens for security
      await prisma.refreshToken.deleteMany({
        where: { userId: user.id },
      });

      // Send notification email
      try {
        await emailService.sendPasswordChangeNotification(
          user.email,
          user.name || "User"
        );
      } catch (emailError) {
        console.error(
          "Failed to send password change notification:",
          emailError
        );
      }

      res.json({ message: "Password reset successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors[0].message });
        return;
      }
      console.error("Reset password error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  // Refresh token
  static async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(401).json({ error: "Refresh token is required" });
        return;
      }

      // Verify refresh token
      const decoded = AuthUtils.verifyRefreshToken(refreshToken);

      // Check if token exists in database
      const storedToken = await prisma.refreshToken.findFirst({
        where: {
          token: refreshToken,
          userId: decoded.userId,
          expiresAt: {
            gt: new Date(),
          },
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              isVerified: true,
            },
          },
        },
      });

      if (!storedToken) {
        res.status(401).json({ error: "Invalid or expired refresh token" });
        return;
      }

      // Generate new access token
      const newAccessToken = AuthUtils.generateAccessToken(decoded.userId);

      res.json({
        accessToken: newAccessToken,
        user: storedToken.user,
      });
    } catch (error) {
      console.error("Refresh token error:", error);
      res.status(401).json({ error: "Invalid or expired refresh token" });
    }
  }

  // Logout
  static async logout(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (refreshToken) {
        await prisma.refreshToken.deleteMany({
          where: { token: refreshToken },
        });
      }

      res.json({ message: "Logged out successfully" });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  // Logout from all devices
  static async logoutAll(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId;

      await prisma.refreshToken.deleteMany({
        where: { userId },
      });

      res.json({ message: "Logged out from all devices successfully" });
    } catch (error) {
      console.error("Logout all error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  // Google OAuth authentication
  static async googleAuth(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.body;

      if (!token) {
        res.status(400).json({ error: "Google token is required" });
        return;
      }

      // Verify Google token
      const { google } = require("googleapis");
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );

      let googleUser;
      try {
        // If it's an ID token, verify it
        const ticket = await oauth2Client.verifyIdToken({
          idToken: token,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        googleUser = ticket.getPayload();
      } catch (idTokenError) {
        // If ID token verification fails, try as access token
        try {
          oauth2Client.setCredentials({ access_token: token });
          const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
          const { data } = await oauth2.userinfo.get();
          googleUser = data;
        } catch (accessTokenError) {
          res.status(401).json({ error: "Invalid Google token" });
          return;
        }
      }

      if (!googleUser || !googleUser.email) {
        res
          .status(401)
          .json({ error: "Unable to get user info from Google token" });
        return;
      }

      // Check if user exists
      let user = await prisma.user.findUnique({
        where: { email: googleUser.email },
      });

      if (user) {
        // Update Google ID if not set
        if (!user.googleId && googleUser.sub) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              googleId: googleUser.sub,
              isVerified: true, // Google accounts are pre-verified
              picture: googleUser.picture,
            },
          });
        }
      } else {
        // Create new user from Google account
        user = await prisma.user.create({
          data: {
            email: googleUser.email,
            name: googleUser.name || googleUser.given_name || "User",
            googleId: googleUser.sub,
            picture: googleUser.picture,
            isVerified: true, // Google accounts are pre-verified
          },
        });
      }

      // Generate tokens
      const accessToken = AuthUtils.generateAccessToken(user.id);
      const refreshToken = AuthUtils.generateRefreshToken(user.id);

      // Store refresh token
      const refreshTokenExpires = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      ); // 7 days
      await prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.id,
          expiresAt: refreshTokenExpires,
        },
      });

      res.json({
        message: "Google authentication successful",
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture,
          isVerified: user.isVerified,
        },
        tokens: {
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      console.error("Google auth error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
}
