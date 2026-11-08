"use client";

import * as React from "react";
import type { MeResponse } from "@/lib/types";

interface UserContextValue {
  me: MeResponse;
  setMe: React.Dispatch<React.SetStateAction<MeResponse>>;
  refreshMe: () => Promise<void>;
}

const UserContext = React.createContext<UserContextValue | null>(null);

export function UserProvider({
  initialMe,
  children,
}: {
  initialMe: MeResponse;
  children: React.ReactNode;
}) {
  const [me, setMe] = React.useState<MeResponse>(initialMe);

  const refreshMe = React.useCallback(async () => {
    try {
      const response = await fetch("/api/me", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) return;
      const payload = (await response.json()) as MeResponse;
      setMe(payload);
    } catch {
      // A background refresh failure should not interrupt the current view.
    }
  }, []);

  React.useEffect(() => {
    const handler = () => void refreshMe();
    window.addEventListener("mycloud:changed", handler);
    return () => window.removeEventListener("mycloud:changed", handler);
  }, [refreshMe]);

  return (
    <UserContext.Provider value={{ me, setMe, refreshMe }}>{children}</UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  const context = React.useContext(UserContext);
  if (!context) throw new Error("useUser must be used inside UserProvider");
  return context;
}
