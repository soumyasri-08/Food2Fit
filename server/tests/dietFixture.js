module.exports = request => {
  if(request.schema.properties.order)return {order:[1,2,3,4,5,6,7],totals:Array.from({length:7},()=>({calories:0,protein:0,carbs:0,fat:0,fiber:0}))};
  const {catalog}=JSON.parse(request.parts[0].text);
  const zero={calories:0,protein:0,carbs:0,fat:0,fiber:0};
  return {days:Array.from({length:7},(_,i)=>({day:i+1,meals:['breakfast','lunch','snack','dinner'].map(type=>{
    const candidates=catalog.filter(f=>f.mealTypes.includes(type));
    const food=candidates[i%candidates.length];
    return {type,foods:[{foodId:food.id,grams:Math.min(100,food.maxGrams)}],totals:{...zero}};
  }),totals:{...zero}}))};
};
