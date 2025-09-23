import crypto from "crypto-js";
const { AES, enc, HmacSHA256 } = crypto;
// encryption function
export function encrypt(data) { return AES.encrypt(data, process.env.AES_TOKEN || "").toString(); }

// decryption function
export function decrypt(data) { return AES.decrypt(data, process.env.AES_TOKEN || "").toString(enc.Utf8); }

// generate hash function
export function generateHash(data) { return HmacSHA256(data, process.env.HMAC_TOKEN || "").toString(); }

