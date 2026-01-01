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
