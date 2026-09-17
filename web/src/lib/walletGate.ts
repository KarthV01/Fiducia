import { createContext, useContext } from "react";

export const WalletGateContext = createContext<boolean | undefined>(undefined);

export function useWalletGate() {
  return useContext(WalletGateContext);
}
