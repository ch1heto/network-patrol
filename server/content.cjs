'use strict';
// The browser and server use the same content and evaluators.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const scope = { structuredClone };
scope.window = scope;
vm.createContext(scope);
for (const file of ['data/locations.js','data/worldObjects.js','data/npcs.js','data/chapters.js','data/objectives.js','data/quizzes.js','data/curriculum.js','network/devices.js','network/topology.js','network/simulator.js','network/validation.js','network/course.js','data/taskContracts.js','network/taskState.js','engine/tasks.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), scope, { filename: file });
  if (file === 'data/locations.js') scope.Patrol = scope.window.Patrol;
}
module.exports = scope.Patrol;
