import { EDITABLE_SETTINGS, SETTING_KEYS, type SettingKey } from "@portal/contracts";

/** Admin Settings screen (packages/contracts/src/admin.ts "Settings"). Pure. */

export type SettingValue = number | boolean;

export function isSettingKey(key: string): key is SettingKey {
  return (SETTING_KEYS as readonly string[]).includes(key);
}

/** The stored value when it fits the setting's type and range, else the default. */
export function settingValue(key: SettingKey, stored: unknown, fallback: SettingValue): SettingValue {
  return settingProblem(key, stored) === null ? (stored as SettingValue) : fallback;
}

/** Why a value doesn't fit the setting (a message for the form), or null. */
export function settingProblem(key: SettingKey, value: unknown): string | null {
  const setting: { type: "int" | "bool"; min?: number; max?: number } = EDITABLE_SETTINGS[key];
  if (setting.type === "bool") return typeof value === "boolean" ? null : "Choose on or off.";
  const min = setting.min ?? 0;
  const max = setting.max ?? Number.MAX_SAFE_INTEGER;
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? null
    : `Use a whole number from ${min} to ${max}.`;
}

/** Field → message for every unknown key or value that doesn't fit; empty when all are fine. */
export function settingsProblems(values: Readonly<Record<string, unknown>>): Record<string, string> {
  const problems: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    const problem = isSettingKey(key) ? settingProblem(key, value) : "This setting can't be changed here.";
    if (problem) problems[`values.${key}`] = problem;
  }
  return problems;
}
