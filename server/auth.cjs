'use strict';
const { randomBytes, scrypt, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');
const derive = promisify(scrypt);
const digest = value => createHash('sha256').update(value).digest('hex');
async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64);
  return `scrypt$${salt}$${key.toString('hex')}`;
}
async function verifyPassword(password, hash) {
  if (typeof hash !== 'string' || !/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(hash)) return false;
  const [, salt, expected] = hash.split('$');
  const key = await derive(password, salt, 64);
  return timingSafeEqual(key, Buffer.from(expected, 'hex'));
}
module.exports = { hashPassword, verifyPassword, digest, randomToken: () => randomBytes(32).toString('base64url') };
