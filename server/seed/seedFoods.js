const fs = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Food = require('../models/Food');
const { importFoods } = require('../services/foodImport');
const { prepareProteinNap, SOURCE } = require('./proteinNap');

async function main() {
  const args = process.argv.slice(2);
  const sample = args.length === 1 && args[0] === '--sample';
  const proteinNap = args.length === 1 && args[0] === '--protein-nap';
  if (!sample && !proteinNap && (args.length !== 2 || args[0].startsWith('--'))) {
    throw new Error('Usage: node seed/seedFoods.js --protein-nap OR --sample OR <csv-path> <source-label>');
  }
  let csv;
  if (proteinNap) csv = prepareProteinNap().csv;
  else {
    const file = sample ? path.join(__dirname, 'data/sample-foods.csv') : path.resolve(args[0]);
    if ((await fs.stat(file)).size > 10 * 1024 * 1024) throw new Error('CSV exceeds the 10 MB import limit');
    csv = await fs.readFile(file, 'utf8');
  }
  await connectDB();
  const report = await importFoods(csv, proteinNap ? SOURCE : sample ? 'Food2Fit illustrative sample (not Protein Nap)' : args[1], Food);
  console.log(JSON.stringify(report, null, 2));
}
if (require.main === module) main().catch(error => {
  console.error(error.name === 'MongoServerError' ? 'Import failed. Check database access and indexes.' : error.message);
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
module.exports = main;
