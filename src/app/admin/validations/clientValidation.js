export const createClientValidation = {
  companyName: "required",
  ownerName: "required",
  contactNumber: "required|regex:/^[0-9]{10}$/",
  email: "required|email",
  address: "required",
  // 2026-09-28: every client has a GSTIN; PAN optional; no Aadhaar.
  gstNumber: "required|regex:/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/",
  ownerPan: "regex:/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/",
};

export const updateClientValidation = {
  companyName: "required",
  ownerName: "required",
  contactNumber: "required|regex:/^[0-9]{10}$/",
  email: "required|email",
  address: "required",
  gstNumber: "required|regex:/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/",
  ownerPan: "regex:/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/",
};

export const clientListValidation = {
  page: "integer|min:1",
  limit: "integer|min:1|max:100",
  search: "string",
  status: "in:ACTIVE,INACTIVE",
};
