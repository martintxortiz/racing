"use client";
import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; resetKey: string };
type State = { error: Error | null; key: string };

/** Keeps one failing widget from taking down the workspace. */
export class PanelBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" style={{ padding: 12, color: "var(--fg-muted)", fontSize: 12 }}>
        This panel failed to render: {this.state.error.message}
      </div>
    );
  }
}
