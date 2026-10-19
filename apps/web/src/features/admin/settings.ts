import { EDITABLE_SETTINGS, type SettingKey, SETTING_KEYS } from "@portal/contracts";

/** Admin Settings (final mockup `settings()`). Pure: unit-tested. */

export type SettingValues = Partial<Record<SettingKey, number | boolean>>;

/** Form text per setting: numbers as typed strings (so a field can be empty while editing), bools as-is. */
export type SettingDraft = Partial<Record<SettingKey, string | boolean>>;

export function draftFrom(values: Record<string, number | boolean>): SettingDraft {
  const draft: SettingDraft = {};
  for (const key of SETTING_KEYS) {
    const value = values[key];
    if (value === undefined) continue;
    draft[key] = typeof value === "boolean" ? value : String(value);
  }
  return draft;
}

/** A number field's problem, or null when it's a whole number within the setting's range. */
export function intError(key: SettingKey, text: string): string | null {
  const setting = EDITABLE_SETTINGS[key];
  if (setting.type !== "int") return null;
  if (!/^-?\d+$/.test(text.trim())) return "Enter a whole number.";
  const value = Number(text);
  if (value < setting.min || value > setting.max) return `Between ${setting.min} and ${setting.max}.`;
  return null;
}

/**
 * The keys whose value changed, parsed for the API (`updateSettingsRequest.values`). Invalid number
 * fields are left out: check `intError` first.
 */
export function settingsDiff(saved: Record<string, number | boolean>, draft: SettingDraft): SettingValues {
  const changed: SettingValues = {};
  for (const key of SETTING_KEYS) {
    const value = draft[key];
    if (value === undefined) continue;
    if (typeof value === "boolean") {
      if (value !== saved[key]) changed[key] = value;
      continue;
    }
    if (intError(key, value) !== null) continue;
    const parsed = Number(value);
    if (parsed !== saved[key]) changed[key] = parsed;
  }
  return changed;
}
