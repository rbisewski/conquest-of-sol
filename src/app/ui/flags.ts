// Current national flags from the flag-icons package (MIT), keyed by our ISO 3166 alpha-3
// nation ids. Aggregates of several states borrow a member's flag: Barbados's
// for the Eastern Caribbean States and Vanuatu's for the Pacific Island States. Breakaway
// nations use flag-icons' regional flags where it has them (Scotland, Wales, Catalonia,
// the Basque Country), else the ones drawn in breakawayFlags.ts.

import { breakawayFlagUrl } from "./breakawayFlags";

/** Nation id → the flag file's ISO 3166 alpha-2 code. */
const ALPHA2: Record<string, string> = {
  ecs: "bb", pis: "vu", sct: "gb-sct", wal: "gb-wls", cat: "es-ct", bas: "es-pv",
  afg: "af", ago: "ao", alb: "al", are: "ae", arg: "ar", arm: "am", aus: "au", aut: "at", aze: "az", bdi: "bi",
  bel: "be", ben: "bj", bfa: "bf", bgd: "bd", bgr: "bg", bhr: "bh", bhs: "bs", bih: "ba", blr: "by", blz: "bz",
  bol: "bo", bra: "br", brn: "bn", btn: "bt", bwa: "bw", caf: "cf", can: "ca", che: "ch", chl: "cl", chn: "cn",
  civ: "ci", cmr: "cm", cod: "cd", cog: "cg", col: "co", com: "km", cpv: "cv", cri: "cr", cub: "cu", cyp: "cy",
  cze: "cz", deu: "de", dji: "dj", dnk: "dk", dom: "do", dza: "dz", ecu: "ec", egy: "eg", eri: "er", esp: "es",
  est: "ee", eth: "et", fin: "fi", fji: "fj", fra: "fr", gab: "ga", gbr: "gb", geo: "ge", gha: "gh", gin: "gn",
  gmb: "gm", gnb: "gw", gnq: "gq", grc: "gr", gtm: "gt", guy: "gy", hnd: "hn", hrv: "hr", hti: "ht", hun: "hu",
  idn: "id", ind: "in", irl: "ie", irn: "ir", irq: "iq", isl: "is", isr: "il", ita: "it", jam: "jm", jor: "jo",
  jpn: "jp", kaz: "kz", ken: "ke", kgz: "kg", khm: "kh", kor: "kr", kwt: "kw", lao: "la", lbn: "lb", lbr: "lr",
  lby: "ly", lka: "lk", lso: "ls", ltu: "lt", lux: "lu", lva: "lv", mar: "ma", mda: "md", mdg: "mg", mdv: "mv",
  mex: "mx", mkd: "mk", mli: "ml", mlt: "mt", mmr: "mm", mne: "me", mng: "mn", moz: "mz", mrt: "mr", mus: "mu",
  mwi: "mw", mys: "my", nam: "na", ner: "ne", nga: "ng", nic: "ni", nld: "nl", nor: "no", npl: "np", nzl: "nz",
  omn: "om", pak: "pk", pan: "pa", per: "pe", phl: "ph", png: "pg", pol: "pl", prk: "kp", prt: "pt", pry: "py",
  pse: "ps", qat: "qa", rou: "ro", rus: "ru", rwa: "rw", sau: "sa", sdn: "sd", sds: "ss", sen: "sn", sgp: "sg",
  slb: "sb", sle: "sl", slv: "sv", som: "so", srb: "rs", stp: "st", sur: "sr", svk: "sk", svn: "si", swe: "se",
  swz: "sz", syc: "sc", syr: "sy", tcd: "td", tgo: "tg", tha: "th", tjk: "tj", tkm: "tm", tls: "tl", tto: "tt",
  tun: "tn", tur: "tr", twn: "tw", tza: "tz", uga: "ug", ukr: "ua", ury: "uy", usa: "us", uzb: "uz", ven: "ve",
  vnm: "vn", xkx: "xk", yem: "ye", zaf: "za", zmb: "zm", zwe: "zw",
};

const files = import.meta.glob<string>("/node_modules/flag-icons/flags/4x3/{gb-sct,gb-wls,es-ct,es-pv,ae,af,al,am,ao,ar,at,au,az,ba,bb,bd,be,bf,bg,bh,bi,bj,bn,bo,br,bs,bt,bw,by,bz,ca,cd,cf,cg,ch,ci,cl,cm,cn,co,cr,cu,cv,cy,cz,de,dj,dk,do,dz,ec,ee,eg,er,es,et,fi,fj,fr,ga,gb,ge,gh,gm,gn,gq,gr,gt,gw,gy,hn,hr,ht,hu,id,ie,il,in,iq,ir,is,it,jm,jo,jp,ke,kg,kh,km,kp,kr,kw,kz,la,lb,lk,lr,ls,lt,lu,lv,ly,ma,md,me,mg,mk,ml,mm,mn,mr,mt,mu,mv,mw,mx,my,mz,na,ne,ng,ni,nl,no,np,nz,om,pa,pe,pg,ph,pk,pl,ps,pt,py,qa,ro,rs,ru,rw,sa,sb,sc,sd,se,sg,si,sk,sl,sn,so,sr,ss,st,sv,sy,sz,td,tg,th,tj,tl,tm,tn,tr,tt,tw,tz,ua,ug,us,uy,uz,ve,vn,vu,xk,ye,za,zm,zw}.svg", { eager: true, query: "?url", import: "default" });

/** URL of a nation's flag (4:3), or null if it has none. */
export function flagUrl(nationId: string): string | null {
  const code = ALPHA2[nationId];
  return code ? (files[`/node_modules/flag-icons/flags/4x3/${code}.svg`] ?? null) : breakawayFlagUrl(nationId);
}
