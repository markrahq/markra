import { listen, type Event, type EventName, type Options } from "@tauri-apps/api/event";

type NativeEventHandler<TPayload> = (event: Event<TPayload>) => unknown;
type NativeEventCleanup = () => unknown;

export function safeNativeEventCleanup(cleanup: NativeEventCleanup): NativeEventCleanup {
  let cleaned = false;

  return async () => {
    if (cleaned) return;

    cleaned = true;
    try {
      await cleanup();
    } catch {
      // Tauri 2.11 can throw when a listener id was already removed natively.
    }
  };
}

export async function listenNativeEvent<TPayload>(
  event: EventName,
  handler: NativeEventHandler<TPayload>,
  options?: Options
): Promise<NativeEventCleanup> {
  const cleanup = options === undefined
    ? await listen<TPayload>(event, handler)
    : await listen<TPayload>(event, handler, options);

  return safeNativeEventCleanup(cleanup);
}
