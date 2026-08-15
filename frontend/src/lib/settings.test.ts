import { describe, expect, it } from "vitest";

import type { Account, Category, CategoryKind, Rule } from "../api/types";
import { accountsSummary, filterRules, groupAccounts, groupByKind } from "./settings";

const cat = (id: number, name: string, kind: CategoryKind = "saida", archived = false): Category => ({
  id,
  name,
  kind,
  color: "#888",
  archived,
});

const acc = (id: number, name: string, institution: string): Account => ({
  id,
  name,
  institution,
  kind: "corrente",
});

const rule = (id: number, matcher: string, category_id: number): Rule => ({
  id,
  matcher,
  category_id,
});

describe("groupByKind", () => {
  const CATS = [
    cat(1, "Mercado"),
    cat(2, "Aula Padel"),
    cat(3, "Velha", "saida", true),
    cat(4, "Salário", "entrada"),
    cat(5, "Investimentos", "investimento"),
  ];

  it("agrupa por kind e esconde arquivadas por padrão", () => {
    const g = groupByKind(CATS, false);
    expect(g.saida.map((c) => c.name)).toEqual(["Aula Padel", "Mercado"]);
    expect(g.entrada.map((c) => c.name)).toEqual(["Salário"]);
    expect(g.investimento.map((c) => c.name)).toEqual(["Investimentos"]);
  });

  it("mostra arquivadas no grupo quando pedido, em ordem alfabética", () => {
    const g = groupByKind(CATS, true);
    expect(g.saida.map((c) => c.name)).toEqual(["Aula Padel", "Mercado", "Velha"]);
  });

  it("ordena sem sensibilidade a acento", () => {
    const g = groupByKind([cat(1, "Água"), cat(2, "Assinaturas")], false);
    expect(g.saida.map((c) => c.name)).toEqual(["Água", "Assinaturas"]);
  });
});

describe("groupAccounts", () => {
  it("agrupa por instituição, instituições e contas em ordem alfabética", () => {
    const g = groupAccounts([
      acc(1, "Inter Conta", "inter"),
      acc(2, "Bradesco Cartão", "bradesco"),
      acc(3, "Bradesco Conta", "bradesco"),
    ]);
    expect(g.map((x) => x.institution)).toEqual(["bradesco", "inter"]);
    expect(g[0].accounts.map((a) => a.name)).toEqual(["Bradesco Cartão", "Bradesco Conta"]);
  });

  it("lista vazia devolve vazio", () => {
    expect(groupAccounts([])).toEqual([]);
  });

  it("agrupa instituições sem sensibilidade a caixa", () => {
    const g = groupAccounts([acc(1, "A", "Inter"), acc(2, "B", "inter")]);
    expect(g).toHaveLength(1);
    expect(g[0].accounts).toHaveLength(2);
  });
});

describe("accountsSummary", () => {
  it("pluraliza contas e instituições", () => {
    expect(
      accountsSummary([
        acc(1, "A", "bradesco"),
        acc(2, "B", "bradesco"),
        acc(3, "C", "inter"),
        acc(4, "D", "inter"),
      ])
    ).toBe("4 contas em 2 instituições");
  });

  it("singular quando é uma só", () => {
    expect(accountsSummary([acc(1, "A", "bradesco")])).toBe("1 conta em 1 instituição");
  });

  it("não conta a mesma instituição duas vezes por diferença de caixa", () => {
    expect(accountsSummary([acc(1, "A", "Inter"), acc(2, "B", "inter")])).toBe(
      "2 contas em 1 instituição"
    );
  });
});

describe("filterRules", () => {
  const CATS = [cat(10, "Impostos & Taxas"), cat(11, "Moradia & Utilidades")];
  const RULES = [
    rule(1, "IOF S UTILIZACAO LIMITE", 10),
    rule(2, "CONTA LUZ ENEL DISTRIB SP", 11),
    rule(3, "CONTA TELEFONE VIVO", 11),
  ];

  it("busca vazia devolve tudo", () => {
    expect(filterRules(RULES, CATS, "")).toEqual(RULES);
    expect(filterRules(RULES, CATS, "   ")).toEqual(RULES);
  });

  it("casa o matcher, case-insensitive", () => {
    expect(filterRules(RULES, CATS, "iof").map((r) => r.id)).toEqual([1]);
  });

  it("casa o nome da categoria", () => {
    expect(filterRules(RULES, CATS, "moradia").map((r) => r.id)).toEqual([2, 3]);
  });

  it("sem resultado devolve vazio", () => {
    expect(filterRules(RULES, CATS, "xyz")).toEqual([]);
  });
});
