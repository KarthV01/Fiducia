import { useEffect } from "react";
import { Outlet, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { truncateAddress } from "../lib/format";
import { writeSession } from "../lib/session";
import { useResource } from "../lib/useResource";
import { AppShell } from "../ui/AppShell";

export function SponsorLayout() {
  const { sponsorId = "" } = useParams();
  const { data } = useResource(`sponsor-shell-${sponsorId}`, () => api.brandDashboard(sponsorId));
  const sponsor = data?.sponsor;

  useEffect(() => {
    if (sponsor) {
      writeSession({ role: "sponsor", id: sponsor.id });
    }
  }, [sponsor]);

  return (
    <AppShell
      accountLabel={sponsor?.name ?? "Sponsor"}
      accountMeta={sponsor ? truncateAddress(sponsor.walletAddress) : undefined}
      currentSession={{ role: "sponsor", id: sponsor?.id ?? sponsorId }}
      nav={[
        { to: `/sponsor/${sponsorId}`, label: "Home" },
        { to: `/sponsor/${sponsorId}/contracts`, label: "Contracts" },
        { to: `/sponsor/${sponsorId}/network`, label: "My Network" },
        { to: `/sponsor/${sponsorId}/contracts/new`, label: "New contract" },
      ]}
    >
      <Outlet />
    </AppShell>
  );
}
