const fs = require('node:fs');
const path = require('node:path');
const { parseFoods } = require('../services/foodImport');

const SOURCE = 'PROTEIN NAP v1.1 (Zenodo 7308053); Food2Fit classifications';
const dataPath = path.join(__dirname, '../../protein-nap-dataset/protein-nap-foods.json');
// Explicit Food2Fit annotations for simple, ready-to-eat foods. These tags and
// portions are NOT supplied or expert-validated by the PROTEIN NAP authors.
// `none` means no listed allergen in the named plain food, not no cross-contact.
const selections = [
  [3730, 'fruit', 182], [3748, 'fruit', 100], [3765, 'fruit', 100],
  [3767, 'fruit', 118], [3774, 'fruit', 100], [4037, 'fruit', 100],
  [3847, 'fruit', 100], [3859, 'fruit', 100], [3877, 'fruit', 150],
  [3879, 'fruit', 150], [3989, 'fruit', 150], [3904, 'fruit', 100],
  [6288, 'legume', 150], [6323, 'legume', 150], [6330, 'legume', 150],
  [6342, 'legume', 150], [4560, 'legume', 100, 'vegan', 'soy'],
  [4417, 'vegetable', 100], [4421, 'vegetable', 100],
  [4456, 'vegetable', 100], [4468, 'vegetable', 150],
  [4476, 'vegetable', 100], [4497, 'vegetable', 100],
  [4504, 'vegetable', 150], [4554, 'vegetable', 100],
  [4558, 'vegetable', 100], [4595, 'vegetable', 80],
  [4604, 'vegetable', 100], [4766, 'vegetable', 100],
  [4803, 'starch', 150], [4817, 'vegetable', 120],
  [3449, 'grain', 200, 'vegan', 'gluten'],
  [8004, 'grain', 150, 'vegan', 'wheat;gluten'],
  [8089, 'grain', 150, 'vegan', 'wheat;gluten'],
  [8098, 'grain', 150], [8012, 'grain', 150],
  [5226, 'nuts', 30, 'vegan', 'tree-nut'],
  [5236, 'nuts', 30, 'vegan', 'tree-nut'],
  [5257, 'nuts', 30, 'vegan', 'tree-nut'],
  [5270, 'nuts', 30, 'vegan', 'tree-nut'],
  [5279, 'nuts', 30, 'vegan', 'tree-nut'],
  [6532, 'nuts', 30, 'vegan', 'peanut'],
  [1575, 'dairy', 150, 'veg', 'milk'],
  [1775, 'dairy', 170, 'veg', 'milk'],
  [1665, 'dairy', 170, 'veg', 'milk'],
  [67388, 'dairy', 170, 'veg', 'milk'],
  [1677, 'egg', 100, 'non-veg', 'egg'],
  [1679, 'egg', 100, 'non-veg', 'egg'],
  [6030, 'fish', 150, 'non-veg', 'fish'],
  [6219, 'fish', 150, 'non-veg', 'fish'],
  [6249, 'fish', 150, 'non-veg', 'fish'],
  [6194, 'fish', 150, 'non-veg', 'fish'],
  [5343, 'meat', 150, 'non-veg'],
  [7062, 'meat', 150, 'non-veg'],
];
const nutrientFields = { calories: [5, 'KILOCALORIE'], protein: [1, 'GRAM'], carbs: [3, 'GRAM'], fat: [2, 'GRAM'], fiber: [20, 'GRAM'] };
const quote = value => '"' + String(value).replaceAll('"', '""') + '"';

function prepareProteinNap(data = JSON.parse(fs.readFileSync(dataPath, 'utf8'))) {
  const lookup = new Map(data.foods.map(food => [food.id, food]));
  for (const [field, [id, unit]] of Object.entries(nutrientFields)) {
    if (data.nutrients.find(n => n.id === id)?.unit_of_measure?.code !== unit) throw new Error(`Unexpected PROTEIN NAP unit for ${field}`);
  }
  const rows = selections.map(([id, category, serving, diet = 'vegan', allergens = 'none']) => {
    const food = lookup.get(id);
    if (!food || food.information_source_id !== 0) throw new Error(`Missing expected USDA-source food ${id}`);
    const values = Object.values(nutrientFields).map(([nutrient]) => {
      const entries = food.nutrition_informations.filter(n => n.nutrient_id === nutrient);
      if (entries.length !== 1 || typeof entries[0].value !== 'number' || !Number.isFinite(entries[0].value)) throw new Error(`Missing/ambiguous nutrient ${nutrient} for food ${id}`);
      return entries[0].value;
    });
    // Candidate tag only; the meal engine checks total carbohydrate targets.
    const diets = values[2] <= 10 ? `${diet};keto` : diet;
    const meals = ['fruit', 'nuts', 'dairy'].includes(category) ? 'breakfast;snack' : category === 'egg' || id === 3449 ? 'breakfast;lunch;dinner' : 'lunch;dinner';
    return [food.name, category, ...values, serving, diets, allergens, meals, 'per_100g'].map(quote).join(',');
  });
  const csv = 'name,category,calories,protein,carbs,fat,fiber,serving_grams,diet_tags,allergens,meal_types,basis\n' + rows.join('\n') + '\n';
  const parsed = parseFoods(csv, SOURCE);
  if (parsed.report.rejected.length || parsed.report.duplicates || parsed.foods.length !== selections.length) throw new Error(`PROTEIN NAP validation failed: ${JSON.stringify(parsed.report)}`);
  return { csv, ...parsed, sourceRecords: data.foods.length };
}
if (require.main === module) {
  const result = prepareProteinNap();
  fs.writeFileSync(path.join(__dirname, '../../protein-nap-dataset/protein-nap-normalized.csv'), result.csv);
  console.log(JSON.stringify({ sourceRecords: result.sourceRecords, ...result.report }, null, 2));
}
module.exports = { prepareProteinNap, SOURCE, selections };
