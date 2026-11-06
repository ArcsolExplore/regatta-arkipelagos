// CommonJS entry for the legacy behaviour scripts: all game globals in one object.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const src = ['public/logic.js', 'public/games-extra.js', 'public/games-more.js'].map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n;\n');
const m = { exports: {} };
vm.runInThisContext(`(function (module) {\n${src}\n})`, { filename: 'games-bundle.js' })(m);
module.exports = m.exports;
