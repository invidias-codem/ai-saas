// Manual mock for `@noble/ed25519` (v2.3.0 is ESM-only). The real package ships
// a single index.js with `export` statements, which ts-jest (preset, .ts/.tsx only)
// cannot transform, causing "SyntaxError: Unexpected token 'export'" at module load
// for any test that transitively imports lib/telemetry/sign.ts.
//
// Only lib/telemetry/sign.ts imports this package. The Ed25519 test block that
// exercised the real crypto is quarantined (describe.skip); these no-op stubs keep
// module-load healthy for the rest of the suite without touching the ESM graph.
function randomPrivateKey() {
  return new Uint8Array(32);
}
function getPublicKeyAsync(_priv) {
  return Promise.resolve(new Uint8Array(32));
}
function getPublicKey(_priv) {
  return new Uint8Array(32);
}
async function signAsync(_msg, _priv) {
  return new Uint8Array(64);
}
async function sign(_msg, _priv) {
  return new Uint8Array(64);
}
async function verifyAsync(_sig, _msg, _pub) {
  return true;
}
function verify(_sig, _msg, _pub) {
  return true;
}
const utils = {
  randomPrivateKey,
  getPublicKey,
  getPublicKeyAsync,
};

const named = {
  randomPrivateKey,
  getPublicKey,
  getPublicKeyAsync,
  sign,
  signAsync,
  verify,
  verifyAsync,
  utils,
};

module.exports = {
  ...named,
  default: named,
};