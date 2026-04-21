import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const nativeDst = join('node_modules', 'rollup', 'dist', 'native.js');
const wasmCheck = join('node_modules', '@rollup', 'wasm-node', 'dist', 'wasm-node', 'bindings_wasm.js');

if (!existsSync(wasmCheck)) {
  console.log('WASM bindings not found — skipping patch');
  process.exit(0);
}
if (!existsSync(nativeDst)) {
  console.log('rollup native.js not found — skipping patch');
  process.exit(0);
}

// Use require.resolve at runtime so the path is correct in any environment
const patched = `// Patched by patch-rollup.mjs: use @rollup/wasm-node to avoid native binary crashes (Bus error)
const path = require('node:path');
const wasmPath = path.join(__dirname, '..', '..', '@rollup', 'wasm-node', 'dist', 'wasm-node', 'bindings_wasm.js');
const {
  parse,
  xxhashBase64Url,
  xxhashBase36,
  xxhashBase16
} = require(wasmPath);

exports.parse = parse;
exports.parseAsync = async (code, allowReturnOutsideFunction, jsx, _signal) =>
  parse(code, allowReturnOutsideFunction, jsx);
exports.xxhashBase64Url = xxhashBase64Url;
exports.xxhashBase36 = xxhashBase36;
exports.xxhashBase16 = xxhashBase16;
`;

writeFileSync(nativeDst, patched);
console.log('Patched rollup/dist/native.js → @rollup/wasm-node (works everywhere)');
