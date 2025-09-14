// src/routes/knowledge.ts
import express from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { prisma } from "../server";
import { authMiddleware } from "../middleware/auth";

const router = express.Router();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype.startsWith("image/") ||
      file.mimetype.startsWith("audio/")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only image and audio files are allowed"));
    }
  },
});

// Get all knowledge items for authenticated user
router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const {
      categoryId,
      subCategoryId,
      type,
      search,
      tags,
      isPublic,
      page = "1",
      limit = "20",
    } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    // Build where clause
    const where: any = {
      OR: [
        { userId }, // User's own items
        { isPublic: true }, // Public items from other users
        {
          sharedWith: {
            some: { userId },
          },
        }, // Items shared with user
      ],
    };

    if (categoryId) where.categoryId = categoryId;
    if (subCategoryId) where.subCategoryId = subCategoryId;
    if (type) where.type = type.toString().toUpperCase();
    if (isPublic !== undefined) where.isPublic = isPublic === "true";

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { content: { contains: search, mode: "insensitive" } },
        { tags: { has: search } },
      ];
    }

    if (tags) {
      const tagArray = (tags as string).split(",").map((tag) => tag.trim());
      where.tags = { hasSome: tagArray };
    }

    const [items, total] = await Promise.all([
      prisma.knowledgeItem.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, email: true, avatar: true },
          },
          category: {
            select: { id: true, name: true },
          },
          subCategory: {
            select: { id: true, name: true },
          },
          sharedWith: {
            include: {
              user: {
                select: { id: true, name: true, email: true },
              },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        skip,
        take: parseInt(limit as string),
      }),
      prisma.knowledgeItem.count({ where }),
    ]);

    res.json({
      items,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    console.error("Get knowledge items error:", error);
    res.status(500).json({ error: "Failed to fetch knowledge items" });
  }
});

// Get single knowledge item
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const item = await prisma.knowledgeItem.findFirst({
      where: {
        id,
        OR: [
          { userId },
          { isPublic: true },
          {
            sharedWith: {
              some: { userId },
            },
          },
        ],
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        category: {
          select: { id: true, name: true },
        },
        subCategory: {
          select: { id: true, name: true },
        },
        sharedWith: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    if (!item) {
      return res.status(404).json({ error: "Knowledge item not found" });
    }

    res.json(item);
  } catch (error) {
    console.error("Get knowledge item error:", error);
    res.status(500).json({ error: "Failed to fetch knowledge item" });
  }
});

// Create knowledge item
router.post("/", authMiddleware, upload.single("file"), async (req, res) => {
  try {
    const userId = req.user!.userId;
    let { title, content, type, tags, categoryId, subCategoryId, isPublic } =
      req.body;

    if (!title || title.trim() === "") {
      return res.status(400).json({ error: "Title is required" });
    }

    // Handle file upload for image/audio
    if (req.file && (type === "IMAGE" || type === "AUDIO")) {
      try {
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader
            .upload_stream(
              {
                resource_type: type === "IMAGE" ? "image" : "video", // Cloudinary treats audio as video
                folder: `knowledge-base/${type.toLowerCase()}s`,
                public_id: `${userId}_${Date.now()}`,
              },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            )
            .end(req.file!.buffer);
        });

        content = (result as any).secure_url;
      } catch (uploadError) {
        console.error("File upload error:", uploadError);
        return res.status(500).json({ error: "Failed to upload file" });
      }
    }

    if (!content || content.trim() === "") {
      return res.status(400).json({ error: "Content is required" });
    }

    // Parse tags
    const parsedTags = tags
      ? tags
          .split(",")
          .map((tag: string) => tag.trim())
          .filter(Boolean)
      : [];

    // Validate category and subcategory belong to user
    if (categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: categoryId, userId },
      });
      if (!category) {
        return res.status(400).json({ error: "Invalid category" });
      }
    }

    if (subCategoryId) {
      const subCategory = await prisma.subCategory.findFirst({
        where: { id: subCategoryId, userId },
      });
      if (!subCategory) {
        return res.status(400).json({ error: "Invalid subcategory" });
      }
    }

    const item = await prisma.knowledgeItem.create({
      data: {
        title: title.trim(),
        content: content.trim(),
        type: type?.toUpperCase() || "TEXT",
        tags: parsedTags,
        categoryId: categoryId || null,
        subCategoryId: subCategoryId || null,
        isPublic: isPublic === "true",
        userId,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        category: {
          select: { id: true, name: true },
        },
        subCategory: {
          select: { id: true, name: true },
        },
      },
    });

    res.status(201).json(item);
  } catch (error) {
    console.error("Create knowledge item error:", error);
    res.status(500).json({ error: "Failed to create knowledge item" });
  }
});

