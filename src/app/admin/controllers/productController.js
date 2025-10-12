import { validatorFunction } from "../../../helper/validate.js";
import { createProductValidation, createSizeValidation, deleteProductValidation, deleteSizeValidation, getProductByIdValidation, getSizeByIdValidation, updateProductValidation, updateSizeValidation } from "../validations/productValidation.js";
import db from "../../../config/database.js";
import logger from "../../../helper/logger.js";
/**
 * Creates a new product in the database.
 * Validates input and creates a new product record.
 *
 * @function createProduct
 * @async
 * @param {Request} req - Express request object containing product name in body
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {Object|null}: Created product data on success, null on failure
 */
export async function createProduct(req, res) {
    try {

        const { err, status: validationStatus } = await validatorFunction(req.body, createProductValidation);

        if (!validationStatus) {
            return res.status(422).json({ message: "Validation Error", data: err, success: false });
        }

        const { name } = req.body;
        const data = await db.product.create({
            data: {
                name,
            },
            include: {
                size: true
            }
        });

        return res.status(201).json({
            success: true, message: "Product created successfully", data: {
                id: data.id, name: data.name, createdAt: data.createdAt, size: data.size
            }
        });

    } catch (error) {
        logger.error('Error creating product:', error);
        return res.status(500).json({ success: false, message: error.message, data: null });
    }
}

/**
 * Updates an existing product in the system.
 * Validates input and updates product record.
 *
 * @function updateProduct
 * @async
 * @param {Request} req - Express request object containing product data in body
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {Object|null}: Updated product data on success, null on failure
 */
export async function updateProduct(req, res) {
    try {

        const { err, status: validationStatus } = await validatorFunction(req.body, updateProductValidation);
        if (!validationStatus) {
            return res.status(422).json({ message: "Validation Error", data: err, success: false });
        }

        const { id, name, isActive } = req.body;

        const existingProduct = await db.product.findUnique({
            where: { id: parseInt(id), isDeleted: false }
        });
        if (!existingProduct) {
            return res.status(404).json({ success: false, message: "Product not found", data: null });
        }

        const updatedProduct = await db.product.update({
            where: { id: parseInt(id) },
            data: { name, isActive }
        });

        return res.status(200).json({ success: true, message: "Product updated successfully", data: updatedProduct });

    } catch (error) {
        logger.error('Error updating product:', error);
        return res.status(500).json({ success: false, message: error.message, data: null });
    }
}



/**
 * Retrieves all products from the system.
 * Supports pagination.
 *
 * @function GetAllProducts
 * @async
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {Array|null}: Array of products on success, null on failure
 *   - meta {Object}: Pagination info
 */
/**
 * Retrieves a product by ID.
 * Validates input and fetches product record.
 *
 * @function GetProductById
 * @async
 * @param {Request} req - Express request object containing product ID in params
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {Object|null}: Product data on success, null on failure
 */
export async function GetAllProducts(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const length = parseInt(req.query.length) || 10;
        const skip = (page - 1) * length;
        const search = req.query.search || '';

        const whereClause = {
            isDeleted: false,
            ...(search && {
                name: {
                    contains: search,
                }
            })
        };
        let products = await db.product.findMany({
            where: whereClause,
            skip: skip,
            take: length,
            include: {
                _count: {
                    select: {
                        size: true
                    }
                }
            }
        });

        products = await Promise.all(products.map(product => {
            product.sizeCount = product._count.size;
            delete product._count;
            return product;
        }));

        logger.info(`Retrieved ${products.length} products from the database.`);
        const productCount = await db.product.count({ where: { isDeleted: false } });
        const totalPages = Math.ceil(productCount / length);
        return res.status(200).json({
            success: true, message: "Products fetched successfully",
            data: products,
            meta: {
                count: productCount,
                totalPages: totalPages,
                currentPage: page,
                limit: length
            }
        });
    } catch (error) {
        logger.error('Error retrieving products:', error);
        return res.status(500).json({ success: false, message: error.message, data: null });
    }
}

/**
 * Retrieves a product by ID.
 * Validates input and fetches product record with sizes.
 *
 * @function GetProductById
 * @async
 * @param {Request} req - Express request object containing product ID in params
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {Object|null}: Product data on success, null on failure
 */
export async function GetProductById(req, res) {
    try {

        const { err, status: validationStatus } = await validatorFunction(req.params, getProductByIdValidation);
        if (!validationStatus) {
            return res.status(422).json({ message: "Validation Error", data: err, success: false });
        }

        const { id } = req.params;

        const product = await db.product.findUnique({
            where: { id: parseInt(id), isDeleted: false },
            include: {
                size: true
            }
        });

        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found", data: null });
        }

        return res.status(200).json({ success: true, data: product, message: "Product fetched successfully" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message, data: null });
    }
}


/**
 * Deletes a product from the system (soft delete).
 *
 * @function deleteProduct
 * @async
 * @param {Request} req - Express request object containing product ID in params
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {null}: Always null
 */
