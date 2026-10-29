import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateLevelExpression,resolveDamageFormula} from '../src/lib/level-formulas.js';

test('resolves Kineticist level-dependent damage without rolling dice',()=>{
  const formula='(floor((@actor.level -1)/2) +2)d4[slashing]';
  assert.equal(resolveDamageFormula(formula,1)?.text,'2d4 slashing damage');
  assert.equal(resolveDamageFormula(formula,10)?.text,'6d4 slashing damage');
  assert.equal(resolveDamageFormula(formula,20)?.text,'11d4 slashing damage');
});
test('supports basic arithmetic without eval/side effects',()=>{
  assert.equal(evaluateLevelExpression('floor((@actor.level - 1)/2)+2',7),5);
  assert.equal(evaluateLevelExpression('Math.random()',7),null);
  assert.equal(evaluateLevelExpression('globalThis.anything',7),null);
  assert.equal(evaluateLevelExpression('1/0',7),null);
  assert.equal(evaluateLevelExpression('floor(@actor.level/2)',7),3);
});
