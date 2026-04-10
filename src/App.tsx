import { useState } from 'react'
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ProfileProvider, useProfile } from '@/contexts/ProfileContext'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Rotation from '@/pages/Rotation'
import AddOrder from '@/pages/AddOrder'
import Settings from '@/pages/Settings'
import OrderDetail from '@/pages/OrderDetail'

function ProfileSwitcher() {
  const { profiles, activeProfile, setActiveProfileId } = useProfile()
  const [open, setOpen] = useState(false)

  if (profiles.length <= 1) return null

  return (
    <div className="profile-switcher">
      <button className="profile-switcher__button" onClick={() => setOpen(!open)}>
        {activeProfile?.label || 'Select profile'}
        <span style={{ fontSize: '0.6rem' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="profile-switcher__dropdown">
          {profiles.map((p) => (
            <button
              key={p.id}
              className={`profile-switcher__item ${
                p.id === activeProfile?.id ? 'profile-switcher__item--active' : ''
              }`}
              onClick={() => {
                setActiveProfileId(p.id)
                setOpen(false)
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function AppShell() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    )
  }

  if (!user) return <Login />

  return (
    <ProfileProvider>
      <div className="app-container">
        {/* Top Bar */}
        <header className="top-bar">
          <div className="top-bar__logo">
            <span className="top-bar__logo-icon">🍜</span>
            <span>Makan</span>
          </div>
          <div className="top-bar__actions">
            <ProfileSwitcher />
          </div>
        </header>

        {/* Routes */}
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/rotation" element={<Rotation />} />
          <Route path="/add" element={<AddOrder />} />
          <Route path="/order/:id" element={<OrderDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        {/* FAB */}
        <button className="fab" onClick={() => navigate('/add')} aria-label="Add order">
          +
        </button>

        {/* Bottom Nav */}
        <nav className="bottom-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `bottom-nav__item ${isActive ? 'bottom-nav__item--active' : ''}`
            }
          >
            <span className="bottom-nav__icon">🏠</span>
            <span>Home</span>
          </NavLink>
          <NavLink
            to="/rotation"
            className={({ isActive }) =>
              `bottom-nav__item ${isActive ? 'bottom-nav__item--active' : ''}`
            }
          >
            <span className="bottom-nav__icon">🔄</span>
            <span>Rotation</span>
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `bottom-nav__item ${isActive ? 'bottom-nav__item--active' : ''}`
            }
          >
            <span className="bottom-nav__icon">⚙️</span>
            <span>Settings</span>
          </NavLink>
        </nav>
      </div>
    </ProfileProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: '#22222e',
            color: '#f0f0f5',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '0.625rem',
            fontSize: '0.875rem',
          },
        }}
      />
    </AuthProvider>
  )
}
