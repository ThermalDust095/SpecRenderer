interface VsCodeApi<State> {
  postMessage(message: unknown): void;
  getState(): State | undefined;
  setState(state: State): void;
}

declare function acquireVsCodeApi<State>(): VsCodeApi<State>;

/** Typed wrapper around the webview ↔ host messaging API. */
export function connect<Outgoing, Incoming, State = unknown>(
  onMessage: (message: Incoming) => void,
) {
  const api = acquireVsCodeApi<State>();
  window.addEventListener("message", (event: MessageEvent<Incoming>) => onMessage(event.data));
  return {
    post: (message: Outgoing) => api.postMessage(message),
    getState: () => api.getState(),
    setState: (state: State) => api.setState(state),
  };
}
