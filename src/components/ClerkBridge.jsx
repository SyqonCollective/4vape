import { useEffect } from "react";
import { useAuth, useClerk } from "@clerk/clerk-react";
import { clearToken, setAuthReady, setAuthTokenResolver, setLogoutResolver, setToken } from "../lib/api.js";

export default function ClerkBridge() {
  const { isSignedIn, getToken } = useAuth();
  const { signOut } = useClerk();

  useEffect(() => {
    setAuthTokenResolver(async () => {
      if (!isSignedIn) return null;
      const token = await getToken();
      if (token) setToken(token);
      return token || null;
    });

    setLogoutResolver(async () => {
      await signOut().catch(() => null);
      clearToken();
    });

    if (isSignedIn) {
      getToken()
        .then((token) => {
          if (token) setToken(token);
        })
        .finally(() => setAuthReady(true));
    } else {
      clearToken();
      setAuthReady(true);
    }

    return () => {
      setAuthTokenResolver(null);
      setLogoutResolver(null);
    };
  }, [isSignedIn, getToken, signOut]);

  return null;
}