export async function deleteProduct(req, res) {
    try {

        const { err, status: validationStatus } = await validatorFunction(req.params, deleteProductValidation);
        if (!validationStatus) {
            return res.status(422).json({ message: "Validation Error", data: err, success: false });
        }

        const { id } = req.params;

        const existingProduct = await db.product.findUnique({
            where: { id: parseInt(id) }
        });
        if (!existingProduct) {
            return res.status(404).json({ success: false, message: "Product not found", data: null });
        }

        await db.product.update({
            where: { id: parseInt(id) },
            data: { isDeleted: true }
        });
        return res.status(200).json({ success: true, message: "Product deleted successfully", data: null });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message, data: null });
    }
}


/**
 * Permanently deletes a product from the database (hard delete).
 *
 * @function deleteProductFromTable
 * @async
 * @param {Request} req - Express request object containing product ID in params
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {null}: Always null
 */
export async function deleteProductFromTable(req, res) {
    try {
        const { err, status: validationStatus } = await validatorFunction(req.params, deleteProductValidation);
        if (!validationStatus) {
            return res.status(422).json({ message: "Validation Error", data: err, success: false });
        }

        const { id } = req.params;

        const existingProduct = await db.product.findUnique({
            where: { id: parseInt(id) }
        });

        if (!existingProduct) {
            return res.status(404).json({ success: false, message: "Product not found", data: null });
        }

        await db.product.delete({
            where: { id: parseInt(id) },
        });

        return res.status(200).json({ success: true, message: "Product deleted successfully", data: null });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message, data: null });
    }
}


/**
 * Creates a new size in the database.
 * Validates input and creates a new size record.
 *
 * @function createSize
 * @async
 * @param {Request} req - Express request object containing size name and product ID in body
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {Object|null}: Created size data on success, null on failure
 */
export async function createSize(req, res) {
    try {
        const { err, status: validationStatus } = await validatorFunction(req.body, createSizeValidation);
        if (!validationStatus) {
            return res.status(422).json({ message: "Validation Error", data: err, success: false });
        }

        const { name, productId } = req.body;

        const newSize = await db.size.create({
            data: {
                name: name,
                productId: parseInt(productId),
                subcategory: req.body?.subcategory || ""

            }
        });

        return res.status(201).json({ success: true, message: "Size created successfully", data: newSize });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message, data: null });
    }
}




/**
 * Retrieves all sizes associated with a given product ID.
 * Validates input and fetches size records.
 *
 * @function getSizesByProductId
 * @async
 * @param {Request} req - Express request object containing product ID in params
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {Array|null}: Array of sizes on success, null on failure
 */
export async function getSizesByProductId(req, res) {
    try {
        const { err, status: validationStatus } = await validatorFunction(req.params, getSizeByIdValidation);
        if (!validationStatus) {
            return res.status(422).json({ message: "Validation Error", data: err, success: false });
        }
        const sizes = await db.size.findMany({
            where: { productId: parseInt(req.params.productId) }
        });
        return res.status(200).json({ success: true, message: "Sizes fetched successfully", data: sizes });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message, data: null });
    }
}

/**
 * Updates an existing size in the system.
 * Validates input and updates size record.
 *
 * @function updateSize
 * @async
 * @param {Request} req - Express request object containing size data in body
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {Object|null}: Updated size data on success, null on failure
 */
export async function updateSize(req, res) {
    try {
        const { err, status: validationStatus } = await validatorFunction(req.body, updateSizeValidation);
        if (!validationStatus) {
            return res.status(422).json({ message: "Validation Error", data: err, success: false });
        }

        const { id, name, productId, isActive } = req.body;

        const existingSize = await db.size.findUnique({
            where: { id: parseInt(id) }
        });
        if (!existingSize) {
            return res.status(404).json({ success: false, message: "Size not found", data: null });
        }

        const updatedSize = await db.size.update({
            where: { id: parseInt(id) },
            data: {
                name,
                productId: parseInt(productId),
                isActive: isActive,
                subcategory: req.body?.subcategory || existingSize.subcategory
            }
        });
        return res.status(200).json({ success: true, message: "Size updated successfully", data: updatedSize });
    } catch (error) {
        logger.error('Error updating size:', error);
        return res.status(500).json({ success: false, message: error.message, data: null });
    }

}


/**
 * Deletes a size from the system.
 * Validates input and deletes size record.
 *
 * @function deleteSize
 * @async
 * @param {Request} req - Express request object containing size ID in params
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {null}: Always null
 */
export async function deleteSize(req, res) {
    try {
        const { err, status: validationStatus } = await validatorFunction(req.params, deleteSizeValidation);
        if (!validationStatus) {
            return res.status(422).json({ message: "Validation Error", data: err, success: false });
        }

        const { id } = req.params;
        const existingSize = await db.size.findUnique({
            where: { id: parseInt(id) }
        });
        if (!existingSize) {
            return res.status(404).json({ success: false, message: "Size not found", data: null });
        }

        await db.size.delete({
            where: { id: parseInt(id) }
        });
        return res.status(200).json({ success: true, message: "Size deleted successfully", data: null });
    } catch (error) {
        logger.error('Error deleting size:', error);
        return res.status(500).json({ success: false, message: error.message, data: null });
    }
}