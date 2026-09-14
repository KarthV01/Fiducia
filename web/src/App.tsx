import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { readSession } from "./lib/session";
import { EntryPage } from "./pages/Entry";
import { AccountAccess, AccountsPage, NewAccountPage, SignInPage } from "./pages/Accounts";
import { CreatorLayout } from "./pages/CreatorLayout";
import { SponsorLayout } from "./pages/SponsorLayout";
import { CreatorContractDetailPage } from "./pages/creator/ContractDetail";
import { CreatorContractsPage } from "./pages/creator/Contracts";
import { CreatorEarningsPage } from "./pages/creator/Earnings";
import { CreatorHomePage } from "./pages/creator/Home";
import { SponsorContractDetailPage } from "./pages/sponsor/ContractDetail";
import { SponsorContractsPage } from "./pages/sponsor/Contracts";
import { SponsorHomePage } from "./pages/sponsor/Home";
import { NewContractPage } from "./pages/sponsor/NewContract";
import { NetworkPage } from "./pages/Network";
import { MessagingPage } from "./pages/Messaging";
import { CreatorWalletsPage } from "./pages/creator/Wallets";

function CreatorLegacyDealRedirect() {
  const { creatorId = "" } = useParams();
  return <Navigate to={`/creator/${creatorId}/contracts`} replace />;
}

function CreatorLegacyDealDetailRedirect() {
  const { creatorId = "", id = "" } = useParams();
  return <Navigate to={`/creator/${creatorId}/contracts/${id}`} replace />;
}

function SponsorLegacyRedirect() {
  const session = readSession();
  return <Navigate to={session?.role === "sponsor" ? `/sponsor/${session.id}` : "/"} replace />;
}

function SponsorCreatorsRedirect() {
  const { sponsorId = "" } = useParams();
  return <Navigate to={`/sponsor/${sponsorId}/network`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<EntryPage />} />
      <Route path="/login" element={<SignInPage />} />
      <Route element={<AccountAccess />}>
      <Route path="/accounts" element={<AccountsPage />} />
      <Route path="/accounts/new" element={<NewAccountPage />} />
      <Route path="/sponsor" element={<SponsorLegacyRedirect />} />
      <Route path="/sponsor/:sponsorId" element={<SponsorLayout />}>
        <Route index element={<SponsorHomePage />} />
        <Route path="contracts" element={<SponsorContractsPage />} />
        <Route path="contracts/new" element={<NewContractPage />} />
        <Route path="contracts/:id" element={<SponsorContractDetailPage />} />
        <Route path="creators" element={<SponsorCreatorsRedirect />} />
        <Route path="network" element={<NetworkPage />} />
        <Route path="messages" element={<MessagingPage />} />
      </Route>
      <Route path="/creator/:creatorId" element={<CreatorLayout />}>
        <Route index element={<CreatorHomePage />} />
        <Route path="contracts" element={<CreatorContractsPage />} />
        <Route path="contracts/:id" element={<CreatorContractDetailPage />} />
        <Route path="deals" element={<CreatorLegacyDealRedirect />} />
        <Route path="deals/:id" element={<CreatorLegacyDealDetailRedirect />} />
        <Route path="earnings" element={<CreatorEarningsPage />} />
        <Route path="wallets" element={<CreatorWalletsPage />} />
        <Route path="network" element={<NetworkPage />} />
        <Route path="messages" element={<MessagingPage />} />
      </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
