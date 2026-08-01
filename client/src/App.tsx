import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { HomeScreen } from "./screens/HomeScreen.js";
import { LoginScreen } from "./screens/LoginScreen.js";
import { useAuthStore } from "./store/authStore.js";

export function App() {
  const { status, restore } = useAuthStore();

  useEffect(() => {
    if (status === "restoring") void restore();
  }, [status, restore]);

  if (status === "restoring") {
    return (
      <main className="flex min-h-full items-center justify-center text-white/60">
        Unwrapping…
      </main>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={status === "signedIn" ? <Navigate to="/" replace /> : <LoginScreen />}
      />
      <Route
        path="/"
        element={status === "signedIn" ? <HomeScreen /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
