if (process.argv.includes('--raw')) {
  require('./train-raw');
  return;
}
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { inspect, score, validate, featureNames } = require('./validator');
const library = require('../server/seed/data/exercises.json');
let seed = 20261030;
const random = () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
const integer = (a,b) => a + Math.floor(random()*(b-a+1));
const shuffle = a => { for(let i=a.length-1;i>0;i--) { const j=integer(0,i); [a[i],a[j]]=[a[j],a[i]]; } return a; };
const save = (file,data) => { const p=path.join(__dirname,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,typeof data==='string'?data:JSON.stringify(data,null,2)+'\n'); };
const splits = { train: [], validation: [], test: [] }, seen = new Set();
const splitTargets = { train: 7000, validation: 1500, test: 1500 };
let nextGroup = 0;
for (const [split, target] of Object.entries(splitTargets)) {
while (splits[split].length < target) {
  const group = nextGroup++;
  assert(group < 10000, 'Unable to generate enough unique workout examples');
  // All corrupted versions of one base workout remain in the same partition.
  const equipment = ['none', 'home', 'gym'][group % 3];
  const allowedEquipment = equipment === 'gym' ? ['none', 'home', 'gym'] : equipment === 'home' ? ['none', 'home'] : ['none'];
  const pool = library.filter(exercise => allowedEquipment.includes(exercise.equipment));
  const expectedDays = [1,3,5].slice(0,integer(1,3));
  const base = { equipment, expectedDays, days: expectedDays.map(day=>({day,exercises:shuffle([...pool]).slice(0,4).map(e=>({name:e.name,sets:integer(1,4),repetitions:e.movement==='cardio'?0:integer(6,15),workSeconds:e.movement==='cardio'?integer(30,180):0,restSeconds:integer(30,120)}))})) };
  for(let variant=0;variant<8;variant++) {
    if (splits[split].length === target) break;
    const input=structuredClone(base), item=input.days[0].exercises[0];
    if(variant===1)item.name='Invented exercise';
    if (variant === 2) {
      input.equipment = 'none';
      item.name = library.find(exercise => exercise.equipment === 'gym').name;
    }
    if(variant===3)input.days.pop();
    if(variant===4)input.days[0].exercises[1]=structuredClone(item);
    if(variant===5)item.sets=integer(5,12);
    if(variant===6){item.repetitions=40;item.workSeconds=500;}
    if(variant===7)item.restSeconds=integer(0,29);
    const signature=JSON.stringify(input);
    if(seen.has(signature))continue;
    seen.add(signature);
    const features=inspect(input,library), label=Number(variant!==0);
    assert(features);assert.equal(Number(features.some(Boolean)),label);
    splits[split].push({groupId:group,origin:'synthetic',input,label,features});
  }
}
}
assert.equal(seen.size, 10000);
for (const [split, target] of Object.entries(splitTargets)) assert.equal(splits[split].length, target);
const model={algorithm:'logistic-regression',featureNames,weights:Array(7).fill(0),bias:0,threshold:.5,trainingOrigin:'synthetic-rule-labels',seed:20261030};
for(let epoch=0;epoch<1800;epoch++) {
  const grad=Array(7).fill(0);let bias=0;
  for(const row of splits.train){const error=score(model,row.features)-row.label;bias+=error;row.features.forEach((v,i)=>grad[i]+=v*error);}
  model.bias-=.3*bias/splits.train.length;
  model.weights=model.weights.map((w,i)=>w-.3*(grad[i]/splits.train.length+.0001*w));
}
function metrics(rows,t) {let tp=0,tn=0,fp=0,fn=0;for(const r of rows){const p=score(model,r.features)>=t;if(r.label)p?tp++:fn++;else p?fp++:tn++;}return {count:rows.length,accuracy:(tp+tn)/rows.length,precision:tp/(tp+fp||1),recall:tp/(tp+fn||1),f1:2*tp/(2*tp+fp+fn||1),confusion:{tp,tn,fp,fn}};}
let best=-1;for(let t=.1;t<=.9;t+=.01){const m=metrics(splits.validation,t);if(m.f1>best){best=m.f1;model.threshold=Number(t.toFixed(2));}}
for(const [name,rows] of Object.entries(splits))for(const [other,otherRows] of Object.entries(splits))if(name!==other)assert(!rows.some(r=>otherRows.some(o=>r.groupId===o.groupId)));
const report={totalExamples:seen.size,baseRoutineGroups:nextGroup,libraryExercises:library.length,splitCounts:Object.fromEntries(Object.entries(splits).map(([k,v])=>[k,v.length])),validation:metrics(splits.validation,model.threshold),test:metrics(splits.test,model.threshold),
  labels:'0 = passes implemented project rules; 1 = violates at least one rule. Not expert or clinical labels.',
  splitPolicy:'Base routine and all corruptions stay in one partition; exact duplicate inputs excluded globally. Exercise identities and mutation mechanisms are shared across partitions.',
  limitations:['Model learns explicit rule flags; deterministic rules already classify these synthetic cases exactly. No demonstrated benefit over rules.', 'No injury, medical, technique, progression or effectiveness assessment.', 'Synthetic examples span none/home/gym equipment and do not establish the real-world error distribution.']};
