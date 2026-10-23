import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { AuthProvider } from "../lib/auth";
import { AuthPage } from "../pages/AuthPage";
import { WorkoutPage } from "../pages/WorkoutPage";

type Handler = (url: URL, init: RequestInit & { body?: string }) => unknown;

/** Minimal fake API: routes "METHOD /path" to handlers; records every request. */
function mockApi(routes: Record<string, Handler>) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: Request | string, init?: RequestInit) => {
      // openapi-fetch passes a Request; it may come from another realm than jsdom's.
      const isReq = typeof input === "object" && input !== null && "url" in input;
      const method = (isReq ? input.method : init?.method ?? "GET").toUpperCase();
      const url = new URL(isReq ? input.url : String(input));
      const body = method === "GET" ? undefined : isReq ? await input.text() : String(init?.body ?? "");
      const req = { method };
      calls.push({ method: req.method, path: url.pathname, body: body ? JSON.parse(body) : undefined });
      const key = Object.keys(routes).find((k) => {
        const [m, pattern] = k.split(" ");
        return m === req.method && new RegExp(`^${pattern.replace(/\{\w+\}/g, "[^/]+")}$`).test(url.pathname);
      });
      if (!key) return new Response(JSON.stringify({ detail: "Not found" }), { status: 404 });
      const result = routes[key](url, { body } as RequestInit & { body?: string });
      if (result instanceof Response) return result;
      return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
  return calls;
}

function renderAt(path: string, routes: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <Routes>{routes}</Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const ME = { id: 1, email: "dev@example.com", unit_pref: "kg", created_at: "2026-10-01T00:00:00Z" };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("log in", () => {
  it("shows the server's error, then signs in", async () => {
    let attempt = 0;
    const calls = mockApi({
      "POST /auth/login": () =>
        ++attempt === 1
          ? new Response(JSON.stringify({ detail: "Incorrect email or password" }), { status: 401 })
          : { access_token: "tok", token_type: "bearer" },
      "GET /auth/me": () => ME,
    });
    renderAt(
      "/login",
      <>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/" element={<p>Home</p>} />
      </>,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "dev@example.com");
    await user.type(screen.getByLabelText("Password"), "wrongpass1");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password");

    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByText("Home")).toBeInTheDocument();
    expect(localStorage.getItem("fittrack.token")).toBe("tok");
    expect(calls.filter((c) => c.path === "/auth/login")[0].body).toEqual({
      email: "dev@example.com",
      password: "wrongpass1",
    });
  });
});

describe("workout screen", () => {
  it("prefills the suggested target, shows the plates, and logs a set in kg", async () => {
    localStorage.setItem("fittrack.token", "tok");
    let sets: unknown[] = [];
    const calls = mockApi({
      "GET /auth/me": () => ME,
      "GET /sessions/{id}": () => ({ id: 7, date: "2026-10-20", notes: null, template_id: 3, created_at: "", sets }),
      "GET /templates/{id}": () => ({
        id: 3, name: "StrongLifts 5x5: Workout A", description: null, category: "StrongLifts 5x5", is_builtin: true,
        exercises: [{ id: 1, position: 1, target_sets: 5, target_reps: 5, exercise: { id: 10, name: "Barbell Back Squat", muscle_group: "quads", category: "strength" } }],
      }),
      "GET /exercises/{id}/last": () => ({
        exercise_id: 10, last_date: "2026-10-17",
        sets: [1, 2, 3, 4, 5].map((n) => ({ set_number: n, reps: 5, weight_kg: 100, duration_seconds: null, distance_m: null })),
        suggestion: { weight_kg: 105, reps: 5, reason: "Every set hit 5 reps at 100 kg, so add 5 kg." },
      }),
      "GET /exercises/{id}": () => ({ id: 10, name: "Barbell Back Squat", muscle_group: "quads", category: "strength", instructions: null, equipment: { id: 1, name: "Barbell", type: "free_weight" } }),
      "POST /sessions/{id}/sets": (_u, init) => {
        const body = JSON.parse(init.body!);
        sets = [{ id: 99, duration_seconds: null, distance_m: null, ...body }];
        return sets[0];
      },
    });

    renderAt("/workouts/7", <Route path="/workouts/:id" element={<WorkoutPage />} />);

    expect(await screen.findByRole("heading", { name: "StrongLifts 5x5: Workout A" })).toBeInTheDocument();
    expect(await screen.findByText("100 kg: 5, 5, 5, 5, 5")).toBeInTheDocument();
    // 105 kg on a 20 kg bar = 25 + 15 + 2.5 per side
    expect(screen.getByRole("img", { name: "Per side: 25 + 15 + 2.5 kg, on a 20 kg bar" })).toBeInTheDocument();

    const weight = await screen.findByLabelText("Set 1 weight in kg");
    await waitFor(() => expect(weight).toHaveValue(105));
    expect(screen.getByLabelText("Set 1 reps")).toHaveValue(5);
    expect(screen.getAllByRole("button", { name: "Log" })).toHaveLength(5);

    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "Log" })[0]);

    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toEqual({
        exercise_id: 10, set_number: 1, reps: 5, weight_kg: 105,
      }),
    );
    expect(await screen.findByRole("timer")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Log" })).toHaveLength(4));
    const table = screen.getByRole("table");
    expect(within(table).getByText("Set 1, logged")).toBeInTheDocument();
  });
});
