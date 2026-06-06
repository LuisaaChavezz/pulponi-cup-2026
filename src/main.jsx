import React, { Component } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import './layout-dashboard.css';
import './avatars-global.css';
import './pulponi-player-card.css';
import './ranking-leaderboard.css';
import './home-dashboard.css';
import './navigation.css';

class RootErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(err) {
    return { error: err };
  }

  componentDidCatch(error, info) {
    console.error('[RootErrorBoundary]', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-fallback app-fallback--error">
          <div className="app-fallback__box">
            <p className="app-fallback__eyebrow">Pulponi Cup 2026</p>
            <h1 className="app-fallback__title">Algo falló al cargar la app</h1>
            <p className="app-fallback__msg">{String(this.state.error?.message ?? this.state.error)}</p>
            <button type="button" className="primary" onClick={() => window.location.reload()}>
              Recargar página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
