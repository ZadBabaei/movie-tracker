import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";
import {
  CredentialCryptoError,
  createCredentialCrypto,
} from "../services/integrations/credentialCrypto";

const key = crypto.randomBytes(32).toString("base64");
const configuredEnv = {
  INTEGRATION_ENCRYPTION_ACTIVE_KEY_VERSION: "7",
  INTEGRATION_ENCRYPTION_KEY_V7: key,
};

const mutateBase64 = (value: string) => {
  const bytes = Buffer.from(value, "base64");
  bytes[0] ^= 1;
  return bytes.toString("base64");
};

test("AES-256-GCM credential encryption round trips without serializing plaintext", () => {
  const service = createCredentialCrypto(configuredEnv);
  const plaintext = "fake-provider-auth-key";
  const envelope = service.encryptCredential(plaintext);

  assert.equal(service.decryptCredential(envelope), plaintext);
  assert.equal(envelope.keyVersion, 7);
  assert.notEqual(envelope.ciphertext, plaintext);
  assert.equal(JSON.stringify(envelope).includes(plaintext), false);
});

test("repeated encryption uses fresh IVs and ciphertext", () => {
  const service = createCredentialCrypto(configuredEnv);
  const first = service.encryptCredential("same-fake-secret");
  const second = service.encryptCredential("same-fake-secret");

  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
});

test("tampered authentication tags and ciphertext fail closed", () => {
  const service = createCredentialCrypto(configuredEnv);
  const envelope = service.encryptCredential("fake-secret");

  assert.throws(
    () => service.decryptCredential({ ...envelope, authTag: mutateBase64(envelope.authTag) }),
    (error: unknown) =>
      error instanceof CredentialCryptoError && error.code === "credential_decryption_failed"
  );
  assert.throws(
    () => service.decryptCredential({ ...envelope, ciphertext: mutateBase64(envelope.ciphertext) }),
    (error: unknown) =>
      error instanceof CredentialCryptoError && error.code === "credential_decryption_failed"
  );
});

test("missing or malformed active key configuration fails safely", () => {
  assert.throws(
    () => createCredentialCrypto({}).encryptCredential("fake-secret"),
    (error: unknown) =>
      error instanceof CredentialCryptoError && error.code === "invalid_encryption_config"
  );
  assert.throws(
    () =>
      createCredentialCrypto({
        INTEGRATION_ENCRYPTION_ACTIVE_KEY_VERSION: "1",
        INTEGRATION_ENCRYPTION_KEY_V1: "not-base64!",
      }).encryptCredential("fake-secret"),
    (error: unknown) =>
      error instanceof CredentialCryptoError && error.code === "invalid_encryption_config"
  );
  assert.throws(
    () =>
      createCredentialCrypto({
        INTEGRATION_ENCRYPTION_ACTIVE_KEY_VERSION: "0",
        INTEGRATION_ENCRYPTION_KEY_V0: key,
      }).encryptCredential("fake-secret"),
    (error: unknown) =>
      error instanceof CredentialCryptoError && error.code === "invalid_encryption_config"
  );
});

test("keys must decode to exactly 32 bytes", () => {
  const service = createCredentialCrypto({
    INTEGRATION_ENCRYPTION_ACTIVE_KEY_VERSION: "1",
    INTEGRATION_ENCRYPTION_KEY_V1: crypto.randomBytes(31).toString("base64"),
  });

  assert.throws(
    () => service.encryptCredential("fake-secret"),
    (error: unknown) =>
      error instanceof CredentialCryptoError && error.code === "invalid_encryption_config"
  );
});

test("decryption resolves the stored key version and rejects unknown versions", () => {
  const service = createCredentialCrypto(configuredEnv);
  const envelope = service.encryptCredential("fake-secret");

  assert.throws(
    () => service.decryptCredential({ ...envelope, keyVersion: 8 }),
    (error: unknown) =>
      error instanceof CredentialCryptoError && error.code === "unknown_key_version"
  );
});
