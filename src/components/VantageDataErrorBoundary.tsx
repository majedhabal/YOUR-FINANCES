import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { withTranslation, WithTranslation } from 'react-i18next';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

class VantageDataErrorBoundaryClass extends Component<Props & WithTranslation, State> {
  constructor(props: Props & WithTranslation) {
    super(props);
    this.state = {
      hasError: false
    };
  }

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public static logWarning(message: string) {
    console.warn('[VantageDataErrorBoundary API Warning]:', message);
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Vantage Data Error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="w-full h-full min-h-[150px] flex flex-col items-center justify-center bg-luxury-grey/20 rounded-[2rem] border border-dashed border-neutral-800 p-6 text-center">
          <AlertCircle size={24} className="text-neutral-700 mb-2" />
          <span className="text-[10px] font-bold text-neutral-600 tracking-wide">{this.props.t('vantage_data_error_boundary.data_node_unavailable')}</span>
          <p className="text-[8px] text-neutral-500 mt-1 max-w-[150px]">{this.props.t('vantage_data_error_boundary.stream_sync_failed')}</p>
        </div>
      );
    }

    return this.props.children;
  }
}

export const logWarning = VantageDataErrorBoundaryClass.logWarning;

export const VantageDataErrorBoundary = withTranslation()(VantageDataErrorBoundaryClass);
