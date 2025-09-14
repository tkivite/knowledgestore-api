// src/routes/users.ts
import express from "express";
import { prisma } from "../server";
import { authMiddleware } from "../middleware/auth";

const router = express.Router();

// Get current user profile
router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const userId = req.user!.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        createdAt: true,
        _count: {
          select: {
            categories: true,
            knowledgeItems: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Get user profile error:", error);
    res.status(500).json({ error: "Failed to fetch user profile" });
  }
});

// Update user profile
router.put("/profile", authMiddleware, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const { name, avatar } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Name is required" });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        name: name.trim(),
        avatar: avatar || null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        createdAt: true,
      },
    });

    res.json(user);
  } catch (error) {
    console.error("Update user profile error:", error);
    res.status(500).json({ error: "Failed to update user profile" });
  }
});

// Search users by email (for sharing functionality)
router.get("/search", authMiddleware, async (req, res) => {
  try {
    const { email } = req.query;
    const currentUserId = req.user!.userId;

    if (!email || typeof email !== "string") {
      return res
        .status(400)
        .json({ error: "Email query parameter is required" });
    }

    const users = await prisma.user.findMany({
      where: {
        email: {
          contains: email,
          mode: "insensitive",
        },
        id: { not: currentUserId }, // Exclude current user
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
      },
      take: 10, // Limit to 10 results
    });

    res.json(users);
  } catch (error) {
    console.error("Search users error:", error);
    res.status(500).json({ error: "Failed to search users" });
  }
});

// Get user statistics
router.get("/stats", authMiddleware, async (req, res) => {
  try {
    const userId = req.user!.userId;

    const [
      totalCategories,
      totalSubCategories,
      totalKnowledgeItems,
      publicItems,
      sharedItems,
      itemsByType,
    ] = await Promise.all([
      prisma.category.count({ where: { userId } }),
      prisma.subCategory.count({ where: { userId } }),
      prisma.knowledgeItem.count({ where: { userId } }),
      prisma.knowledgeItem.count({ where: { userId, isPublic: true } }),
      prisma.sharedItem.count({ where: { userId } }),
      prisma.knowledgeItem.groupBy({
        by: ["type"],
        where: { userId },
        _count: { type: true },
      }),
    ]);

    const typeStats = itemsByType.reduce((acc, item) => {
      acc[item.type.toLowerCase()] = item._count.type;
      return acc;
    }, {} as Record<string, number>);

    res.json({
      categories: totalCategories,
      subCategories: totalSubCategories,
      knowledgeItems: totalKnowledgeItems,
      publicItems,
      sharedItemsReceived: sharedItems,
      itemsByType: {
        text: typeStats.text || 0,
        image: typeStats.image || 0,
        audio: typeStats.audio || 0,
      },
    });
  } catch (error) {
    console.error("Get user stats error:", error);
    res.status(500).json({ error: "Failed to fetch user statistics" });
  }
});

// Get user's recent activity
router.get("/activity", authMiddleware, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const { limit = "10" } = req.query;

    const recentItems = await prisma.knowledgeItem.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        type: true,
        updatedAt: true,
        category: {
          select: { name: true },
        },
        subCategory: {
          select: { name: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: parseInt(limit as string),
    });

    res.json(recentItems);
  } catch (error) {
    console.error("Get user activity error:", error);
    res.status(500).json({ error: "Failed to fetch user activity" });
  }
});

// Delete user account (with all associated data)
router.delete("/account", authMiddleware, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const { confirmation } = req.body;

    if (confirmation !== "DELETE_MY_ACCOUNT") {
      return res.status(400).json({
        error: 'Please provide confirmation string "DELETE_MY_ACCOUNT"',
      });
    }

    // Delete user (cascade will handle all related data)
    await prisma.user.delete({
      where: { id: userId },
    });

    res.json({ message: "Account deleted successfully" });
  } catch (error) {
    console.error("Delete user account error:", error);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

export default router;
