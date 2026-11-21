const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildMealPlan,buildWorkoutPlan}=require('../services/fitnessEngine');
const profile={age:30,gender:'male',height:175,weight:75,activityLevel:'moderate',goal:'maintenance',dietPreference:'vegan',allergies:[],workoutDays:3,equipment:'none'};
const foods=require('../seed/proteinNap').prepareProteinNap().foods.map((f,i)=>({...f,_id:String(i+1)}));
const exercises=require('../seed/data/exercises.json').map((e,i)=>({...e,_id:String(i+1)}));
test('regeneration changes eligible selections without changing targets or reference nutrition',()=>{
 const first=buildMealPlan(profile,foods),next=buildMealPlan(profile,foods,first);
 const selections=p=>p.days.map(d=>d.meals.map(m=>m.foods.map(f=>f.food)));
 assert.notDeepEqual(selections(next),selections(first));
 assert.deepEqual(first.targets,next.targets);
 for(const day of next.days)for(const meal of day.meals)for(const item of meal.foods){
  const source=foods.find(f=>f._id===item.food);
  assert(source.dietTags.includes('vegan'));
  assert.equal(item.nutrition.calories,Math.round(source.calories*item.grams/100*10)/10);
 }
 for(const equipment of ['none','home','gym']){
  const p={...profile,equipment};const a=buildWorkoutPlan(p,exercises),b=buildWorkoutPlan(p,exercises,a);
  assert.notDeepEqual(a.days,b.days);
  assert.deepEqual(a.restDays,b.restDays);
  for(const day of b.days)for(const item of day.exercises){
   const source=exercises.find(e=>e._id===item.exercise);
   assert((equipment==='gym'?['none','home','gym']:equipment==='home'?['none','home']:['none']).includes(source.equipment));
   assert(source.goalTags.includes(p.goal));
  }
 }
});
