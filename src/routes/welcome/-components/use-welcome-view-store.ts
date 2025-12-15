import { create } from 'zustand'

type View = 'done' | 'form' | 'intro' | 'migrate'

interface WelcomeViewState {
  setView: (view: View) => void
  view: View
}

export const useWelcomeViewStore = create<WelcomeViewState>((set) => ({
  view: 'intro',
  setView: (view) => {
    set({ view })
  },
}))
