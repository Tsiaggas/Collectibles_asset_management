import React from 'react';

type State = { hasError: boolean; error?: Error };

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error('UI ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-center">
          <div className="mb-2 text-lg font-semibold">Κάτι πήγε στραβά</div>
          <div className="text-sm text-gray-500">{this.state.error?.message}</div>
          <button className="btn mt-4" onClick={() => location.reload()}>Ανανέωση</button>
        </div>
      );
    }
    return this.props.children as React.ReactElement;
  }
}


