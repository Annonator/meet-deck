const encoder = new TextEncoder();

export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return encodeBase64Url(bytes);
}

export async function hmacSha256(secret: string, payload: string): Promise<string> {
  return hmacSha256Bytes(secret, encoder.encode(payload));
}

export async function hmacSha256Bytes(secret: string, payload: Uint8Array): Promise<string> {
  const key = await importHmacKey(secret, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, toArrayBuffer(payload));
  return encodeBase64Url(new Uint8Array(signature));
}

export async function verifyHmacSha256(
  secret: string,
  payload: Uint8Array,
  expected: string
): Promise<boolean> {
  try {
    const key = await importHmacKey(secret, ["verify"]);
    return crypto.subtle.verify(
      "HMAC",
      key,
      toArrayBuffer(decodeBase64Url(expected)),
      toArrayBuffer(payload)
    );
  } catch {
    return false;
  }
}

export async function hmacSha256TextKey(secret: string, payload: Uint8Array): Promise<string> {
  const key = await importRawHmacKey(encoder.encode(secret), ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, toArrayBuffer(payload));
  return encodeBase64Url(new Uint8Array(signature));
}

export async function verifyHmacSha256TextKey(
  secret: string,
  payload: Uint8Array,
  expected: string
): Promise<boolean> {
  try {
    const key = await importRawHmacKey(encoder.encode(secret), ["verify"]);
    return crypto.subtle.verify(
      "HMAC",
      key,
      toArrayBuffer(decodeBase64Url(expected)),
      toArrayBuffer(payload)
    );
  } catch {
    return false;
  }
}

export async function deriveSessionHmacKey(
  secret: string,
  salt: Uint8Array,
  info: Uint8Array
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(decodeBase64Url(secret)),
    "HKDF",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { hash: "SHA-256", info: toArrayBuffer(info), name: "HKDF", salt: toArrayBuffer(salt) },
    baseKey,
    { hash: "SHA-256", length: 256, name: "HMAC" },
    false,
    ["sign", "verify"]
  );
}

export async function signWithKey(key: CryptoKey, payload: Uint8Array): Promise<string> {
  const signature = await crypto.subtle.sign("HMAC", key, toArrayBuffer(payload));
  return encodeBase64Url(new Uint8Array(signature));
}

export async function verifyWithKey(
  key: CryptoKey,
  payload: Uint8Array,
  expected: string
): Promise<boolean> {
  try {
    return crypto.subtle.verify(
      "HMAC",
      key,
      toArrayBuffer(decodeBase64Url(expected)),
      toArrayBuffer(payload)
    );
  } catch {
    return false;
  }
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/gu, "");
}

export function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("Invalid base64url value");
  }

  const paddingLength = (4 - (value.length % 4)) % 4;
  const padded = value.replace(/-/gu, "+").replace(/_/gu, "/") + "=".repeat(paddingLength);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function importHmacKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return importRawHmacKey(decodeBase64Url(secret), usages);
}

async function importRawHmacKey(secret: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    toArrayBuffer(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    usages
  );
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}
