import db from "../config/database.js";

export const createActivityLog = async ({
  title,
  description,
  entityType,
  entityId,
  action,
  createdById,
}) => {
  try {
    await db.activity.create({
      data: {
        title,
        description,
        entityType,
        entityId,
        action,
        createdById,
      },
    });
  } catch (error) {
    console.error("Error creating activity log:", error);
  }
};
