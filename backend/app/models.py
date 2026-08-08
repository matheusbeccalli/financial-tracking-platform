from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

CATEGORY_KINDS = ("entrada", "saida", "investimento")


class Base(DeclarativeBase):
    pass


class Account(Base):
    __tablename__ = "account"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    institution: Mapped[str]  # "bradesco" | "inter"
    kind: Mapped[str]  # "corrente" | "cartao"


class Category(Base):
    __tablename__ = "category"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True)
    color: Mapped[str] = mapped_column(default="#8888aa")
    kind: Mapped[str]  # ver CATEGORY_KINDS
    archived: Mapped[bool] = mapped_column(default=False)


class ImportBatch(Base):
    __tablename__ = "import_batch"
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str]  # "ofx" | "csv"
    filename: Mapped[str]
    imported_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    new_count: Mapped[int] = mapped_column(default=0)
    dup_count: Mapped[int] = mapped_column(default=0)


class Transaction(Base):
    __tablename__ = "transactions"
    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("account.id"))
    date: Mapped[date] = mapped_column(Date)
    description: Mapped[str]
    normalized: Mapped[str]
    amount_cents: Mapped[int]
    category_id: Mapped[Optional[int]] = mapped_column(ForeignKey("category.id"))
    source: Mapped[Optional[str]]  # "regra" | "llm" | "manual"
    dedupe_hash: Mapped[str] = mapped_column(unique=True)
    batch_id: Mapped[Optional[int]] = mapped_column(ForeignKey("import_batch.id"))
    installment: Mapped[Optional[str]]  # ex.: "02/10"
    ignored: Mapped[bool] = mapped_column(default=False)


class IgnoreRule(Base):
    __tablename__ = "ignore_rule"
    id: Mapped[int] = mapped_column(primary_key=True)
    matcher: Mapped[str] = mapped_column(unique=True)  # descrição normalizada


class Rule(Base):
    __tablename__ = "rule"
    id: Mapped[int] = mapped_column(primary_key=True)
    matcher: Mapped[str] = mapped_column(unique=True)  # descrição normalizada
    category_id: Mapped[int] = mapped_column(ForeignKey("category.id"))


class Budget(Base):
    __tablename__ = "budget"
    __table_args__ = (UniqueConstraint("category_id", "valid_from"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("category.id"))
    amount_cents: Mapped[int]  # sempre positivo; sinal vem do kind da categoria
    valid_from: Mapped[str]  # "YYYY-MM"


class Setting(Base):
    __tablename__ = "setting"
    key: Mapped[str] = mapped_column(primary_key=True)
    value: Mapped[str]
