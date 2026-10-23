import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { Layout } from "./components/Layout";
import { PageLoading } from "./components/ui";
import { useAuth } from "./lib/auth";
import { AuthPage } from "./pages/AuthPage";
import { EquipmentPage } from "./pages/EquipmentPage";
import { LibraryPage } from "./pages/LibraryPage";
import { NewWorkoutPage } from "./pages/NewWorkoutPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ProgramPage } from "./pages/ProgramPage";
import { ProgramsPage } from "./pages/ProgramsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TodayPage } from "./pages/TodayPage";
import { WorkoutPage } from "./pages/WorkoutPage";

// Charts are the heaviest dependency; load them only on the Progress page.
const ProgressPage = lazy(() => import("./pages/ProgressPage").then((m) => ({ default: m.ProgressPage })));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth();
  const location = useLocation();
  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (loading) return <PageLoading />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/signup" element={<AuthPage mode="signup" />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<TodayPage />} />
        <Route path="workouts/:id" element={<WorkoutPage />} />
        <Route path="programs" element={<ProgramsPage />} />
        <Route path="programs/new" element={<NewWorkoutPage />} />
        <Route path="programs/:id" element={<ProgramPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="library/equipment/:id" element={<EquipmentPage />} />
        <Route
          path="progress"
          element={
            <Suspense fallback={<PageLoading />}>
              <ProgressPage />
            </Suspense>
          }
        />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
