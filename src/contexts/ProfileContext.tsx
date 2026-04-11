import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  serverTimestamp,
  updateDoc,
  doc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from './AuthContext'
import type { Profile } from '@/types'

interface ProfileContextValue {
  profiles: Profile[]
  activeProfile: Profile | null
  activeProfileId: string | null
  setActiveProfileId: (id: string) => void
  createProfile: (label: string, currency: 'USD' | 'IDR', timezone: string) => Promise<string>
  activeMember: string | null
  setActiveMember: (name: string | null) => void
  theme: 'light' | 'dark'
  toggleTheme: () => void
  updateProfile: (id: string, updates: Partial<Profile>) => Promise<void>
  loading: boolean
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

function generateToken(label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const rand = Math.random().toString(36).substring(2, 8)
  return `${slug}-${rand}`
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [activeProfileId, setActiveProfileId] = useState<string | null>(
    localStorage.getItem('activeProfileId')
  )
  const [activeMember, setActiveMemberState] = useState<string | null>(
    localStorage.getItem('activeMember')
  )
  const [theme, setTheme] = useState<'light' | 'dark'>(
    (localStorage.getItem('theme') as 'light' | 'dark') || 'light'
  )
  const [loading, setLoading] = useState(true)
  const isCreatingProfile = useRef(false)

  // Sync theme with document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }, [])

  const setActiveMember = useCallback((name: string | null) => {
    setActiveMemberState(name)
    if (name) {
      localStorage.setItem('activeMember', name)
    } else {
      localStorage.removeItem('activeMember')
    }
  }, [])

  const handleSetActiveProfileId = useCallback((id: string) => {
    setActiveProfileId(id)
    localStorage.setItem('activeProfileId', id)
  }, [])

  useEffect(() => {
    if (!user) {
      setProfiles([])
      setActiveProfileId(null)
      setLoading(false)
      return
    }

    const q = query(
      collection(db, 'profiles'),
      where('members', 'array-contains', user.uid)
    )

    const unsubscribe = onSnapshot(q, async (snap) => {
      const data = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        created_at: doc.data().created_at?.toDate() || new Date(),
      })) as Profile[]

      setProfiles(data)

      // Auto-select first profile if none selected or current not found
      if (data.length > 0) {
        if (!activeProfileId || !data.find(p => p.id === activeProfileId)) {
          handleSetActiveProfileId(data[0].id)
        }
      }

      // If NO profiles exist and we haven't started creating one yet, create a default
      if (snap.empty && !isCreatingProfile.current) {
        isCreatingProfile.current = true
        console.log('No profiles found for new user, creating default...')
        try {
          await addDoc(collection(db, 'profiles'), {
            label: 'Family Vault',
            default_currency: 'USD',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            inbound_token: generateToken('Family Vault'),
            owner_uid: user.uid,
            members: [user.uid],
            family_members: ['Papa', 'Mama', 'Kids'],
            created_at: serverTimestamp(),
          })
        } catch (err) {
          console.error('Error creating default profile:', err)
          isCreatingProfile.current = false
        }
      }

      setLoading(false)
    })

    return unsubscribe
  }, [user, activeProfileId, handleSetActiveProfileId])

  const activeProfile = profiles.find((p) => p.id === activeProfileId) || null

  // Ensure activeMember is valid for current profile
  useEffect(() => {
    if (activeProfile && activeProfile.family_members && activeProfile.family_members.length > 0) {
      if (!activeMember || !activeProfile.family_members.includes(activeMember)) {
        setActiveMember(activeProfile.family_members[0])
      }
    }
  }, [activeProfile, activeMember, setActiveMember])

  const createProfile = useCallback(
    async (label: string, currency: 'USD' | 'IDR', timezone: string) => {
      if (!user) throw new Error('Must be signed in')

      const docRef = await addDoc(collection(db, 'profiles'), {
        label,
        default_currency: currency,
        timezone,
        inbound_token: generateToken(label),
        owner_uid: user.uid,
        members: [user.uid],
        family_members: ['Papa', 'Mama', 'Kids'],
        created_at: serverTimestamp(),
      })

      handleSetActiveProfileId(docRef.id)
      return docRef.id
    },
    [user, handleSetActiveProfileId]
  )

  const updateProfile = useCallback(async (id: string, updates: Partial<Profile>) => {
    try {
      // Remove restricted fields from updates
      const cleanUpdates = { ...updates }
      delete (cleanUpdates as any).id
      delete (cleanUpdates as any).created_at
      delete (cleanUpdates as any).owner_uid
      delete (cleanUpdates as any).inbound_token

      await updateDoc(doc(db, 'profiles', id), cleanUpdates)
    } catch (err) {
      console.error('Error updating profile:', err)
      throw err
    }
  }, [])

  return (
    <ProfileContext.Provider
      value={{ 
        profiles: profiles.map(p => ({
          ...p,
          family_members: p.family_members && p.family_members.length > 0 
            ? p.family_members 
            : ['Papa', 'Mama', 'Kids']
        })), 
        activeProfile: activeProfile ? {
          ...activeProfile,
          family_members: activeProfile.family_members && activeProfile.family_members.length > 0
            ? activeProfile.family_members
            : ['Papa', 'Mama', 'Kids']
        } : null, 
        activeProfileId,
        setActiveProfileId: handleSetActiveProfileId, 
        createProfile, 
        activeMember,
        setActiveMember,
        theme,
        toggleTheme,
        updateProfile,
        loading 
      }}
    >
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider')
  return ctx
}
