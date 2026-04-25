// @ts-nocheck
// AuthGate — routes between LandingScreen and AppShell based on session state.
//
// The session (shipId + userName + role) is hydrated from IDB by
// SessionProvider; while that's in flight we render nothing to avoid a
// landing-flash on cold reload. Once ready, we show AppShell if the
// session is complete, otherwise LandingScreen.
//
// There is no auth, no PIN, no PAT — see CLAUDE.md §4. The network-share
// ACL is the access boundary; session fields only stamp `loggedBy`.
import { useSession } from '../../hooks/useSession';
import { LandingScreen } from '../session/LandingScreen';
import { AppShell } from '../layout/AppShell';

export function AuthGate() {
  const { ready, shipId, userName, role } = useSession();
  if (!ready) return null;
  const signedIn = !!(shipId && userName && role);
  return signedIn ? <AppShell /> : <LandingScreen />;
}
