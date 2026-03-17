import * as React from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<any, any> {
  constructor(props: any) {
    super(props);
    (this as any).state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if ((this as any).state.hasError) {
      let errorMessage = 'Terjadi kesalahan yang tidak terduga.';
      try {
        const parsedError = JSON.parse((this as any).state.error?.message || '');
        if (parsedError.error && parsedError.error.includes('insufficient permissions')) {
          errorMessage = 'Anda tidak memiliki izin untuk melakukan operasi ini.';
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center border border-stone-200">
            <div className="w-20 h-20 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-10 h-10 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-stone-900 mb-2">Ups! Ada Masalah</h2>
            <p className="text-stone-500 mb-8">{errorMessage}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full flex items-center justify-center gap-3 bg-stone-900 hover:bg-stone-800 text-white font-semibold py-4 px-6 rounded-2xl transition-all shadow-lg"
            >
              <RefreshCcw className="w-5 h-5" />
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

export default ErrorBoundary;
