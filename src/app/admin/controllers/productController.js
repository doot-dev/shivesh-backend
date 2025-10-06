import { validatorFunction } from "../../../helper/validate.js";
import { createProductValidation, createSizeValidation, deleteProductValidation, deleteSizeValidation, getProductByIdValidation, getSizeByIdValidation, updateProductValidation, updateSizeValidation } from "../validations/productValidation.js";
import db from "../../../config/database.js";
export async function createProduct(req, res) {
    try {

        const { err, status: validationStatus } = await validatorFunction(req.body, createProductValidation);

        if (!validationStatus) {
            return res.status(422).json({ message: "Validation Error", errors: err });
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
        return res.status(500).json({ success: false, message: error.message, data: null });
    }
}

export async function updateProduct(req, res) {
    try {

        const { err, status: validationStatus } = await validatorFunction(req.body, updateProductValidation);
        if (!validationStatus) {
            return res.status(422).json({ message: "Validation Error", errors: err });
        }

        const { id, name  , isActive} = req.body;

        const existingProduct = await db.product.findUnique({
            where: { id: parseInt(id)  , isDeleted: false}
        });
        if (!existingProduct) {
            return res.status(404).json({ success: false, message: "Product not found", data: null });
        }

        const updatedProduct = await db.product.update({
            where: { id: parseInt(id) },
            data: { name , isActive }
        });

        return res.status(200).json({ success: true, message: "Product updated successfully", data: updatedProduct });

    } catch (error) {
        return res.status(500).json({ success: false, message: error.message, data: null });
    }
}



export async function GetAllProducts(req, res) {
    try {
        const products = await db.product.findMany({
            where: { isDeleted: false },
            include: {
                size: true
            }
        });
        return res.status(200).json({ success: true, data: products });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message, data: null });
    }
}


export async function GetProductById(req, res) {
    try {

        const { err, status: validationStatus } = await validatorFunction(req.params, getProductByIdValidation);
        if (!validationStatus) {
            return res.status(422).json({ message: "Validation Error", errors: err });
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

        return res.status(200).json({ success: true, data: product });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message, data: null });
    }
}


export async function deleteProduct(req, res) {
    try {

        const { err, status: validationStatus } = await validatorFunction(req.params, deleteProductValidation);
        if (!validationStatus) {
            return res.status(422).json({ message: "Validation Error", errors: err });
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
        return res.status(400).json({ success: false, message: error.message, data: null });
    }
}


export async function deleteProductFromTable(req, res) {
    try {
        const { err, status: validationStatus } = await validatorFunction(req.params, deleteProductValidation);
        if (!validationStatus) {
            return res.status(422).json({ message: "Validation Error", errors: err });
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
        return res.status(400).json({ success: false, message: error.message, data: null });
    }
}


export async function createSize(req, res) {
    try {
        const { err, status: validationStatus } = await validatorFunction(req.body, createSizeValidation);
        if (!validationStatus) {
            return res.status(422).json({ message: "Validation Error", errors: err });
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


export async function getSizesByProductId(req, res) {
    try {
        const { err, status: validationStatus } = await validatorFunction(req.params, getSizeByIdValidation);
        if (!validationStatus) {
            return res.status(422).json({ message: "Validation Error", errors: err });
        }
        const sizes = await db.size.findMany({
            where: { productId: parseInt(req.params.productId) }
        });
        return res.status(200).json({ success: true, data: sizes });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message, data: null });
    }
}

export async function updateSize(req, res) {
    try {
        const { err, status: validationStatus } = await validatorFunction(req.body, updateSizeValidation);
        if (!validationStatus) {
            return res.status(422).json({ message: "Validation Error", errors: err });
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
        return res.status(500).json({ success: false, message: error.message, data: null });
    }

}


export async function deleteSize(req, res) {
    try {
        const { err, status: validationStatus } = await validatorFunction(req.params, deleteSizeValidation);
        if (!validationStatus) {
            return res.status(422).json({ message: "Validation Error", errors: err });
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
        return res.status(500).json({ success: false, message: error.message, data: null });
    }
}