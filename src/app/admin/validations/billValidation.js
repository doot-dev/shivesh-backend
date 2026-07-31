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

// TM approval — a rejection must say why. Reviewed against a generated bill;
// it does not change the billed amount.
export const updateTmApprovalValidation = {
  billNo: "required|string",
  tmId: "required|string",
  approvalStatus: "required|in:PENDING,ACCEPTED,REJECTED",
  rejectionReason: "string",
};