report.trainingExerciseCoverage = [...new Set(splits.train.filter(row => row.label === 0).flatMap(row => row.input.days.flatMap(day => day.exercises.map(exercise => exercise.name))))].sort();
assert.equal(report.trainingExerciseCoverage.length, library.length, 'Every catalog exercise must appear in a consistent training example');
// Preserve current artifacts before each retraining run writes replacements.
const backupDirectory = path.join(__dirname, '../validation-backups', `workout-training-${Date.now()}-${process.pid}`);
fs.mkdirSync(backupDirectory, { recursive: true });
for (const name of ['data', 'model', 'reports', 'examples']) {
  const source = path.join(__dirname, name);
  if (fs.existsSync(source)) fs.cpSync(source, path.join(backupDirectory, name), { recursive: true });
}
const deployedBundle = path.join(__dirname, '../server/services/workoutValidation');
if (fs.existsSync(deployedBundle)) fs.cpSync(deployedBundle, path.join(backupDirectory, 'server-workoutValidation'), { recursive: true });
save('data/exercises.json',library);for(const [name,rows]of Object.entries(splits))save(`data/${name}.jsonl`,rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
save('model/workout-model.json',model);save('reports/evaluation.json',report);
// Bundle the trained artifact and inference code inside the deployable server root.
save('../server/services/workoutValidation/model.json', model);
save('../server/services/workoutValidation/validator.js', fs.readFileSync(path.join(__dirname, 'validator.js'), 'utf8').split('if (require.main === module)')[0]);
save('examples/workout.json',splits.test[0].input);save('examples/invalid-workout.json',splits.test.find(r=>r.label).input);
assert.equal(validate(null,library,model).status,'cannot_verify');
assert.equal(validate(splits.test.find(r=>r.label).input,library,{...model,bias:-100,weights:Array(7).fill(0)}).status,'rejected');
// Preserve authentic results, including perfect rule-label agreement.
const challenge = require('../dataset-validation/evaluate').evaluate('workout-validation', { quiet: true })['workout-validation'];
report.evaluationType = 'synthetic-rule-labels';
report.challenge = challenge.metrics;
save('reports/evaluation.json', report);
console.log(JSON.stringify({ totalExamples: report.totalExamples, libraryExercises: library.length, splitCounts: report.splitCounts,
  syntheticValidation: report.validation, syntheticHeldOutTest: report.test,
  additionalChallenge: report.challenge,
  notice: 'Rule flags expose the synthetic labels; 100% is possible and is not real AI accuracy.' }, null, 2));
