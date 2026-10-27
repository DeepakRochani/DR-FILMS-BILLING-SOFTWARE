/**
 * Public Key for DR FILMS Asymmetric License Verification.
 * This public key is safe to embed in the client bundle.
 * It is only used to verify signatures created by the private key.
 */

export const LICENSE_PUBLIC_KEY = {
  "key_ops": [
    "verify"
  ],
  "ext": true,
  "kty": "EC",
  "x": "1Py3Gsq13kwmG6zTZiQihAtSw9HR5UL2m-qdKOuhfTY",
  "y": "_3lJaatCYYy2dl8OFvNodI6huk6DNWLRdjjes3QosxU",
  "crv": "P-256"
};
