// src/utils/encryption.js
const crypto = require('crypto');

const algorithm = 'aes-256-gcm';
const secretKey = process.env.ENCRYPTION_KEY || crypto.randomBytes(32);

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher(algorithm, secretKey);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(hash) {
  const textParts = hash.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const authTag = Buffer.from(textParts.shift(), 'hex');
  const encrypted = Buffer.from(textParts.shift(), 'hex');
  const decipher = crypto.createDecipher(algorithm, secretKey);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString();
}

module.exports = { encrypt, decrypt };