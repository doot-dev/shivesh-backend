import Validator from "validatorjs";
/**
 * Validator function
 * @param {Object} body - The object to validate
 * @param {Object} rules - The validation rules
 * @param {Object} customMessages - Custom error messages
 * @return {Promise<Object>} - A promise containing the validation result
 */
export const validatorFunction = (body, rules, customMessages = {}) => {
  /**
   * Validate the provided body with the given rules
   * @param {Validator} validator - The validator instance
   * @param {Object} customMessages - Custom error messages
   * @return {Promise<Object>} - A promise containing the validation result
   */
  return new Promise((resolve) => {
    const validation = new Validator(body, rules, customMessages);
    validation.passes(() => resolve({ status: true, err: null }));
    validation.fails(() => resolve({ status: false, err: validation.errors }));
  });
};

// const { err, status } = await validatorFunction(req.query, validationRule, {});
