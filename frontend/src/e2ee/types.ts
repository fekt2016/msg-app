// ---------------------------------------------------------------------------
// Key shapes
//
// There are two flavours of every key-bearing structure:
//   * The *local* shape (suffix-less, e.g. E2eeIdentityKey) carries private key
//     material and MUST NEVER leave the device. It is persisted only in
//     expo-secure-store via keyStore.ts.
//   * The *public* shape (E2eePublic*) is the only thing that is ever serialized
//     into an API request/response. The server is a public-key directory +
//     ciphertext relay and must never receive or store a private half.
//
// The identity is made of TWO keypairs (see crypto.ts for the rationale):
//   * an ECDH P-256 keypair used for key agreement (message encryption), and
//   * an ECDSA P-256 keypair used to *sign* the signed pre-key so recipients can
//     authenticate it and detect MITM.
// WebCrypto EC keys are single-purpose, so one P-256 key cannot both agree and
// sign; hence the two keypairs.
// ---------------------------------------------------------------------------

/** Local identity keypair material — private halves never leave the device. */
export interface E2eeIdentityKey {
  /** ECDH P-256 public key (raw, base64) — used for key agreement. */
  publicKey: string;
  /** ECDH P-256 private key (pkcs8, base64) — LOCAL ONLY. */
  privateKey: string;
  /** ECDSA P-256 public key (raw, base64) — verifies signed-pre-key signatures. */
  signingPublicKey: string;
  /** ECDSA P-256 private key (pkcs8, base64) — LOCAL ONLY, signs pre-keys. */
  signingPrivateKey: string;
}

/** Public identity — the only identity material the server ever sees. */
export interface E2eePublicIdentityKey {
  publicKey: string;
  signingPublicKey: string;
}

/** Local signed pre-key material — private half never leaves the device. */
export interface E2eeSignedPreKey {
  keyId: number;
  /** ECDH P-256 public key (raw, base64). */
  publicKey: string;
  /** ECDH P-256 private key (pkcs8, base64) — LOCAL ONLY. */
  privateKey: string;
  /**
   * ECDSA signature over the signed pre-key's public key bytes, produced with
   * the identity signing private key. NOT a private key.
   */
  signature: string;
}

/** Public signed pre-key — public key plus its authenticating signature. */
export interface E2eePublicSignedPreKey {
  keyId: number;
  publicKey: string;
  signature: string;
}

export interface E2eePreKey {
  keyId: number;
  publicKey: string;
}

export interface E2eeOneTimePreKey {
  keyId: number;
  publicKey: string;
}

/** Full local key bundle — persisted only in secure storage on-device. */
export interface E2eeKeyBundle {
  identityKey: E2eeIdentityKey;
  signedPreKey: E2eeSignedPreKey;
  preKeys: E2eePreKey[];
  oneTimePreKeys: E2eeOneTimePreKey[];
}

/** Public key bundle — the shape uploaded to and served by the server. */
export interface E2eePublicKeyBundle {
  identityKey: E2eePublicIdentityKey;
  signedPreKey: E2eePublicSignedPreKey;
  preKeys: E2eePreKey[];
  oneTimePreKeys: E2eeOneTimePreKey[];
}

export interface EncryptedMessage {
  recipientId: string;
  ciphertext: string;
  timestamp: number;
  senderId: string;
}

export interface DecryptedMessage {
  plaintext: string;
  senderId: string;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  recipientId: string;
  ciphertext: string;
  timestamp: number;
  delivered: boolean;
  read: boolean;
}
