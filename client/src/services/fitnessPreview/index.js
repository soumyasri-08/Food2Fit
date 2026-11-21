import data from './data.json' with { type: 'json' };
import { buildMealPlan, buildWorkoutPlan } from './engine.js';

export const datasetVersion = data.version;
export const defaultProfile = { age: 29, gender: 'male', height: 178, weight: 76, activityLevel: 'moderate', goal: 'fat-loss', dietPreference: 'veg', allergies: [], workoutDays: 4, equipment: 'home' };
export function generatePreviewPlan(profile) {
  return {
    profile: structuredClone(profile),
    mealPlan: buildMealPlan(profile, data.foods),
    workoutPlan: buildWorkoutPlan(profile, data.exercises),
    datasetVersion,
    stale: false,
    planError: '',
  };
}
