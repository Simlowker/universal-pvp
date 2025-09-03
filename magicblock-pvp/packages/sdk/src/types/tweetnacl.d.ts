declare module 'tweetnacl' {
  export interface KeyPair {
    publicKey: Uint8Array;
    secretKey: Uint8Array;
  }

  export namespace sign {
    export function keyPair(): KeyPair;
    export function keyPair_fromSecretKey(secretKey: Uint8Array): KeyPair;
    export function keyPair_fromSeed(seed: Uint8Array): KeyPair;
    export function detached(msg: Uint8Array, secretKey: Uint8Array): Uint8Array;
    export function detached_verify(msg: Uint8Array, sig: Uint8Array, publicKey: Uint8Array): boolean;
    export const publicKeyLength: number;
    export const secretKeyLength: number;
    export const seedLength: number;
    export const signatureLength: number;
  }

  export namespace hash {
    export function sha512(msg: Uint8Array): Uint8Array;
    export const hashLength: number;
  }

  export namespace randomBytes {
    (length: number): Uint8Array;
  }
  
  export function randomBytes(length: number): Uint8Array;

  export namespace box {
    export function keyPair(): KeyPair;
    export function keyPair_fromSecretKey(secretKey: Uint8Array): KeyPair;
    export const publicKeyLength: number;
    export const secretKeyLength: number;
    export const sharedKeyLength: number;
    export const nonceLength: number;
  }

  export namespace secretbox {
    export const keyLength: number;
    export const nonceLength: number;
    export const overheadLength: number;
  }

  export namespace scalarMult {
    export function base(n: Uint8Array): Uint8Array;
    export function scalarMult(n: Uint8Array, p: Uint8Array): Uint8Array;
    export const scalarLength: number;
    export const groupElementLength: number;
  }
}