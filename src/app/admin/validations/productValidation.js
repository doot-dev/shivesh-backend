export const createProductValidation = {
    name: 'required',
}

export const updateProductValidation = {
    id: 'required',
    name: 'required',
    status: 'required',
}

export const deleteProductValidation = {
    id: 'required',
}

export const getProductByIdValidation = {
    id: 'required',
}

export const createSizeValidation = {
    productId: 'required',
    name: 'required',
}

export const updateSizeValidation = {
    id: 'required',
    productId: 'required',
    name: 'required',
    isActive: 'required',
}


export const deleteSizeValidation = {
    id: 'required',
}

export const getSizeByIdValidation = {
    productId: 'required',
}