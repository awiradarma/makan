export interface Profile {
  id: string
  label: string
  default_currency: 'USD' | 'IDR'
  timezone: string
  inbound_token: string
  owner_uid: string
  members: string[]
  family_members?: string[]
  distance_unit?: 'metric' | 'us'
  created_at: Date
}

export interface OrderItem {
  name: string
  price: number
  rating?: number
  tags?: string[]
}

export interface Order {
  id: string
  profile_id: string
  restaurant_name: string
  order_type: 'Email' | 'Photo' | 'Manual'
  image_url?: string
  items: OrderItem[]
  total_amount: number
  currency: 'USD' | 'IDR'
  ordered_at: Date
  created_at: Date
  restaurant_address?: string
  status: 'pending_review' | 'confirmed'
}

export interface Restaurant {
  id: string
  profile_id: string
  name: string
  is_disliked: boolean
  tags: string[]
  last_ordered_at: Date
  order_count: number
  address?: string
  lat?: number
  lng?: number
  faved_by?: string[]
  disliked_by?: string[]
}

export interface FoodItem {
  id: string // ${profile_id}_${restaurant_id}_${item_name_slug}
  profile_id: string
  restaurant_id: string
  restaurant_name: string
  name: string
  rating?: number // Global/Latest rating
  member_ratings?: Record<string, number> // Per-member ratings
  order_count: number
  last_ordered_at: Date
  tags: string[]
  faved_by?: string[]
  disliked_by?: string[]
  is_staple?: boolean
}

export interface ParsedReceipt {
  restaurant_name: string
  restaurant_address: string | null
  date: string
  items: OrderItem[]
  total_amount: number
  currency: 'USD' | 'IDR'
}
