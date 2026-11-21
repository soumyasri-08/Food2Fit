# PROTEIN NAP dataset

The single source folder for Food2Fit's downloaded PROTEIN NAP data.
Original records are preserved; only the explicitly named normalized CSV is adapted.

| File | Contents |
| --- | --- |
| `protein_nap_db.zip` | Complete original publisher archive |
| `protein-nap-foods.json` | Original 1,914 food records extracted from the archive |
| `protein-nap-record.json` | Publisher metadata, authors, version, license and checksum |
| `protein-nap-normalized.csv` | 54-food selection used by the application planner |
| `PROTEIN-NAP.md` | Attribution, license, mapping and limitations |

The separate `../dataset-validation/` folder contains the 383-food training
selection, synthetic examples, trained model and evaluation reports. Its training
script reads the original data here. Application seed and preview scripts also
read this folder. Run those scripts from the full repository checkout.

Source: PROTEIN NAP Database v1.1, https://doi.org/10.5281/zenodo.7308053.
Dataset and adapted data license: CC BY-NC-SA 4.0. See `PROTEIN-NAP.md`.
