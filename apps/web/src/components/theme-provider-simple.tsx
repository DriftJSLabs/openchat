"use client"

import * as React from "react"
import { getOnboardingData, setOnboardingData } from "@/lib/cookies"

type Theme = "purple" | "blue" | "green" | "red" | "orange" | "pink"

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const ThemeContext = React.createContext<ThemeContextType>({
  theme: "purple",
  setTheme: () => {}
})

export function useTheme() {
  return React.useContext(ThemeContext)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>("purple")
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
    // Load saved theme
    const savedData = getOnboardingData()
    const validThemes = ["purple", "blue", "green", "red", "orange", "pink"]
    
    if (savedData.theme && validThemes.includes(savedData.theme)) {
      const savedTheme = savedData.theme as Theme
      if (savedTheme !== theme) {
        setThemeState(savedTheme)
      }
      document.documentElement.setAttribute("data-theme", savedTheme)
    } else {
      document.documentElement.setAttribute("data-theme", "purple")
    }
  }, []) // Empty dependency array - only run once on mount

  const setTheme = React.useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    document.documentElement.setAttribute("data-theme", newTheme)
    setOnboardingData({ theme: newTheme })
    
    // Force a re-render of the entire app by updating the body
    document.body.style.display = 'none'
    document.body.offsetHeight // Trigger reflow
    document.body.style.display = ''
  }, [])

  if (!mounted) {
    return null
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}