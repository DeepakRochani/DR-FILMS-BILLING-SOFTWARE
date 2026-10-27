import React from 'react';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught rendering error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onGoToBills) {
      this.props.onGoToBills();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-4">
          <div className="glass-card max-w-lg w-full p-6 sm:p-8 rounded-2xl border border-rose-500/30 text-center space-y-4 shadow-2xl bg-slate-900/90">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-display font-bold text-slate-100">
                Interface Recovered
              </h3>
              <p className="text-xs sm:text-sm text-slate-400">
                A rendering issue was prevented from blanking the screen. You can safely return to your bills list.
              </p>
            </div>

            {this.state.error?.message && (
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-mono text-rose-300 text-left overflow-x-auto max-h-28">
                {this.state.error.message}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition-colors shadow-lg shadow-amber-500/20 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Bills</span>
              </button>

              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs transition-colors border border-slate-700 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload App</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
