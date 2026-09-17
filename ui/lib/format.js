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

const seoulYmd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
/** "9월 17일" */
export const mdKo = (isoOrYmd) => { const [, m, d] = (isoOrYmd.length === 10 ? isoOrYmd : seoulYmd(isoOrYmd)).split('-'); return `${+m}월 ${+d}일`; };
/** 자료 신선도: 15분 이하면 live, 넘으면 "n분/시간/일 전 자료" */
export const freshness = (generatedAt, now = Date.now()) => {
  const m = Math.max(0, Math.round((now - Date.parse(generatedAt)) / 60000));
  if (m <= 15) return { live: true, label: 'LIVE' };
  return { live: false, label: m < 60 ? `${m}분 전 자료` : m < 1440 ? `${Math.round(m / 60)}시간 전 자료` : `${Math.round(m / 1440)}일 전 자료` };
};
/** 결정 대기 경과일: 두 Asia/Seoul 날짜 차 + 1 */
export const waitDays = (sinceIso, refIso) => Math.round((Date.parse(seoulYmd(refIso)) - Date.parse(seoulYmd(sinceIso))) / 864e5) + 1;
export const ROADMAP_TAG = { 완료: 'live', 진행: 'mock', 다음: 'next', 대기: 'next', 이후: 'next' };
export const roadmapWord = (s) => (s === '진행' ? '진행 중' : s);
