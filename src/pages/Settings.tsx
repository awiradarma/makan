import { useState, type FormEvent } from 'react'
import { useProfile } from '@/contexts/ProfileContext'
import { useAuth } from '@/contexts/AuthContext'


export default function Settings() {
  const { user, signOut } = useAuth()
  const { profiles, activeProfile, createProfile, setActiveProfileId } = useProfile()
  const [showCreate, setShowCreate] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newCurrency, setNewCurrency] = useState<'USD' | 'IDR'>('USD')
  const [newTimezone, setNewTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  )
  const [creating, setCreating] = useState(false)

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!newLabel.trim()) return
    setCreating(true)
    try {
      await createProfile(newLabel.trim(), newCurrency, newTimezone)
      setNewLabel('')
      setShowCreate(false)
    } catch (err) {
      console.error('Create profile error:', err)
    }
    setCreating(false)
  }

  return (
    <div className="page-container flex-col gap-xl">
      <div className="section-header">
        <h2 className="section-title">Settings</h2>
      </div>

      {/* Account */}
      <div className="card flex-col gap-md">
        <div className="card__title">Account</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
          {user?.photoURL && (
            <img
              src={user.photoURL}
              alt=""
              style={{ width: 36, height: 36, borderRadius: '50%' }}
            />
          )}
          <div>
            <div style={{ fontWeight: 500 }}>{user?.displayName}</div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)' }}>
              {user?.email}
            </div>
          </div>
        </div>
        <button className="btn btn--danger" onClick={signOut}>
          Sign out
        </button>
      </div>

      {/* Profiles */}
      <div className="card flex-col gap-md">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card__title">Profiles</div>
          <button className="btn btn--ghost" onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? 'Cancel' : '+ New'}
          </button>
        </div>

        {showCreate && (
          <form onSubmit={handleCreate} className="flex-col gap-md" style={{
            padding: 'var(--spacing-lg)',
            background: 'var(--color-bg-primary)',
            borderRadius: 'var(--radius-md)',
          }}>
            <div className="form-group">
              <label className="form-label">Profile Name</label>
              <input
                className="form-input"
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g., Parents in Bogor"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Default Currency</label>
              <select
                className="form-select"
                value={newCurrency}
                onChange={(e) => setNewCurrency(e.target.value as 'USD' | 'IDR')}
              >
                <option value="USD">USD ($)</option>
                <option value="IDR">IDR (Rp)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Timezone</label>
              <input
                className="form-input"
                type="text"
                value={newTimezone}
                onChange={(e) => setNewTimezone(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="btn btn--primary btn--full"
              disabled={creating}
            >
              {creating ? 'Creating…' : 'Create Profile'}
            </button>
          </form>
        )}

        <div className="flex-col gap-sm">
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className="card"
              style={{
                cursor: 'pointer',
                borderColor: profile.id === activeProfile?.id
                  ? 'var(--color-accent)'
                  : undefined,
              }}
              onClick={() => setActiveProfileId(profile.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{profile.label}</div>
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)' }}>
                    {profile.default_currency} · {profile.timezone}
                  </div>
                </div>
                {profile.id === activeProfile?.id && (
                  <span className="tag">Active</span>
                )}
              </div>
              <div
                style={{
                  marginTop: 'var(--spacing-sm)',
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-tertiary)',
                  fontFamily: 'monospace',
                  background: 'var(--color-bg-secondary)',
                  padding: 'var(--spacing-xs) var(--spacing-sm)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--spacing-xs)'
                }}
              >
                <span>📧 {profile.inbound_token}@[your-domain.com]</span>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', marginTop: '4px', lineHeight: '1.4' }}>
                Forward receipts to this address. Ensure your domain's TXT record points to the webhook URL.
              </div>
            </div>
          ))}
        </div>

        {profiles.length === 0 && (
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 'var(--spacing-lg)' }}>
            No profiles yet. Create one to get started!
          </div>
        )}
      </div>
    </div>
  )
}
