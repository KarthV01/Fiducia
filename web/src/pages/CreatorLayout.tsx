import { Outlet, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useResource } from "../lib/useResource";
import { writeSession } from "../lib/session";
import { AppShell } from "../ui/AppShell";
import { useEffect } from "react";

export function CreatorLayout() {
  const { creatorId = "" } = useParams();
  const { data } = useResource(`creator-shell-${creatorId}`, () => api.creatorDashboard(creatorId));
  const creator = data?.creator;

  useEffect(() => {
    if (creatorId) {
      writeSession({ role: "creator", id: creatorId });
    }
  }, [creatorId]);

  return (
    <AppShell
      accountLabel={creator?.displayName ?? "Creator"}
      accountMeta={creator?.handle}
      currentSession={{ role: "creator", id: creatorId }}
      nav={[
        { to: `/creator/${creatorId}`, label: "Home" },
        { to: `/creator/${creatorId}/contracts`, label: "Contracts" },
        { to: `/creator/${creatorId}/network`, label: "My Network" },
        { to: `/creator/${creatorId}/messages`, label: "Messaging" },
        { to: `/creator/${creatorId}/earnings`, label: "Earnings" },
        { to: `/creator/${creatorId}/wallets`, label: "Wallets" },
      ]}
    >
      <Outlet />
    </AppShell>
  );
}
