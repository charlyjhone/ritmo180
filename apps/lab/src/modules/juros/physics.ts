/** Montante a juros compostos com aportes mensais no fim de cada mês. */
export function compoundFV(C: number, i: number, n: number, A = 0) {
  const g = (1 + i) ** n;
  return C * g + (i === 0 ? A * n : (A * (g - 1)) / i);
}

/** Juros simples: só o capital (e cada aporte) rende i por mês, sem juros sobre juros. */
export const simpleFV = (C: number, i: number, n: number, A = 0) => C * (1 + i * n) + A * n + (A * i * n * (n - 1)) / 2;

export const equivalentRate = (i: number, periods: number) => (1 + i) ** periods - 1;

/** Parcela fixa da tabela Price: PMT = PV·i/(1 − (1+i)⁻ⁿ). */
export const pricePMT = (PV: number, i: number, n: number) => (i === 0 ? PV / n : (PV * i) / (1 - (1 + i) ** -n));

/** Total de juros no SAC: amortização constante PV/n, juros sobre o saldo. */
export const sacTotalInterest = (PV: number, i: number, n: number) => (PV * i * (n + 1)) / 2;

export interface Ledger {
  m: number;
  simple: number;
  compound: number;
  deposits: number; // aportes já feitos
  // financiamento
  balP: number;
  balS: number;
  paidP: number;
  paidS: number;
  intP: number;
  intS: number;
  amortP: number;
  lastP: number;
  lastS: number;
}

export const newLedger = (C: number, PV: number): Ledger => ({ m: 0, simple: C, compound: C, deposits: 0, balP: PV, balS: PV, paidP: 0, paidS: 0, intP: 0, intS: 0, amortP: 0, lastP: 0, lastS: 0 });

/** Um mês: aplicação (simples e composta) e as duas tabelas de financiamento. */
export function month(l: Ledger, C: number, i: number, A: number, PV: number, n: number): Ledger {
  const pmt = pricePMT(PV, i, n);
  const jP = l.balP * i;
  const aP = pmt - jP;
  const jS = l.balS * i;
  const aS = PV / n;
  return {
    m: l.m + 1,
    simple: l.simple + C * i + l.deposits * i + A,
    compound: l.compound * (1 + i) + A,
    deposits: l.deposits + A,
    balP: l.balP - aP,
    balS: l.balS - aS,
    paidP: l.paidP + pmt,
    paidS: l.paidS + aS + jS,
    intP: l.intP + jP,
    intS: l.intS + jS,
    amortP: l.amortP + aP,
    lastP: pmt,
    lastS: aS + jS,
  };
}
