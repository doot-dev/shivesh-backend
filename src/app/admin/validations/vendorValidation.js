

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


export const addLocationValidation = {
    vendorId: "required|integer",
    plantName: "required|string",
    address: "required|string",
    latitude: "required|numeric",
    longitude: "required|numeric"
}

export const updateLocationValidation = {
    id: "required|integer",
    vendorId: "required|integer",
    plantName: "required|string",
    address: "required|string",
    latitude: "required|numeric",
    longitude: "required|numeric"
}