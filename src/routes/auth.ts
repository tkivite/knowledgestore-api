// src/routes/auth.ts
// import express from "express";
// import jwt from "jsonwebtoken";
// import { OAuth2Client } from "google-auth-library";
// import { prisma } from "../server";

// const router = express.Router();
// const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// // Google OAuth login
// router.post("/google", async (req, res) => {
//   try {
//     const { token } = req.body;

//     if (!token) {
//       return res.status(400).json({ error: "Token is required" });
//     }

//     // Verify Google token
//     const ticket = await googleClient.verifyIdToken({
//       idToken: token,
//       audience: process.env.GOOGLE_CLIENT_ID,
//     });

//     const payload = ticket.getPayload();
//     if (!payload) {
//       return res.status(400).json({ error: "Invalid token" });
//     }

//     const { sub: googleId, email, name, picture } = payload;

//     if (!email || !name) {
//       return res.status(400).json({ error: "Email and name are required" });
//     }

//     // Find or create user
//     let user = await prisma.user.findUnique({
//       where: { email },
//     });

//     if (!user) {
//       user = await prisma.user.create({
//         data: {
//           email,
//           name,
//           avatar: picture,
//           googleId,
//         },
//       });
//     } else if (!user.googleId) {
//       // Update existing user with Google ID
//       user = await prisma.user.update({
//         where: { id: user.id },
//         data: { googleId, avatar: picture },
//       });
//     }

//     // Generate JWT
//     const jwtToken = jwt.sign(
//       { userId: user.id, email: user.email },
//       process.env.JWT_SECRET!,
//       { expiresIn: "7d" }
//     );

//     res.json({
//       user: {
//         id: user.id,
//         email: user.email,
//         name: user.name,
//         avatar: user.avatar,
//       },
//       token: jwtToken,
//     });
//   } catch (error) {
//     console.error("Google auth error:", error);
//     res.status(500).json({ error: "Authentication failed" });
//   }
// });

// // Verify JWT token
// router.get("/verify", async (req, res) => {
//   try {
//     const token = req.headers.authorization?.replace("Bearer ", "");

//     if (!token) {
//       return res.status(401).json({ error: "No token provided" });
//     }

//     const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
//       userId: string;
//     };

//     const user = await prisma.user.findUnique({
//       where: { id: decoded.userId },
//       select: { id: true, email: true, name: true, avatar: true },
//     });

//     if (!user) {
//       return res.status(401).json({ error: "User not found" });
//     }

//     res.json({ user });
//   } catch (error) {
//     res.status(401).json({ error: "Invalid token" });
//   }
// });

// // Logout (client-side token removal)
// router.post("/logout", (req, res) => {
//   res.json({ message: "Logged out successfully" });
// });

// export default router;

import { Router } from "express";
import { AuthController } from "../controllers/authController.js";
import { authMiddleware } from "../middleware/auth";

const router = Router();

// Public routes
router.post("/signup", AuthController.signup);
router.post("/login", AuthController.login);
router.post("/forgot-password", AuthController.forgotPassword);
router.post("/reset-password", AuthController.resetPassword);
router.get("/verify-email/:token", AuthController.verifyEmail);
router.post("/resend-verification", AuthController.resendVerification);
router.post("/refresh-token", AuthController.refreshToken);
router.post("/logout", AuthController.logout);

// Google OAuth (your existing route)
router.post("/google", AuthController.googleAuth);

// Protected routes
router.post("/logout-all", authMiddleware, AuthController.logoutAll);

export default router;
