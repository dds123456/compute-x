const os = require('node:os');
const { syncBuiltinESMExports } = require('node:module');

const originalHostname = os.hostname();

if (/[^\x00-\x7F]/.test(originalHostname)) {
  os.hostname = () => 'computex-local';
  syncBuiltinESMExports();
}
