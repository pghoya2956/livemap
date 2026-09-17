// 화면 공통 표기: 상태 이름·색, 시각(Asia/Seoul), 상대 시각.
export const STATUS = {
  live: { word: '동작', color: 'var(--green)' },
  mock: { word: '목업', color: 'var(--amber)' },
  planned: { word: '계획', color: 'var(--plan)' },
  next: { word: '구상', color: 'var(--violet)' },
};
export const STATUS_ORDER = ['live', 'mock', 'planned', 'next'];

const TZ = 'Asia/Seoul';
export const hm = (iso) => new Intl.DateTimeFormat('ko-KR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
export const clock = (d) => new Intl.DateTimeFormat('ko-KR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(d);
export const longDate = (d) => new Intl.DateTimeFormat('ko-KR', { timeZone: TZ, month: 'long', day: 'numeric', weekday: 'long' }).format(d);
export const md = (ymd) => { const [, m, d] = ymd.split('-'); return `${+m}.${+d}`; };
export const ago = (iso, refIso) => {
  const m = Math.max(0, Math.round((Date.parse(refIso) - Date.parse(iso)) / 60000));
  return m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`;
};
export const hostOf = (raw) => {
  if (!raw) return null;
  try {
    const u = new URL(/^https?:/.test(raw) ? raw : `https://${raw}`);
    return u.hostname.endsWith('.invalid') ? null : u;
  } catch { return null; }
};
export const sum = (xs) => xs.reduce((a, b) => a + b, 0);
