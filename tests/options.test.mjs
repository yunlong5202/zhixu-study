import test from 'node:test';
import assert from 'node:assert/strict';
import {displayedOptions,answerLetter} from '../src/lib/options.js';
import {questions} from '../src/data/curriculum.js';

test('display options stay stable while preserving original stored answer indices',()=>{
  const counts=[0,0,0,0];
  for(const q of questions.filter(q=>q.type==='single')){
    const options=displayedOptions(q);
    assert.deepEqual(displayedOptions(q),options);
    assert.deepEqual(options.map(o=>o.index).sort(),[0,1,2,3]);
    for(const option of options)assert.equal(option.text,q.options[option.index]);
    const correctPosition=options.findIndex(o=>o.index===q.answer);
    assert.equal(answerLetter(q),String.fromCharCode(65+correctPosition));
    counts[correctPosition]++;
  }
  assert.equal(counts.every(n=>n>80),true);
});
