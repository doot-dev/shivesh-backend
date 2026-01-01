export const createProjectValidation = {
  projectName: "required|string",
  clientId: "required|string",
  siteName: "required|string",
  address: "string",
  projectLocation: "required|string",
  latitude: "numeric",
  longitude: "numeric",
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
};

export const updateProjectCreditValidation = {
  projectId: "required|string",
  creditAmount: "numeric|min:0|sometimes",
  creditResetPeriodDays: "integer|min:1|sometimes",
};

export const updateProjectCommissionValidation = {
  projectId: "required|string",
  commissionPersonName: "string|sometimes",
  commissionAmountPerM3: "sometimes|numeric|min:0",
  commissionPersonMobile: "string|sometimes",
};

// Project Product Validations
export const createProjectProductValidation = {
  projectId: "required|string",
  productName: "required|string",
  productGrade: "required|string",
  costPrice: "required|numeric|min:0",
};

export const updateProjectProductValidation = {
  projectId: "required|string",
  productId: "required|string",
  productName: "string",
  productGrade: "string",
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
  projectId: "required|string",
  productId: "required|string",
  vendorId: "required|string",
  customPrice: "numeric|min:0",
  priority: "in:HIGH,MEDIUM,LOW",
};
