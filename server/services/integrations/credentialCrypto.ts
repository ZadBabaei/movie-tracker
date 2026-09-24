import crypto from "node:crypto";
import { ICredentialEnvelope } from "../../models/UserIntegration";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;
const MAX_SECRET_BYTES = 4096;

export type CredentialCryptoErrorCode =
  | "invalid_encryption_config"
  | "unknown_key_version"
  | "invalid_credential_envelope"
  | "credential_decryption_failed";

export class CredentialCryptoError extends Error {
  constructor(public readonly code: CredentialCryptoErrorCode) {
    super(code);
    this.name = "CredentialCryptoError";
  }
}

const decodeBase64 = (value: string, code: CredentialCryptoErrorCode) => {
  if (
    !value ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw new CredentialCryptoError(code);
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) throw new CredentialCryptoError(code);
  return decoded;
};

const parsePositiveVersion = (value: string | undefined) => {
  if (!value || !/^[1-9]\d*$/.test(value)) {
    throw new CredentialCryptoError("invalid_encryption_config");
  }
  const version = Number(value);
  if (!Number.isSafeInteger(version)) {
    throw new CredentialCryptoError("invalid_encryption_config");
  }
  return version;
};

const resolveKey = (version: number, env: NodeJS.ProcessEnv) => {
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new CredentialCryptoError("unknown_key_version");
  }
  const configured = env[`INTEGRATION_ENCRYPTION_KEY_V${version}`];
  if (!configured) throw new CredentialCryptoError("unknown_key_version");
  const key = decodeBase64(configured, "invalid_encryption_config");
  if (key.length !== KEY_BYTES) {
    throw new CredentialCryptoError("invalid_encryption_config");
  }
  return key;
};

const validateSecret = (value: string) => {
  if (typeof value !== "string" || !value || Buffer.byteLength(value, "utf8") > MAX_SECRET_BYTES) {
    throw new CredentialCryptoError("invalid_credential_envelope");
  }
};

export const createCredentialCrypto = (env: NodeJS.ProcessEnv = process.env) => ({
  encryptCredential(value: string): ICredentialEnvelope {
    validateSecret(value);
    const keyVersion = parsePositiveVersion(env.INTEGRATION_ENCRYPTION_ACTIVE_KEY_VERSION);
    const key = resolveKey(keyVersion, env);
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_BYTES });
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);

    // All binary envelope fields use canonical padded Base64.
    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      keyVersion,
    };
  },

  decryptCredential(envelope: ICredentialEnvelope): string {
    try {
      if (!envelope || typeof envelope !== "object") {
        throw new CredentialCryptoError("invalid_credential_envelope");
      }
      const key = resolveKey(envelope.keyVersion, env);
      const iv = decodeBase64(envelope.iv, "invalid_credential_envelope");
      const authTag = decodeBase64(envelope.authTag, "invalid_credential_envelope");
      const ciphertext = decodeBase64(
        envelope.ciphertext,
        "invalid_credential_envelope"
      );
      if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES || !ciphertext.length) {
        throw new CredentialCryptoError("invalid_credential_envelope");
      }
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_BYTES,
      });
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    } catch (error) {
      if (error instanceof CredentialCryptoError) throw error;
      throw new CredentialCryptoError("credential_decryption_failed");
    }
  },
});

const credentialCrypto = createCredentialCrypto();

export const encryptCredential = credentialCrypto.encryptCredential;
export const decryptCredential = credentialCrypto.decryptCredential;
