// 연결 단계: 모든 어댑터가 끝난 뒤 화면 노드 apiLiterals를 API 노드에 대응해 calls 엣지와 matched를 채운다.
// router는 bff보다 먼저 돌아 어댑터 안에서는 대응할 API 노드가 없다. 연결 단계는 adapters[]에 들지 않는다.
//   router.unknown-api       리터럴 위치(파일·줄·경로)마다 한 건
//   router.hookapi-redundant hookApi 키가 쓰인 화면의 연결이 모두 리터럴로도 나옴(쓰는 화면이 없는 키 포함), 키마다 한 건
//   router.hookapi-only      hookApi 키로만 나오는 연결이 있음, 키마다 한 건
// 화면 apis 읽기 상태: 모든 리터럴이 API 노드에 맞고 hookApi로만 붙은 연결이 없으면 rule, 아니면 partial.
// 순서(2.1.0): 이 단계 바로 뒤에 다리 단계(src/bridge.mjs)가 붙는다. 다리는 여기서 만든 화면 → API calls 를 읽기만 하고 다시 만들지 않는다(DEC-42).
import { matchesApi } from './lib/literals.mjs';
import { setReading } from './lib/reading.mjs';

const CONFIG = 'map/config.json';
const LIST_MAX = 3;
const list = (xs) => xs.slice(0, LIST_MAX).join(', ') + (xs.length > LIST_MAX ? ` 외 ${xs.length - LIST_MAX}` : '');

export function linkScreenApis(g, fs, cfg) {
  const apis = g.of('api');
  const screens = g.of('screen').filter((s) => s.props.apiLiterals !== undefined || s.props.hookApiKeys !== undefined);
  const literalPairs = new Set();
  const unknown = new Map(); // 파일:줄:경로 → { lit, screens }
  const lineText = new Map();
  const excerptOf = (file, line) => {
    if (!lineText.has(file)) lineText.set(file, fs.has(file) ? fs.read(file).split('\n') : []);
    return (lineText.get(file)[line - 1] ?? '').trim();
  };

  for (const s of screens) {
    const lits = s.props.apiLiterals ?? [];
    if (!Array.isArray(lits)) throw new Error(`화면 ${s.id}의 apiLiterals가 배열이 아님`);
    for (const lit of lits) {
      if (!lit || typeof lit.path !== 'string' || typeof lit.file !== 'string') throw new Error(`화면 ${s.id}의 apiLiterals 항목에 path·file 문자열이 없음`);
      lit.matched = apis.filter((a) => matchesApi(lit, a.id)).map((a) => a.id);
      for (const id of lit.matched) { g.link('screen', s.id, 'calls', 'api', id); literalPairs.add(`${s.id}\t${id}`); }
      if (!lit.matched.length) {
        const key = `${lit.file}:${lit.line}:${lit.path}${lit.open ? '…' : ''}`;
        if (!unknown.has(key)) unknown.set(key, { lit, screens: [] });
        unknown.get(key).screens.push(s.id);
      }
    }
  }
  for (const { lit, screens: ss } of unknown.values()) {
    const shown = `${lit.path}${lit.open ? '…' : ''}`;
    g.issue('warn', '화면→API', `${lit.file}:${lit.line} 리터럴 ${shown}에 맞는 API 노드 없음(화면 ${ss.length}: ${list(ss)})`, {
      code: 'router.unknown-api',
      subject: { kind: 'screen', id: ss[0] },
      anchors: [{ file: lit.file, line: Number.isInteger(lit.line) && lit.line >= 1 ? lit.line : null, excerpt: excerptOf(lit.file, lit.line) }],
    });
  }

  // hookApi 정리 경고: 키마다 그 키를 쓴 화면의 (화면, API) 연결이 리터럴로도 나왔는지 본다
  const hookApi = cfg.router?.hookApi;
  const hookOnly = new Map(); // 화면 → [API]
  if (hookApi && typeof hookApi === 'object') {
    const cfgText = fs.has(CONFIG) ? fs.read(CONFIG) : '';
    for (const [key, api] of Object.entries(hookApi)) {
      const users = screens.filter((s) => (s.props.hookApiKeys || []).includes(key)).map((s) => s.id);
      const missing = users.filter((sid) => !literalPairs.has(`${sid}\t${api}`));
      for (const sid of missing) hookOnly.set(sid, [...new Set([...(hookOnly.get(sid) || []), api])]);
      const line = fs.lineOf(cfgText, `"${key}"`);
      const detail = { subject: { kind: 'config', id: `router.hookApi.${key}` }, anchors: [{ file: CONFIG, line }] };
      if (missing.length) {
        g.issue('warn', 'hookApi', `${key}(${api}) 리터럴 없이 대응표로만 연결되는 화면 ${missing.length}: ${list(missing)}`, { code: 'router.hookapi-only', ...detail });
      } else {
        const why = users.length ? `리터럴로도 연결됨(화면 ${users.length})` : '쓰는 화면 없음';
        g.issue('warn', 'hookApi', `${key}(${api}) ${why}, 설정에서 지워도 됨`, { code: 'router.hookapi-redundant', ...detail });
      }
    }
  }

  for (const s of screens) {
    const bad = (s.props.apiLiterals || []).filter((l) => !l.matched.length).map((l) => `${l.path}${l.open ? '…' : ''}(${l.file}:${l.line})`);
    const only = hookOnly.get(s.id) || [];
    const notes = [];
    if (bad.length) notes.push(`API 노드에 맞지 않는 리터럴 ${bad.length}: ${list(bad)}`);
    if (only.length) notes.push(`hookApi로만 연결 ${only.length}: ${list(only)}`);
    setReading(s, 'apis', notes.length ? 'partial' : 'rule', notes.length ? notes.join('; ') : undefined);
  }
}
