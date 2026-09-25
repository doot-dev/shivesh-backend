import db from "../config/database.js";
import logger from "./logger.js";

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
    // Still best-effort, but loud: a lost audit row must show in the logs (W33).
    logger.error(`Activity log NOT saved (${title}): ${error.message}`);
  }
};
