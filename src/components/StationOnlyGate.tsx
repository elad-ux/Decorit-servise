import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { isStationOnly, myPermissions } from "../lib/permissions";

type GateState = "checking" | "station-only" | "ok";

/**
 * Layout route for every page outside the cutting module. A cutter (a user
 * whose whole access is the cutting workstation) is sent straight to
 * /cutting/station instead of the module hub, and can't wander into other
 * modules by typing a URL. Everyone else passes through untouched.
 *
 * If the permission lookup fails we let the user through: this gate only
 * decides what is *shown*; the server rejects calls the user isn't allowed
 * to make, so failing open here can't expose any data.
 */
export default function StationOnlyGate() {
  const { session } = useAuth();
  const token = session?.sessionToken;
  const isAdmin = session?.role === "admin";
  const [state, setState] = useState<GateState>(isAdmin ? "ok" : "checking");

  useEffect(() => {
    if (!token || isAdmin) {
      setState("ok");
      return;
    }
    let cancelled = false;
    setState("checking");
    myPermissions(token)
      .then((keys) => {
        if (!cancelled) setState(isStationOnly(keys) ? "station-only" : "ok");
      })
      .catch(() => {
        if (!cancelled) setState("ok");
      });
    return () => {
      cancelled = true;
    };
  }, [token, isAdmin]);

  if (state === "checking") return null;
  if (state === "station-only") return <Navigate to="/cutting/station" replace />;
  return <Outlet />;
}
