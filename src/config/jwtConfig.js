import jsonwebtoken from "jsonwebtoken";
import { encrypt, decrypt } from "../helper/security.js";

const { sign, verify } = jsonwebtoken;
/**
 * Verify JWT auth token function
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {Promise<void>}
 */
export async function verifyToken(req, res, next) {
  try {
    const token = req.body?.token || req.headers["authorization"]?.replace('Bearer ', '') || req.query?.token;

    // check if token is provided
    if (!token) {
      return res.status(403).json({
        message: "A Token is Required for Authentication",
        success: false,
        data: {},
      });
    }
    
    // decrypt the token  
    const _decryptToken = decrypt(token);
    
    // verify the token
    verify(_decryptToken, process.env.JWT_TOKEN, (err, decoded) => {

      if (err !== null) {
        res.status(401).json({ message: 'Failed to authenticate token.' });
        return;
      }
      console.log("decoded", decoded);

      // Attach the decoded user information to the request object
      req.user = decoded;
      next();
    });
  } catch (error) {
    console.error(error.message);
    // if token is invalid return an error
    res
      .status(401)
      .send({ message: "Invalid Token", success: false, data: {} });
    return;

  }
}

/**
 * Generate JWT auth token function
 * @param {object} data data to be inserted into the token
 * @returns {string} encrypted token
 */
export function generateToken(data) {
  try {
    // add the issued at time to the data
    data.iat = Date.now();
    
    // sign the data with the JWT token
    const token = sign({ data }, process.env.JWT_TOKEN || "", {
      expiresIn: "30d",
    });
    
    // encrypt the token
    return encrypt(token);
  } catch (error) {
    console.error("Token generation error:", error.message);
    throw new Error(`Failed to generate token: ${error.message}`);
  }
}


