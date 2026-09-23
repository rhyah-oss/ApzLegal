import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() {
    // Deliberately omit exception messages and component state containing legal data.
    window.dispatchEvent(new Event("apz-render-error"));
  }
  render() {
    if (this.state.failed) return <main role="alert" className="p-8">
      <h1>Unable to display this page</h1>
      <p>Please reload the workspace. Unsaved changes may need to be entered again.</p>
      <button onClick={() => window.location.reload()}>Reload workspace</button>
    </main>;
    return this.props.children;
  }
}
