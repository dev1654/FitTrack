import { Button, PageTitle, Panel } from "../components/ui";
import { API_URL } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useUpdateUnit } from "../lib/queries";

export function SettingsPage() {
  const { user, unit, logOut } = useAuth();
  const updateUnit = useUpdateUnit();

  return (
    <div className="max-w-xl space-y-8">
      <PageTitle>Settings</PageTitle>

      <Panel className="px-5 py-5">
        <h2 className="font-semibold">Weight unit</h2>
        <p className="mt-1 text-sm text-ink-2">
          Changes how weights are shown and entered. Your history is stored once and converts
          automatically.
        </p>
        <div role="radiogroup" aria-label="Weight unit" className="mt-4 inline-flex rounded-md border border-rule p-1">
          {(["kg", "lb"] as const).map((u) => (
            <button
              key={u}
              role="radio"
              aria-checked={unit === u}
              disabled={updateUnit.isPending}
              onClick={() => unit !== u && updateUnit.mutate(u)}
              className={`h-9 w-20 rounded font-semibold ${unit === u ? "bg-accent text-accent-ink" : "text-ink-2 hover:text-ink"}`}
            >
              {u === "kg" ? "Kilograms" : "Pounds"}
            </button>
          ))}
        </div>
        {updateUnit.isError ? <p className="mt-2 text-sm text-danger">{updateUnit.error.message}</p> : null}
      </Panel>

      <Panel className="px-5 py-5">
        <h2 className="font-semibold">Account</h2>
        <p className="mt-1 text-ink-2">{user?.email}</p>
        <Button className="mt-4" onClick={logOut}>
          Log out
        </Button>
      </Panel>

      <p className="text-sm text-ink-3">
        Exercise data from <a className="underline" href="https://wger.de">wger</a>, licensed CC-BY-SA 4.0.
        API: {API_URL.replace(/^https?:\/\//, "")}
      </p>
    </div>
  );
}
