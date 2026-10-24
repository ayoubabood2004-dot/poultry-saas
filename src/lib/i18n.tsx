import { Fragment, type ReactNode } from 'react';
import { fmtInt } from './numerals';

// كل عربية معروضة تمرّ من t(key, "النص") أو <Trans>، من أوّل سطر (i18n-guard يفرضها)، وبالفصحى (قرار المالك 18).
// النص العربي بالشفرة هو الأصل والمفتاح يثبّته: اللغة الثانية بعدين ملف ترجمة بنفس المفاتيح، مو إعادة كتابة.
// الرقم بمتغيّر ينعرض بفواصل دائماً (قانون المالك 2026-10-24): عدد صحيح بـfmtInt، والكسر يرمي، وbigint يرمي —
// الكمية والمبلغ والنسبة تنسّقها منسّقاتها بـformat.ts وتنمرّر نصّاً.

type Vars = Readonly<Record<string, string | number>>;

const VAR = /\{(\w+)\}/g;

function shown(value: string | number): string {
  // bigint يفلت من النوع (any أو JS): Fils وMilli بلا منسّقهم ينعرضون بلا فواصل وألف ضعف.
  if (typeof (value as unknown) === 'bigint') throw new TypeError('t_bigint_var');
  return typeof value === 'number' ? fmtInt(value) : value;
}

export function t(key: string, text: string, vars?: Vars): string {
  void key;
  if (!vars) return text;
  return text.replace(VAR, (whole, name: string) => {
    const value = vars[name];
    return value === undefined ? whole : shown(value);
  });
}

/** متغيّر <Trans>: الرقم بفواصل، وbigint مرفوض (Fils وMilli لازم منسّقهم). */
function shownNode(value: ReactNode): ReactNode {
  if (typeof value === 'number') return fmtInt(value);
  if (typeof value === 'bigint') throw new TypeError('trans_bigint_var');
  return value;
}

const TOKEN = /<(\w+)>([\s\S]*?)<\/\1>|\{(\w+)\}/g;

function fillVars(text: string, vars: Readonly<Record<string, ReactNode>>, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(VAR)) {
    const index = match.index ?? 0;
    if (index > last) out.push(text.slice(last, index));
    const name = match[1] ?? '';
    out.push(<Fragment key={`${keyPrefix}${index}`}>{name in vars ? shownNode(vars[name]) : match[0]}</Fragment>);
    last = index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export interface TransProps {
  k: string;
  /** النص بوسوم <b>…</b> ومتغيّرات {name}. */
  text: string;
  vars?: Readonly<Record<string, ReactNode>>;
  tags?: Readonly<Record<string, (chunk: ReactNode) => ReactNode>>;
}

/** جملة بمقاطع مبرزة: الوسوم تصير عناصر، مو تركيب نصوص بالشفرة (الترجمة تحتاج الجملة كاملة). */
export function Trans({ k, text, vars = {}, tags = {} }: TransProps) {
  void k;
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) out.push(text.slice(last, index));
    const [whole, tag, inner, varName] = match;
    if (tag !== undefined) {
      const render = tags[tag];
      const content = fillVars(inner ?? '', vars, `${index}-`);
      out.push(<Fragment key={index}>{render ? render(content) : content}</Fragment>);
    } else if (varName !== undefined) {
      out.push(<Fragment key={index}>{varName in vars ? shownNode(vars[varName]) : whole}</Fragment>);
    }
    last = index + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
