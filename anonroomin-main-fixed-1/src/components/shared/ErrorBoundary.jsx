/**
 * ============================================================================
 * ERROR BOUNDARY — last line of defense against the "black screen" bug
 * ============================================================================
 * WHY THIS EXISTS:
 * Nothing anywhere in this app previously caught render-time errors. React's
 * default behavior when a component throws during render (or in a lifecycle/
 * effect that runs synchronously as part of a commit) is to unmount the
 * ENTIRE tree all the way up to the nearest boundary — and since there was no
 * boundary, that meant all the way up to <App/>. Once the whole tree
 * unmounts, `#root` is empty, and the visitor is left staring straight at the
 * dark theme's plain `<body>` background (see main.jsx's dark-by-default
 * theme bootstrap) — which is exactly what a "random black screen" looks
 * like. This happened on GroupChat, DirectMessages, and effectively any page
 * because a single bad realtime payload, a null profile field, a malformed
 * message row, etc. anywhere in a fairly large render tree was enough to
 * take the whole app down with zero visible error and no way to recover
 * short of a manual reload.
 *
 * This wraps the app (see main.jsx) so a crash in one screen shows a small
 * recoverable card instead of a blank void, and logs the real error to the
 * console so it's actually debuggable instead of silently vanishing.
 * ============================================================================
 */
import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Surface it loudly in the console/telemetry rather than letting it
    // disappear along with the unmounted tree.
    console.error('[ErrorBoundary] caught a render error:', error, info?.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: 24,
            textAlign: 'center',
            background: 'var(--bg, #0b0b0f)',
            color: 'var(--paper, #fff)',
            zIndex: 999999,
          }}
        >
          <div style={{ fontSize: 40 }}>⚠️</div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>Something went wrong</div>
          <div style={{ fontSize: 14, opacity: 0.7, maxWidth: 320 }}>
            This screen hit an unexpected error. You can try again, or go back
            and reopen it.
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={this.handleRetry}
              style={{
                padding: '10px 20px',
                borderRadius: 20,
                border: 'none',
                background: 'var(--ember, #ff5a3c)',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 20px',
                borderRadius: 20,
                border: '1px solid rgba(255,255,255,0.25)',
                background: 'transparent',
                color: 'inherit',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reload app
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
