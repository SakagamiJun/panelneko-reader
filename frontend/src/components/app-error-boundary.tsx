import { Component, type ErrorInfo, type ReactNode } from "react";
import { i18n } from "@/lib/i18n";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("PanelNeko frontend crashed", error, errorInfo);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10 text-foreground">
        <section className="w-full max-w-xl rounded-3xl border border-danger/30 bg-card p-6 shadow-[0_18px_60px_rgba(18,39,74,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-danger">{i18n.t("app.title")}</p>
          <h1 className="mt-3 text-2xl font-black">{i18n.t("app.errorTitle")}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{i18n.t("app.errorDescription")}</p>
          <pre className="mt-4 overflow-auto rounded-2xl bg-muted px-4 py-3 text-xs text-foreground">
            {this.state.error.stack || this.state.error.message}
          </pre>
        </section>
      </main>
    );
  }
}