// Update knowledge item
router.put("/:id", authMiddleware, upload.single("file"), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    let { title, content, type, tags, categoryId, subCategoryId, isPublic } =
      req.body;

    // Check if item exists and belongs to user
    const existingItem = await prisma.knowledgeItem.findFirst({
      where: { id, userId },
    });

    if (!existingItem) {
      return res.status(404).json({ error: "Knowledge item not found" });
    }

    if (!title || title.trim() === "") {
      return res.status(400).json({ error: "Title is required" });
    }

    // Handle file upload if provided
    if (req.file && (type === "IMAGE" || type === "AUDIO")) {
      try {
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader
            .upload_stream(
              {
                resource_type: type === "IMAGE" ? "image" : "video",
                folder: `knowledge-base/${type.toLowerCase()}s`,
                public_id: `${userId}_${Date.now()}`,
              },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            )
            .end(req.file!.buffer);
        });

        content = (result as any).secure_url;
      } catch (uploadError) {
        console.error("File upload error:", uploadError);
        return res.status(500).json({ error: "Failed to upload file" });
      }
    }

    if (!content || content.trim() === "") {
      return res.status(400).json({ error: "Content is required" });
    }

    // Parse tags
    const parsedTags = tags
      ? tags
          .split(",")
          .map((tag: string) => tag.trim())
          .filter(Boolean)
      : [];

    // Validate category and subcategory
    if (categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: categoryId, userId },
      });
      if (!category) {
        return res.status(400).json({ error: "Invalid category" });
      }
    }

    if (subCategoryId) {
      const subCategory = await prisma.subCategory.findFirst({
        where: { id: subCategoryId, userId },
      });
      if (!subCategory) {
        return res.status(400).json({ error: "Invalid subcategory" });
      }
    }

    const item = await prisma.knowledgeItem.update({
      where: { id },
      data: {
        title: title.trim(),
        content: content.trim(),
        type: type?.toUpperCase() || existingItem.type,
        tags: parsedTags,
        categoryId: categoryId || null,
        subCategoryId: subCategoryId || null,
        isPublic: isPublic === "true",
        updatedAt: new Date(),
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        category: {
          select: { id: true, name: true },
        },
        subCategory: {
          select: { id: true, name: true },
        },
        sharedWith: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    res.json(item);
  } catch (error) {
    console.error("Update knowledge item error:", error);
    res.status(500).json({ error: "Failed to update knowledge item" });
  }
});

// Delete knowledge item
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const item = await prisma.knowledgeItem.findFirst({
      where: { id, userId },
    });

    if (!item) {
      return res.status(404).json({ error: "Knowledge item not found" });
    }

    // Delete file from Cloudinary if it exists
    if (
      (item.type === "IMAGE" || item.type === "AUDIO") &&
      item.content.includes("cloudinary")
    ) {
      try {
        const publicId = item.content.split("/").pop()?.split(".")[0];
        if (publicId) {
          await cloudinary.uploader.destroy(
            `knowledge-base/${item.type.toLowerCase()}s/${publicId}`
          );
        }
      } catch (deleteError) {
        console.error("Error deleting file from Cloudinary:", deleteError);
        // Continue with deletion even if file deletion fails
      }
    }

    await prisma.knowledgeItem.delete({
      where: { id },
    });

    res.json({ message: "Knowledge item deleted successfully" });
  } catch (error) {
    console.error("Delete knowledge item error:", error);
    res.status(500).json({ error: "Failed to delete knowledge item" });
  }
});

