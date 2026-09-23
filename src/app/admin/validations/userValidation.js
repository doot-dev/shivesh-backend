// `menuAccess` was required here until IAM landed. It is no longer written by
// the panel, so requiring it would reject every create/update — access is now
// carried by `roleId` + the Role/UserPermission tables instead.
export const userValidation = {
    name: 'required',
    employeeId: 'required',
    userName: 'required',
    password: 'required',
    role: 'required',
}

export const userUpdateValidation = {
    id: 'required|integer',
    employeeId: 'required',
    name: 'required',
    userName: 'required',
    role: 'required',
    status: 'required|boolean'
}

export const resetPasswordValidation = {
    id: 'required|integer',
    oldPassword: 'required',
    newPassword: 'required'
}
