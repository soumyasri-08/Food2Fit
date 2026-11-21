# PROTEIN NAP database v1.1

Source: https://zenodo.org/records/7308053

DOI: https://doi.org/10.5281/zenodo.7308053

Copyright © 2022 Kiriakos Stefanidis, Dorothea Tsatsou, Dimitrios Konstantinidis,
Lazaros Gymnopoulos, Saskia Wilson-Barnes, Kathryn Hart, Véronique Cornelissen,
Elise Decort, Elena Lalama, Andreas Pfeiffer, Maria Hassapidou, Ioannis Pagkalos,
Sofia Balula Dias, José Alves Diniz, and Kosmas Dimitropoulos.

License: **Creative Commons Attribution–NonCommercial–ShareAlike 4.0 International**.
License text: https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode
Retain attribution, identify adaptations, use noncommercially, and distribute
adapted data under the same license. This notice applies to the dataset and its
adapted CSV; it does not claim that the original authors endorse Food2Fit.

Funding: European Union Horizon 2020 grant No. 817732 (PROTEIN).

## Included files

- `protein_nap_db.zip`: complete, unmodified official archive (8,183,183 bytes).
  MD5 published by Zenodo and verified after download:
  `6de773710141bb8fa30e1f4a1c298d78`.
- `protein-nap-record.json`: original Zenodo record metadata, including creators,
  license, version, download URL, and checksum.
- `protein-nap-foods.json`: unmodified `protein_nap/json/foods.json` extracted
  from that archive, containing **1,914 food records**.
- `protein-nap-normalized.csv`: Food2Fit adaptation of **54 selected foods**.
  Remaining records are preserved in the source, not silently classified.

The archive also contains meals, recipes, activities, translations, and an SQL
export. These are retained as source material, not automatically inserted into
Food2Fit's recipe or exercise collections.

## Mapping and limitations

Run `npm --prefix server run data:protein-nap` to reproduce and validate the CSV
without a database. Run `npm --prefix server run seed:protein-nap` after configuring
`server/.env` to upsert the 54 foods into MongoDB. No network download is needed.
Existing records are not deleted; use a fresh database for a PROTEIN NAP-only
food collection. The browser preview uses the same 54 foods and the same deterministic
engine as the backend; workouts use the separate exercise library. Preferences
can regenerate both plans locally. Recipe examples and initial weight history
remain labeled samples. PROTEIN NAP is not used in recipe generation.
Regenerate browser artifacts with `npm --prefix server run data:preview`.

The selected records originate from USDA in this export (`information_source_id`
0). Their nutrient values are per 100 g, mapped by numeric nutrient ID:
5 = energy (kcal), 1 = protein (g), 3 = carbohydrate (g), 2 = fat (g),
20 = fiber (g). These values are copied, not estimated from food names or macro
percentages. Missing nutrients are rejected, never filled with zero.
For example, cooked tempeh (6433) is excluded because fiber is missing.

The source does **not** provide Food2Fit-compatible diet, allergen, meal-slot,
and default portion classifications. The explicit selection table in
`../server/seed/proteinNap.js` adds Food2Fit-authored classifications and portion sizes for
simple foods with clear preparation descriptions. These additions are not
expert-validated PROTEIN NAP metadata. `none` means no listed allergen in the
named plain food, not certification against cross-contact. Actual ingredients,
brands, and preparation must be checked. Oats conservatively carry `gluten`.
Eggs are non-vegetarian under this app's definition. A keto candidate tag means
at most 10 g carbohydrate per 100 g; the engine independently checks daily totals.

Generated combinations and portions are Food2Fit recommendations, not the
original expert-validated meal plans. Original food names and preparation states
are preserved. Restrictive diets may still produce target-shortfall warnings.

The source authors excluded certain upstream databases from the offered archive
because of copyright restrictions; Food2Fit uses only records actually present
in the public archive.
