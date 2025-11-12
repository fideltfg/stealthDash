const crypto = require('crypto');

// Use environment variable or generate a key
// IMPORTANT: In production, set ENCRYPTION_KEY environment variable
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-change-in-production-32b';
const ALGORITHM = 'aes-256-cbc';

// Ensure key is 32 bytes for AES-256
const getKey = () => {
  const hash = crypto.createHash('sha256');
  hash.update(ENCRYPTION_KEY);
  return hash.digest();
};

/**
 * Encrypt data
 * @param {string} text - Plain text to encrypt
 * @returns {string} - Encrypted text with IV prepended (format: iv:encryptedData)
 */
function encrypt(text) {
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Prepend IV to encrypted data (IV is needed for decryption)
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt data
 * @param {string} encryptedText - Encrypted text with IV (format: iv:encryptedData)
 * @returns {string} - Decrypted plain text
 */
function decrypt(encryptedText) {
  const key = getKey();
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Encrypt credential data (converts object to JSON, then encrypts)
 * @param {object} credentialData - Credential object to encrypt
 * @returns {string} - Encrypted credential string
 */
function encryptCredentials(credentialData) {
  const json = JSON.stringify(credentialData);
  return encrypt(json);
}

/**
 * Decrypt credential data (decrypts, then parses JSON)
 * @param {string} encryptedData - Encrypted credential string
 * @returns {object} - Decrypted credential object
 */
function decryptCredentials(encryptedData) {
  const json = decrypt(encryptedData);
  return JSON.parse(json);
}

module.exports = {
  encrypt,
  decrypt,
  encryptCredentials,
  decryptCredentials
};
