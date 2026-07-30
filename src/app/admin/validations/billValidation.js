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

// TM approval — only ACCEPTED trucks are billed, and a rejection must say why.
export const updateTmApprovalValidation = {
  orderId: "required|string",
  tmId: "required|string",
  approvalStatus: "required|in:PENDING,ACCEPTED,REJECTED",
  rejectionReason: "string",
};
