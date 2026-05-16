import { useState } from 'react';
import { isLogoAvatar, isPresetAvatar, PRESET_AVATARS } from '../lib/avatars';

export default function AvatarSelector({ currentPhotoUrl, onSelect }) {
  const [savingId, setSavingId] = useState(null);
  const [toast, setToast] = useState('');

  async function handleSelect(avatar) {
    setSavingId(avatar.id);
    setToast('');
    const error = await onSelect(avatar.src);
    setSavingId(null);
    if (error) {
      console.error('[avatar select]', error);
      alert(`Error al guardar el avatar: ${error.message}`);
      return;
    }
    setToast('Avatar actualizado ✅');
    window.setTimeout(() => setToast(''), 2800);
  }

  return (
    <section className="avatar-selector-section" aria-labelledby="avatar-selector-title">
      <div className="avatar-selector-head">
        <h3 id="avatar-selector-title">Elegir avatar</h3>
        <p>Pulponi presets o tu foto arriba.</p>
      </div>
      <div className="avatar-grid">
        {PRESET_AVATARS.map((avatar) => {
          const selected = isPresetAvatar(currentPhotoUrl, avatar.src);
          const saving = savingId === avatar.id;
          return (
            <button
              key={avatar.id}
              type="button"
              className={`avatar-option${selected ? ' is-selected' : ''}${saving ? ' is-saving' : ''}`}
              onClick={() => handleSelect(avatar)}
              disabled={!!savingId}
              aria-pressed={selected}
              aria-label={avatar.label}
              title={avatar.label}
            >
              <span
                className={`avatar-option-frame${isLogoAvatar(avatar.src) ? ' avatar-option-frame--logo' : ''}`}
              >
                <img src={avatar.src} alt="" />
              </span>
              <span className="avatar-option-label">{avatar.label}</span>
            </button>
          );
        })}
      </div>
      {toast ? (
        <p className="avatar-toast" role="status">
          {toast}
        </p>
      ) : null}
    </section>
  );
}
