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
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from './AuthContext'
import type { Profile } from '@/types'

interface ProfileContextValue {
  profiles: Profile[]
  activeProfile: Profile | null
  setActiveProfileId: (id: string) => void
  createProfile: (label: string, currency: 'USD' | 'IDR', timezone: string) => Promise<string>
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
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const isCreatingProfile = useRef(false)

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

      // Auto-select first profile if none selected
      if (!activeProfileId && data.length > 0) {
        setActiveProfileId(data[0].id)
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
            created_at: serverTimestamp(),
          })
        } catch (err) {
          console.error('Error creating default profile:', err)
          isCreatingProfile.current = false // Allow retry on next snapshot if it failed
        }
      }

      setLoading(false)
    })

    return unsubscribe
  }, [user, activeProfileId])

  const activeProfile = profiles.find((p) => p.id === activeProfileId) || null

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
        created_at: serverTimestamp(),
      })

      setActiveProfileId(docRef.id)
      return docRef.id
    },
    [user]
  )

  return (
    <ProfileContext.Provider
      value={{ profiles, activeProfile, setActiveProfileId, createProfile, loading }}
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
