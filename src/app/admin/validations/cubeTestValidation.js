// Cube Test Validations
//
// `castingDate` is when the cube was cast. `period` decides `toDate`: 7/14/21
// days after casting are computed automatically, `CUSTOM` takes the caller's
// own `customDate` instead (validated in the controller to not be in the
// future — the standard periods are allowed to land in the future since
// they're a scheduled test date, custom is a backdated record).
export const createCubeTestValidation = {
  orderId: "required|string",
  castingDate: "required|date",
  quantity: "required|string",
  period: "required|in:SEVEN_DAYS,FOURTEEN_DAYS,TWENTYONE_DAYS,CUSTOM",
  customDate: "required_if:period,CUSTOM|date",
};

export const updateCubeTestValidation = {
  orderId: "required|string",
  cubeTestId: "required|string",
  castingDate: "date",
  quantity: "string",
  period: "in:SEVEN_DAYS,FOURTEEN_DAYS,TWENTYONE_DAYS,CUSTOM",
  customDate: "required_if:period,CUSTOM|date",
};
