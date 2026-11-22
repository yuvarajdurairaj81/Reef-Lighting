import { Router } from 'express';
import { CHANNELS, CORAL_CATEGORIES, CORAL_CATEGORY_LABELS, PRESETS, RECOMMENDED_PRESET } from '../../domain/channels';
import { getDeviceAdapter } from '../../iot';

export const metaRouter = Router();

/** Public lighting metadata used by the UI (channels, coral categories, presets). */
metaRouter.get('/lighting', (_req, res) => {
  res.json({
    channels: CHANNELS,
    coralCategories: CORAL_CATEGORIES.map((key) => ({ key, label: CORAL_CATEGORY_LABELS[key], recommendedPreset: RECOMMENDED_PRESET[key] })),
    presets: PRESETS,
    wattageFormula: 'Estimated Wattage = Σ (Channel Maximum Wattage × Channel Intensity / 100)',
  });
});

metaRouter.get('/iot', (_req, res) => {
  const a = getDeviceAdapter();
  res.json({ transport: a.kind, simulated: a.isSimulated });
});
