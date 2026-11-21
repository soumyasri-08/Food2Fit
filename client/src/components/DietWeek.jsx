import { foodName } from '../services/foodName';
import { visiblePlanWarnings } from '../services/planPresentation';
import { useState } from 'react';
import { Leaf, Download } from 'lucide-react';
import { downloadPlan } from '../services/exportPlan';

export default function DietWeek({ plan }) {
  const [selected, setSelected] = useState(0);
  const day = plan.mealPlan.days[selected];
  return <section className="diet-week">
    <div className="section-heading"><div><p className="eyebrow">YOUR WEEKLY MENU</p><h2>Good food, day by day.</h2></div><button className="button secondary" onClick={() => downloadPlan(plan)}><Download size={16}/>Download plan</button></div>
    <div className="day-tabs" role="tablist" aria-label="Diet days">{plan.mealPlan.days.map((item, i) => <button key={item.day} role="tab" aria-selected={selected === i} onClick={() => setSelected(i)}>Day {item.day}</button>)}</div>
    {day && <><div className="daily-summary"><Leaf size={18}/><strong>{Math.round(day.totals.calories)} kcal</strong><span>{Math.round(day.totals.protein)} g protein</span><span>{Math.round(day.totals.carbs)} g carbs</span><span>{Math.round(day.totals.fat)} g fat</span></div>
    <div className="diet-meals">{day.meals.map((meal, index) => <article className="panel diet-meal" key={meal.type}><div className="section-heading"><span className="meal-number">0{index + 1}</span><span className="pill green">{meal.type}</span></div><h3>{meal.foods.map(food => foodName(food.name)).join(' + ')}</h3><ul>{meal.foods.map((food, i) => <li key={i}><span title={food.name}>{foodName(food.name)}</span><strong>{food.grams} g</strong></li>)}</ul><div className="meal-footer"><strong>{Math.round(meal.totals.calories)}<small> kcal</small></strong><span>{Math.round(meal.totals.protein)} g protein</span></div></article>)}</div></>}
    {visiblePlanWarnings(plan.mealPlan.warnings)?.length > 0 && <details className="plan-warnings"><summary>Nutrition notes ({visiblePlanWarnings(plan.mealPlan.warnings).length})</summary>{visiblePlanWarnings(plan.mealPlan.warnings).map((note, i) => <p key={i}>{note}</p>)}</details>}
  </section>;
}
