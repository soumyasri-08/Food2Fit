// Explicit human review command; never called automatically by the collector.
const fs=require('node:fs'),path=require('node:path');
const {labelDiet}=require('./diet-labels');
try {
  const [file,reviewer,...notes]=process.argv.slice(2);
  if(!file||!reviewer||!notes.length)throw new Error('Usage: node dataset-validation/review-diet.js <record.json> <reviewer> <review notes>');
  const record=JSON.parse(fs.readFileSync(file,'utf8'));
  if(record.origin!=='live-gemini'||!record.id||!/^[a-f0-9-]{36}$/.test(record.id))throw new Error('Expected a saved live Gemini diet record.');
  const result=labelDiet(record.diet);
  if(result.label==='cannot_verify')throw new Error('Unverifiable cases cannot enter binary nutrition training. Resolve ingredient mapping and quantities first.');
  record.validation={...result,reviewStatus:'reviewed',trainingEligible:true};
  record.review={reviewer,notes:notes.join(' '),reviewedAt:new Date().toISOString(),scope:'Human review of reference matching and numerical consistency, not medical approval.'};
  const directory=path.join(__dirname,'diet-labels/reviewed');fs.mkdirSync(directory,{recursive:true});
  const output=path.join(directory,record.id+'.json');fs.writeFileSync(output,JSON.stringify(record,null,2)+'\n');
  console.log('Reviewed record saved: '+output);
}catch(error){console.error(error.message);process.exitCode=1;}
