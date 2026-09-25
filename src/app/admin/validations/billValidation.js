// Bill Validations
export const createBillValidation = {
  orderId: "required|string",
  rate: "numeric|min:0",
  dueDate: "string",
};

export const updateBillValidation = {
  billNo: "required|string",
  rate: "numeric|min:0",
  dueDate: "string",
  recalculate: "boolean",
};

export const updateBillStatusValidation = {
  billNo: "required|string",
  status: "required|in:PENDING,SENT,PAID,OVERDUE,CANCELLED",
};

// TM approval — a rejection must say why. Reached by bill (/bills/:billNo/…)
// or by order (/orders/:orderId/…, W11: reviewed before the bill exists), so
// neither id is required here; resolveTm finds the truck from whichever is set.
export const updateTmApprovalValidation = {
  tmId: "required|string",
  approvalStatus: "required|in:PENDING,ACCEPTED,REJECTED",
  rejectionReason: "string",
};
