export const createClientValidation = {
  companyName: "required",
  ownerName: "required",
  contactNumber: "required|regex:/^[0-9]{10}$/",
  email: "required|email",
  password: "required|min:6",
  address: "required",
  hasGST: "required|boolean",
  gstNumber: "required_if:hasGST,true",
  ownerPan: "regex:/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/",
  ownerAadhaar: "regex:/^[0-9]{12}$/",
};

export const updateClientValidation = {
  companyName: "required",
  ownerName: "required",
  contactNumber: "required|regex:/^[0-9]{10}$/",
  email: "required|email",
  address: "required",
  hasGST: "boolean",
  gstNumber: "required_if:hasGST,true",
  ownerPan: "regex:/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/",
  ownerAadhaar: "regex:/^[0-9]{12}$/",
};

export const clientListValidation = {
  page: "integer|min:1",
  limit: "integer|min:1|max:100",
  search: "string",
  status: "in:ACTIVE,INACTIVE",
};
