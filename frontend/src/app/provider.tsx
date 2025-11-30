"use client";

import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { config } from "../lib/wagmi";
import { WagmiProvider } from "wagmi";
import RecoilProvider from "../userstate/RecoilProvider";
import { MiniKitContextProvider } from "../providers/MiniKitProvider";
import { ThirdwebProvider } from "thirdweb/react";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

const queryClient = new QueryClient();
const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL || "http://127.0.0.1:3210");

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <ConvexProvider client={convex}>
        <RecoilProvider>
          <ThirdwebProvider>
            <WagmiProvider config={config}>
              <MiniKitContextProvider>{children}</MiniKitContextProvider>
            </WagmiProvider>
          </ThirdwebProvider>
        </RecoilProvider>
      </ConvexProvider>
    </QueryClientProvider>
  );
}
