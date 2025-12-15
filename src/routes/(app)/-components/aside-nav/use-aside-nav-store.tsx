import { create } from 'zustand'

interface AsideNavState {
  open: boolean
  toggle: (open?: boolean) => void
}

export const useAsideNavStore = create<AsideNavState>((set) => ({
  open: false,
  toggle: (open) => {
    set((state) => ({ open: open ?? !state.open }))
  },
}))
