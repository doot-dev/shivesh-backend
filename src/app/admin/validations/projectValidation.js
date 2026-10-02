export const createProjectValidation = {
  projectName: "required|string",
  clientId: "required|string",
  siteName: "required|string",
  address: "string",
  projectLocation: "required|string",
  latitude: "numeric",
  longitude: "numeric",
  maxQty: "numeric|min:0",
};

export const updateProjectValidation = {
  projectId: "required|string",
  projectName: "string",
  siteName: "string",
  address: "string",
  projectLocation: "string",
  latitude: "numeric",
  longitude: "numeric",
  status: "in:ACTIVE,INACTIVE,COMPLETED,ON_HOLD,CANCELLED",
  maxQty: "numeric|min:0",
};

export const updateProjectCreditValidation = {
  projectId: "required|string",
  creditAmount: "numeric|min:0|sometimes",
  creditResetPeriodDays: "integer|min:1|sometimes",
};

// Project Product Validations
export const createProjectProductValidation = {
  projectId: "required|string",
  productName: "required|string",
  productGrade: "required|string",
  subcategory: "string|sometimes",
  costPrice: "required|numeric|min:0",
};

export const updateProjectProductValidation = {
  projectId: "required|string",
  productId: "required|string",
  productName: "string",
  productGrade: "string",
  subcategory: "string|sometimes",
  costPrice: "numeric|min:0",
};

// Project Product Vendor Validations
export const createProjectProductVendorValidation = {
  productId: "required|string",
  projectId: "required|string",
  vendorId: "required|integer",
  customPrice: "required|numeric|min:0",
  priority: "required|in:HIGH,MEDIUM,LOW",
};

export const updateProjectProductVendorValidation = {
  productVendorId: "required|string",
  projectId: "required|string",
  productId: "required|string",
  vendorId: "required|integer",
  customPrice: "numeric|min:0",
  priority: "in:HIGH,MEDIUM,LOW",
};
