export const userValidation = { 
    name: 'required',
    employeeId: 'required',
    userName: 'required',
    password: 'required',
    role: 'required',
    menuAccess: "required"
}

export const userUpdateValidation = { 
    id: 'required|integer',
    employeeId: 'required',
    name: 'required',
    userName: 'required',
    role: 'required',
    menuAccess: "required",
    status: 'required|boolean'
}
