import { useState } from 'react';
import { supabase } from '../lib/supabase';

const SIGNUP_SUCCESS_MSG =
  'Te enviamos un correo de verificación. Revisa tu bandeja de entrada.';

export default function AuthPage() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  function switchMode(next) {
    setMode(next);
    setError('');
    setSuccess('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else {
        const { data, error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        if (data.user) {
          const { error: profileErr } = await supabase.from('profiles').upsert({
            id: data.user.id,
            name: name || null,
            username: username?.toLowerCase() || null,
          });
          if (profileErr) throw profileErr;
        }
        setSuccess(SIGNUP_SUCCESS_MSG);
      }
    } catch (err) {
      setError(err.message ?? 'Error de autenticación');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <span className="eyebrow">🐙 Pulponi Cup 2026</span>
        <h2>{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</h2>
        <div className="auth-tabs">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>
            Login
          </button>
          <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => switchMode('signup')}>
            Registro
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <>
              <input placeholder="Nombre completo" value={name} onChange={(e) => setName(e.target.value)} />
              <input
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </>
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="primary" disabled={loading} style={{ width: '100%', marginTop: 8 }}>
            {loading ? 'Cargando…' : mode === 'login' ? 'Entrar' : 'Registrarse'}
          </button>
        </form>
        {success && <p className="auth-success">{success}</p>}
      </div>
    </div>
  );
}
