// Order Validations
// Only the order summary is editable once an order exists. Vendors and field
// technicians are managed through their own add/update/delete endpoints.
export const updateOrderValidation = {
  orderId: "required|string",
  productName: "string",
  productGrade: "string",
  quantity: "string",
  deliveryAddress: "string",
  date: "string",
  time: "string",
};

export const updateOrderStatusValidation = {
  orderId: "required|string",
  status: "in:NEW,CONFIRMED,IN_PROGRESS,DELIVERED,COMPLETED,CANCELLED",
  deliveryStatus: "in:ASSIGNED,IN_TRANSIT,DELIVERED,COMPLETED",
};

// Order Vendor Validations
export const createOrderVendorValidation = {
  orderId: "required|string",
  vendorId: "required|integer",
  vendorLocationId: "integer",
  vendorHandlerId: "integer",
};

export const updateOrderVendorValidation = {
  orderVendorId: "required|string",
  orderId: "required|string",
  vendorId: "integer",
  vendorLocationId: "integer",
  vendorHandlerId: "integer",
};

// Order Technician Validations
export const createOrderTechnicianValidation = {
  orderId: "required|string",
  userId: "required|integer",
};

export const updateOrderTechnicianValidation = {
  orderTechnicianId: "required|string",
  orderId: "required|string",
  userId: "required|integer",
};

// Order TM Validations
//
// Only the truck and its load are required: a TM can be planned when the order
// is created, with timings and the challan filled in as it actually runs.
// `tmNumber` is generated per order. `challanUrl` and `approvalStatus` are
// collected against the bill, not here.
export const createOrderTmValidation = {
  orderId: "required|string",
  truckNo: "required|string",
  qty: "required|string",
  dispatchTime: "string",
  arrivalTime: "string",
  batchStartTime: "string",
  batchEndTime: "string",
  challanNo: "string",
  status: "in:ASSIGNED,IN_TRANSIT,DELIVERED,COMPLETED",
};

export const updateOrderTmValidation = {
  orderId: "required|string",
  tmId: "required|string",
  truckNo: "string",
  qty: "string",
  dispatchTime: "string",
  arrivalTime: "string",
  batchStartTime: "string",
  batchEndTime: "string",
  challanNo: "string",
  status: "in:ASSIGNED,IN_TRANSIT,DELIVERED,COMPLETED",
};
