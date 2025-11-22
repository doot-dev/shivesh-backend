export const projectStep1Validation = {
  projectName: "required|string",
  clientId: "required|string",
  siteName: "required|string",
  projectLocation: "required|string",
};

export const projectStep2Validation = {
  tempProjectId: "required|string",
  "commission.personName": "string",
  "commission.amountPerM3": "numeric|min:0",
  "commission.includeInProjectCost": "boolean",
};

export const projectStep3Validation = {
  tempProjectId: "required|string",
  "credit.amount": "required|numeric|min:0",
  "credit.resetPeriodDays": "required|integer|min:1",
};

export const projectStep4Validation = {
  tempProjectId: "required|string",
  products: "required|array|min:1",
  "products.*.productName": "required|string",
  "products.*.productGrade": "required|string",
  "products.*.costPrice": "required|numeric|min:0",
  "products.*.vendors": "required|array|min:1",
  "products.*.vendors.*.vendorId": "required|string",
  "products.*.vendors.*.vendorName": "required|string",
  "products.*.vendors.*.customPrice": "required|numeric|min:0",
  "products.*.vendors.*.priority": "required|in:HIGH,MEDIUM,LOW",
};

export const updateProjectValidation = {
  projectName: "string",
  clientId: "string",
  siteName: "string",
  projectLocation: "string",
  projectManager: "string",
  status: "in:ACTIVE,INACTIVE,COMPLETED,ON_HOLD",
  "commission.personName": "string",
  "commission.amountPerM3": "numeric|min:0",
  "commission.includeInProjectCost": "boolean",
  "credit.amount": "numeric|min:0",
  "credit.resetPeriodDays": "integer|min:1",
  products: "array",
  "products.*.productName": "string",
  "products.*.productGrade": "string",
  "products.*.costPrice": "numeric|min:0",
  "products.*.vendors": "array",
  "products.*.vendors.*.vendorId": "string",
  "products.*.vendors.*.vendorName": "string",
  "products.*.vendors.*.customPrice": "numeric|min:0",
  "products.*.vendors.*.priority": "in:HIGH,MEDIUM,LOW",
};

export const projectListValidation = {
  page: "integer|min:1",
  limit: "integer|min:1|max:100",
  search: "string",
  status: "in:ACTIVE,INACTIVE,COMPLETED,ON_HOLD",
};
