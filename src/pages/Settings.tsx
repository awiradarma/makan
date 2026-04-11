import { useState, type FormEvent } from 'react'
import { useProfile } from '@/contexts/ProfileContext'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'react-hot-toast'
import pkg from '../../package.json'


export default function Settings() {
  const { user, signOut } = useAuth()
  const { profiles, activeProfile, createProfile, setActiveProfileId, updateProfile, deleteProfile } = useProfile()
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
              
              {profile.id === activeProfile?.id && (
                <div className="flex-col gap-sm" style={{ marginTop: 'var(--spacing-md)', paddingTop: 'var(--spacing-md)', borderTop: '1px solid var(--color-border)' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>Distance Unit</label>
                    <div className="flex-row gap-sm">
                      <button
                        type="button"
                        className={`btn ${profile.distance_unit !== 'us' ? 'btn--primary' : 'btn--secondary'}`}
                        style={{ flex: 1, padding: 'var(--spacing-xs) var(--spacing-sm)', fontSize: 'var(--font-size-sm)' }}
                        onClick={(e) => {
                          e.stopPropagation()
                          updateProfile(profile.id, { distance_unit: 'metric' })
                        }}
                      >
                        Metric (km)
                      </button>
                      <button
                        type="button"
                        className={`btn ${profile.distance_unit === 'us' ? 'btn--primary' : 'btn--secondary'}`}
                        style={{ flex: 1, padding: 'var(--spacing-xs) var(--spacing-sm)', fontSize: 'var(--font-size-sm)' }}
                        onClick={(e) => {
                          e.stopPropagation()
                          updateProfile(profile.id, { distance_unit: 'us' })
                        }}
                      >
                        US (miles)
                      </button>
                    </div>
                  </div>

                  <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginTop: 'var(--spacing-sm)' }}>Family Members</div>
                  <div className="flex-col gap-xs">
                    {(profile.family_members || ['Papa', 'Mama', 'Kids']).map((member) => (
                      <div key={member} style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        background: 'var(--color-bg-primary)',
                        padding: 'var(--spacing-xs) var(--spacing-sm)',
                        borderRadius: 'var(--radius-sm)'
                      }}>
                        <span>{member}</span>
                        <button 
                          className="btn btn--ghost" 
                          style={{ padding: '2px 8px', color: 'var(--color-danger)' }}
                          onClick={(e) => {
                            e.stopPropagation()
                            const next = (profile.family_members || []).filter(m => m !== member)
                            updateProfile(profile.id, { family_members: next })
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--spacing-ms)' }}>
                    <input 
                      type="text" 
                      className="form-input" 
                      style={{ padding: 'var(--spacing-xs) var(--spacing-sm)', fontSize: 'var(--font-size-sm)' }}
                      placeholder="Add member..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const name = (e.target as HTMLInputElement).value.trim()
                          if (name && !(profile.family_members || []).includes(name)) {
                            const next = [...(profile.family_members || []), name]
                            updateProfile(profile.id, { family_members: next })
                            ;(e.target as HTMLInputElement).value = ''
                          }
                        }
                      }}
                    />
                  </div>
                </div>
              )}

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

              {/* Danger Zone */}
              <div style={{ marginTop: 'var(--spacing-md)', display: 'flex', justifyContent: 'flex-end' }}>
                <button 
                  className="btn btn--ghost" 
                  style={{ color: 'var(--color-danger)', fontSize: 'var(--font-size-xs)', padding: '4px 8px' }}
                  onClick={async (e) => {
                    e.stopPropagation()
                    const confirmed = window.confirm(`Are you absolutely sure you want to delete the profile "${profile.label}"? This cannot be undone.`)
                    if (confirmed) {
                      const loadingToast = toast.loading('Deleting profile...')
                      try {
                        await deleteProfile(profile.id)
                        toast.success('Profile deleted', { id: loadingToast })
                      } catch (err) {
                        toast.error('Failed to delete profile', { id: loadingToast })
                      }
                    }
                  }}
                >
                  Delete Profile
                </button>
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

      {/* Maintenance */}
      <div className="card flex-col gap-md">
        <div className="card__title">Maintenance</div>
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)' }}>
          Recalculate order counts and latest visit dates from your history.
        </div>
        <button 
          className="btn btn--secondary" 
          disabled={!activeProfile}
          onClick={async () => {
            if (!activeProfile) return
            const loadingToast = toast.loading('Syncing restaurant history...')
            try {
              const { syncRestaurantDates } = await import('@/lib/migration')
              const count = await syncRestaurantDates(activeProfile.id)
              toast.success(`Successfully synced ${count} restaurants!`, { id: loadingToast })
            } catch (err) {
              console.error('Sync error:', err)
              toast.error('Failed to sync history', { id: loadingToast })
            }
          }}
        >
          🔄 Sync Restaurant History
        </button>
      </div>

      <div style={{ textAlign: 'center', opacity: 0.3, fontSize: 'var(--font-size-xs)', padding: 'var(--spacing-md)' }}>
        Version {pkg.version}
      </div>
    </div>
  )
}
