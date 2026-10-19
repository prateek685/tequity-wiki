import { EDITABLE_SETTINGS, type SettingKey, SETTING_KEYS, type SettingsResponse } from "@portal/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Kpi } from "@/components/ui/kpi";
import { Notice, PageHeader } from "@/components/ui/page-header";
import { Switch } from "@/components/ui/switch";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { adminKeys, settingsQuery, updateSettings } from "@/features/admin/queries";
import { draftFrom, intError, type SettingDraft, settingsDiff } from "@/features/admin/settings";
import { AdminPasswordCard } from "@/features/auth/admin-password-card";
import { ApiError, errorMessage } from "@/lib/api";
import { pageTitle } from "@/lib/title";

/** Admin Settings (final mockup `settings()`): the editable rules and the AI scorer's state. */
export const Route = createFileRoute("/admin/settings")({
  head: () => pageTitle("Settings"),
  component: function SettingsPage() {
    const settings = useQuery(settingsQuery);
    return (
      <>
        <PageHeader
          title="Settings"
          description="Rules that apply to everyone. Every change is recorded in the audit log."
        />
        {settings.isPending ? (
          <p role="status" className="text-sm text-muted">
            Loading settings…
          </p>
        ) : settings.isError ? (
          <Notice tone="warning">{errorMessage(settings.error)}</Notice>
        ) : (
          <>
            <AiScoring ai={settings.data.ai} />
            <SettingsForm values={settings.data.values} />
          </>
        )}
        <AdminPasswordCard />
      </>
    );
  },
});

function AiScoring({ ai }: { ai: SettingsResponse["ai"] }) {
  return (
    <Card>
      <CardHeader
        title="AI scoring"
        aside={
          ai.mode === "anthropic" ? (
            <Badge tone="neutral">Anthropic</Badge>
          ) : ai.mode === "fake" ? (
            <Badge tone="warning" dot>
              Test scorer (no key set)
            </Badge>
          ) : (
            <Badge tone="danger" dot>
              Off
            </Badge>
          )
        }
      />
      <CardBody>
        {ai.mode === "anthropic" ? (
          <p className="text-sm text-fg-2">
            Written answers are scored by <b className="font-medium">{ai.model}</b>.
          </p>
        ) : ai.mode === "fake" ? (
          <Notice tone="warning">
            Test scorer: no Anthropic key is set, so answers get made-up scores. Development only.
          </Notice>
        ) : (
          <Notice tone="danger">Off: no key set. Answers wait as “Being scored” until a key is added.</Notice>
        )}
        <div className="grid grid-cols-2 gap-3 md:max-w-md">
          <Kpi label="Pending" value={ai.pending} sub="waiting for the scorer" />
          <Kpi
            label="Failed"
            value={ai.failed > 0 ? <span className="text-danger">{ai.failed}</span> : ai.failed}
            sub="gave up after retries"
          />
        </div>
      </CardBody>
    </Card>
  );
}

function SettingsForm({ values }: { values: SettingsResponse["values"] }) {
  const [draft, setDraft] = useState<SettingDraft>(() => draftFrom(values));
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();
  const changed = settingsDiff(values, draft);
  const localErrors = Object.fromEntries(
    SETTING_KEYS.map((key) => {
      const value = draft[key];
      return [key, typeof value === "string" ? intError(key, value) : null];
    }),
  ) as Record<SettingKey, string | null>;
  const hasErrors = Object.values(localErrors).some((error) => error !== null);
  const save = useMutation({
    mutationFn: () => updateSettings({ values: changed }),
    onSuccess: async () => {
      const count = Object.keys(changed).length;
      setMessage(`Saved ${count} ${count === 1 ? "setting" : "settings"}.`);
      await queryClient.invalidateQueries({ queryKey: adminKeys.settings });
    },
  });
  const serverFields = save.error instanceof ApiError ? (save.error.body.fields ?? {}) : {};
  const fieldError = (key: SettingKey): string | undefined =>
    localErrors[key] ?? serverFields[key] ?? serverFields[`values.${key}`];
  const update = (key: SettingKey, value: string | boolean) => {
    setMessage("");
    save.reset();
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const nothingChanged = Object.keys(changed).length === 0;
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!hasErrors && !nothingChanged) save.mutate();
      }}
    >
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Setting</Th>
              <Th>Value</Th>
            </tr>
          </thead>
          <tbody>
            {SETTING_KEYS.map((key) => {
              const setting = EDITABLE_SETTINGS[key];
              const value = draft[key];
              const id = `setting-${key.replace(".", "-")}`;
              const error = fieldError(key);
              const help = "help" in setting ? setting.help : undefined;
              return (
                <Tr key={key}>
                  <Td label="Setting" lead>
                    <label htmlFor={id} className="font-medium">
                      {setting.label}
                    </label>
                    {help ? (
                      <span id={`${id}-help`} className="block text-xs font-normal text-muted">
                        {help}
                      </span>
                    ) : null}
                  </Td>
                  <Td label="Value" stack>
                    {setting.type === "bool" ? (
                      <span className="flex items-center gap-2">
                        <Switch
                          id={id}
                          checked={value === true}
                          aria-describedby={help ? `${id}-help` : undefined}
                          disabled={value === undefined}
                          onCheckedChange={(checked) => {
                            update(key, checked);
                          }}
                        />
                        <span className="text-sm text-fg-2">{value === true ? "On" : "Off"}</span>
                      </span>
                    ) : (
                      <span className="flex flex-col gap-1">
                        <span className="flex items-center gap-2">
                          <Input
                            id={id}
                            type="number"
                            inputMode="numeric"
                            min={setting.min}
                            max={setting.max}
                            step={1}
                            value={typeof value === "string" ? value : ""}
                            disabled={value === undefined}
                            aria-invalid={error ? true : undefined}
                            aria-describedby={error ? `${id}-error` : undefined}
                            className="w-24 tabular-nums"
                            onChange={(event) => {
                              update(key, event.target.value);
                            }}
                          />
                          <span className="text-sm text-muted">{setting.unit}</span>
                        </span>
                        {error ? (
                          <span id={`${id}-error`} role="alert" className="text-xs text-danger">
                            {error}
                          </span>
                        ) : null}
                      </span>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line p-4">
          {message ? (
            <span role="status" className="text-sm text-fg-2">
              {message}
            </span>
          ) : save.isError && Object.keys(serverFields).length === 0 ? (
            <span role="alert" className="text-sm text-danger">
              {errorMessage(save.error)}
            </span>
          ) : null}
          <Button type="submit" variant="primary" disabled={hasErrors || nothingChanged || save.isPending}>
            {save.isPending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </Card>
    </form>
  );
}
