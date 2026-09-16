import { useResorts } from '../lib/queries';
import { PROFILE } from '../content/profile';
export function Live() { const r = useResorts(); return <div>{PROFILE.name}{r.length}</div>; }
