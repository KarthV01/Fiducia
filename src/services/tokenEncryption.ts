import { decryptSocialSecret, encryptSocialSecret } from "../social/crypto.js";

export function encryptSecret(plaintext: string) {
  return encryptSocialSecret(plaintext).ciphertext;
}

export function decryptSecret(envelope: string) {
  return decryptSocialSecret(envelope);
}
