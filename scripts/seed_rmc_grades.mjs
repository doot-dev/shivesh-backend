import db from "../src/config/database.js";

const gradeNames = Array.from({ length: 20 }, (_, index) => `M${(index + 1) * 5}`);

async function main() {
  let product = await db.product.findFirst({ where: { name: "RMC" } });

  if (!product) {
    product = await db.product.create({ data: { name: "RMC" } });
  } else if (product.isDeleted || !product.isActive) {
    product = await db.product.update({
      where: { id: product.id },
      data: { isDeleted: false, isActive: true },
    });
  }

  for (const name of gradeNames) {
    const existingSize = await db.size.findFirst({
      where: { productId: product.id, name },
    });

    if (!existingSize) {
      await db.size.create({
        data: { name, productId: product.id },
      });
    } else if (!existingSize.isActive) {
      await db.size.update({
        where: { id: existingSize.id },
        data: { isActive: true },
      });
    }
  }

  const seededSizes = await db.size.findMany({
    where: { productId: product.id, name: { in: gradeNames }, isActive: true },
    select: { name: true },
    orderBy: { name: "asc" },
  });

  console.log(`RMC ready with ${seededSizes.length} active grades: ${seededSizes.map((size) => size.name).join(", ")}`);
}

try {
  await main();
} finally {
  await db.$disconnect();
}