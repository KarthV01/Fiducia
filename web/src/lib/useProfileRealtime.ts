import { useEffect, useRef } from "react";
import { connectProfileRealtime } from "./realtime";
import type { RealtimeEvent } from "./types";

export function useProfileRealtime(identityId: string, onEvent: (event: RealtimeEvent) => void) {
  const listener = useRef(onEvent);
  const connection = useRef<ReturnType<typeof connectProfileRealtime> | null>(null);
  useEffect(() => { listener.current = onEvent; }, [onEvent]);
  useEffect(() => {
    const subscription = connectProfileRealtime(identityId, (event) => listener.current(event));
    connection.current = subscription;
    return () => { subscription.close(); connection.current = null; };
  }, [identityId]);
  return connection;
}
