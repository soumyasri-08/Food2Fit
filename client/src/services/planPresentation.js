// Hide operational fallback notices; retain nutrition and profile warnings.
export const visiblePlanWarnings = (warnings = []) => warnings.filter(message =>
  !message.startsWith('Showing your personalized dataset plan because AI generation did not succeed.') &&
  !message.startsWith('AI unavailable: showing your personalized dataset plan.'));
