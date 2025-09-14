// src/routes/categories.ts
import express from "express";
import { prisma } from "../server";
import { authMiddleware } from "../middleware/auth";

const router = express.Router();

// Get all categories for authenticated user
router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user!.userId;

    const categories = await prisma.category.findMany({
      where: { userId },
      include: {
        subCategories: {
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: { knowledgeItems: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(categories);
  } catch (error) {
    console.error("Get categories error:", error);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// Create new category
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { name, description } = req.body;
    console.log(req.user);
    const userId = req.user!.id;
    console.log(userId);

    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Category name is required" });
    }

    // Check if category with same name already exists for user
    const existingCategory = await prisma.category.findFirst({
      where: {
        userId,
        name: name.trim(),
      },
    });

    if (existingCategory) {
      return res
        .status(400)
        .json({ error: "Category with this name already exists" });
    }

    const category = await prisma.category.create({
      data: {
        name: name.trim(),
        description: description?.trim(),
        userId,
      },
      include: {
        subCategories: true,
        _count: {
          select: { knowledgeItems: true },
        },
      },
    });

    res.status(201).json(category);
  } catch (error) {
    console.error("Create category error:", error);
    res.status(500).json({ error: "Failed to create category" });
  }
});

// Update category
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    const userId = req.user!.userId;

    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Category name is required" });
    }

    // Check if category exists and belongs to user
    const existingCategory = await prisma.category.findFirst({
      where: { id, userId },
    });

    if (!existingCategory) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Check if another category with same name exists
    const duplicateCategory = await prisma.category.findFirst({
      where: {
        userId,
        name: name.trim(),
        id: { not: id },
      },
    });

    if (duplicateCategory) {
      return res
        .status(400)
        .json({ error: "Category with this name already exists" });
    }

    const category = await prisma.category.update({
      where: { id },
      data: {
        name: name.trim(),
        description: description?.trim(),
      },
      include: {
        subCategories: true,
        _count: {
          select: { knowledgeItems: true },
        },
      },
    });

    res.json(category);
  } catch (error) {
    console.error("Update category error:", error);
    res.status(500).json({ error: "Failed to update category" });
  }
});

// Delete category
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    // Check if category exists and belongs to user
    const category = await prisma.category.findFirst({
      where: { id, userId },
      include: {
        _count: {
          select: {
            knowledgeItems: true,
            subCategories: true,
          },
        },
      },
    });

    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Delete category (cascade will handle subcategories and knowledge items)
    await prisma.category.delete({
      where: { id },
    });

    res.json({
      message: "Category deleted successfully",
      deletedItems: category._count.knowledgeItems,
      deletedSubCategories: category._count.subCategories,
    });
  } catch (error) {
    console.error("Delete category error:", error);
    res.status(500).json({ error: "Failed to delete category" });
  }
});

// Get subcategories for a category
router.get("/:id/subcategories", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    // Verify category belongs to user
    const category = await prisma.category.findFirst({
      where: { id, userId },
    });

    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    const subCategories = await prisma.subCategory.findMany({
      where: { categoryId: id },
      include: {
        _count: {
          select: { knowledgeItems: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(subCategories);
  } catch (error) {
    console.error("Get subcategories error:", error);
    res.status(500).json({ error: "Failed to fetch subcategories" });
  }
});

// Create subcategory
router.post("/:id/subcategories", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    const userId = req.user!.userId;

    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Subcategory name is required" });
    }

    // Verify category belongs to user
    const category = await prisma.category.findFirst({
      where: { id, userId },
    });

    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Check if subcategory with same name already exists in this category
    const existingSubCategory = await prisma.subCategory.findFirst({
      where: {
        categoryId: id,
        name: name.trim(),
      },
    });

    if (existingSubCategory) {
      return res
        .status(400)
        .json({ error: "Subcategory with this name already exists" });
    }

    const subCategory = await prisma.subCategory.create({
      data: {
        name: name.trim(),
        description: description?.trim(),
        categoryId: id,
        userId,
      },
      include: {
        _count: {
          select: { knowledgeItems: true },
        },
      },
    });

    res.status(201).json(subCategory);
  } catch (error) {
    console.error("Create subcategory error:", error);
    res.status(500).json({ error: "Failed to create subcategory" });
  }
});

// Update subcategory
router.put("/subcategories/:subId", authMiddleware, async (req, res) => {
  try {
    const { subId } = req.params;
    const { name, description } = req.body;
    const userId = req.user!.userId;

    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Subcategory name is required" });
    }

    // Check if subcategory exists and belongs to user
    const existingSubCategory = await prisma.subCategory.findFirst({
      where: { id: subId, userId },
    });

    if (!existingSubCategory) {
      return res.status(404).json({ error: "Subcategory not found" });
    }

    // Check for duplicate names in the same category
    const duplicateSubCategory = await prisma.subCategory.findFirst({
      where: {
        categoryId: existingSubCategory.categoryId,
        name: name.trim(),
        id: { not: subId },
      },
    });

    if (duplicateSubCategory) {
      return res
        .status(400)
        .json({ error: "Subcategory with this name already exists" });
    }

    const subCategory = await prisma.subCategory.update({
      where: { id: subId },
      data: {
        name: name.trim(),
        description: description?.trim(),
      },
      include: {
        _count: {
          select: { knowledgeItems: true },
        },
      },
    });

    res.json(subCategory);
  } catch (error) {
    console.error("Update subcategory error:", error);
    res.status(500).json({ error: "Failed to update subcategory" });
  }
});

// Delete subcategory
router.delete("/subcategories/:subId", authMiddleware, async (req, res) => {
  try {
    const { subId } = req.params;
    const userId = req.user!.userId;

    // Check if subcategory exists and belongs to user
    const subCategory = await prisma.subCategory.findFirst({
      where: { id: subId, userId },
      include: {
        _count: {
          select: { knowledgeItems: true },
        },
      },
    });

    if (!subCategory) {
      return res.status(404).json({ error: "Subcategory not found" });
    }

    await prisma.subCategory.delete({
      where: { id: subId },
    });

    res.json({
      message: "Subcategory deleted successfully",
      deletedItems: subCategory._count.knowledgeItems,
    });
  } catch (error) {
    console.error("Delete subcategory error:", error);
    res.status(500).json({ error: "Failed to delete subcategory" });
  }
});

export default router;
