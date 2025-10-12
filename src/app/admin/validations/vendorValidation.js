

export const createVendorValidation = {
    companyName: "required|string",
    ownerName: "required|string",
    phone: "required|string",
    address: "required|string",
}


export const updateVendorValidation = {
    id: "required|integer",
    companyName: "required|string",
    ownerName: "required|string",
    phone: "required|string",
    address: "required|string",
}   