import { useAuth } from "@clerk/tanstack-react-start"
import { ConvexReactClient, useConvexAuth, useMutation, useQuery } from "convex/react"
import { useEffect, useRef } from "react"
import { api } from "../../convex/_generated/api"

export const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string)

/** The signed-in player's profile, created on first sign-in. Guests get `profile: null`. */
export function useProfile() {
  const { isSignedIn } = useAuth()
  const { isAuthenticated } = useConvexAuth()
  const profile = useQuery(api.profiles.me, isAuthenticated ? {} : "skip")
  const ensure = useMutation(api.profiles.ensure)
  const ensuringRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated || profile !== null || ensuringRef.current) return
    ensuringRef.current = true
    ensure()
      .catch((error) => console.error("Could not create profile", error))
      .finally(() => {
        ensuringRef.current = false
      })
  }, [isAuthenticated, profile, ensure])

  return { isSignedIn: Boolean(isSignedIn), profile: profile ?? null }
}

/**
 * The latest Clerk session token getter, for socket handlers that outlive
 * renders. Resolves to null for guests, so it can be sent unconditionally.
 */
export function useAuthTokenRef() {
  const { isSignedIn, getToken } = useAuth()
  const getAuthToken = async () => (isSignedIn ? getToken().catch(() => null) : null)
  const ref = useRef(getAuthToken)
  ref.current = getAuthToken
  return ref
}
