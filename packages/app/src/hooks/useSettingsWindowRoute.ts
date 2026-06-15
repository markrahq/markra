import { useEffect, useState } from "react";

function isSettingsWindowRoute() {
  return new URLSearchParams(window.location.search).has("settings");
}

export function useSettingsWindowRoute() {
  const [isSettingsRoute, setIsSettingsRoute] = useState(isSettingsWindowRoute);

  useEffect(() => {
    const handleRouteChange = () => {
      setIsSettingsRoute(isSettingsWindowRoute());
    };

    window.addEventListener("popstate", handleRouteChange);

    return () => {
      window.removeEventListener("popstate", handleRouteChange);
    };
  }, []);

  return isSettingsRoute;
}