// Share knowledge item with users
router.post("/:id/share", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const { userEmails, permission = "VIEW" } = req.body;

    if (!userEmails || !Array.isArray(userEmails) || userEmails.length === 0) {
      return res.status(400).json({ error: "User emails are required" });
    }

    // Check if item exists and belongs to user
    const item = await prisma.knowledgeItem.findFirst({
      where: { id, userId },
    });

    if (!item) {
      return res.status(404).json({ error: "Knowledge item not found" });
    }

    // Find users by email
    const users = await prisma.user.findMany({
      where: {
        email: { in: userEmails },
        id: { not: userId }, // Don't share with self
      },
    });

    if (users.length === 0) {
      return res
        .status(400)
        .json({ error: "No valid users found with provided emails" });
    }

    // Create or update shared items
    const sharedItems = await Promise.all(
      users.map((user) =>
        prisma.sharedItem.upsert({
          where: {
            knowledgeItemId_userId: {
              knowledgeItemId: id,
              userId: user.id,
            },
          },
          update: { permission },
          create: {
            knowledgeItemId: id,
            userId: user.id,
            permissions: permission,
          },
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        })
      )
    );

    res.json({
      message: "Knowledge item shared successfully",
      sharedWith: sharedItems,
    });
  } catch (error) {
    console.error("Share knowledge item error:", error);
    res.status(500).json({ error: "Failed to share knowledge item" });
  }
});

// Remove sharing from knowledge item
router.delete("/:id/share/:shareUserId", authMiddleware, async (req, res) => {
  try {
    const { id, shareUserId } = req.params;
    const userId = req.user!.userId;

    // Check if item exists and belongs to user
    const item = await prisma.knowledgeItem.findFirst({
      where: { id, userId },
    });

    if (!item) {
      return res.status(404).json({ error: "Knowledge item not found" });
    }

    await prisma.sharedItem.delete({
      where: {
        knowledgeItemId_userId: {
          knowledgeItemId: id,
          userId: shareUserId,
        },
      },
    });

    res.json({ message: "Sharing removed successfully" });
  } catch (error) {
    console.error("Remove sharing error:", error);
    res.status(500).json({ error: "Failed to remove sharing" });
  }
});

// Get shared knowledge items (items shared with current user)
router.get("/shared/with-me", authMiddleware, async (req, res) => {
  try {
    const userId = req.user!.userId;

    const sharedItems = await prisma.sharedItem.findMany({
      where: { userId },
      include: {
        knowledgeItem: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatar: true },
            },
            category: {
              select: { id: true, name: true },
            },
            subCategory: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(
      sharedItems.map((item) => ({
        ...item.knowledgeItem,
        sharedPermission: item.permissions,
      }))
    );
  } catch (error) {
    console.error("Get shared items error:", error);
    res.status(500).json({ error: "Failed to fetch shared items" });
  }
});

// Get public knowledge items
router.get("/public/all", async (req, res) => {
  try {
    const { page = "1", limit = "20", search, tags } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = { isPublic: true };

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { content: { contains: search, mode: "insensitive" } },
      ];
    }

    if (tags) {
      const tagArray = (tags as string).split(",").map((tag) => tag.trim());
      where.tags = { hasSome: tagArray };
    }

    const [items, total] = await Promise.all([
      prisma.knowledgeItem.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, avatar: true },
          },
          category: {
            select: { id: true, name: true },
          },
          subCategory: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit as string),
      }),
      prisma.knowledgeItem.count({ where }),
    ]);

    res.json({
      items,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    console.error("Get public items error:", error);
    res.status(500).json({ error: "Failed to fetch public items" });
  }
});

export default router;
