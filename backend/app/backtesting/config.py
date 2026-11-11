from datetime import date
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator


class BacktestConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    experiment_id: UUID | None = None
    initial_capital: float = Field(default=100000, ge=100, le=1e9)
    rebalance_frequency: Literal["daily", "weekly", "monthly"] = "weekly"
    fee_bps: float = Field(default=10, ge=0, le=100)
    slippage_bps: float = Field(default=5, ge=0, le=100)
    cash_annual_return: float = Field(default=0.02, ge=0, le=0.2)
    risk_free_rate: float = Field(default=0, ge=0, le=0.2)
    min_esg: float = Field(default=65, ge=0, le=100)
    apply_esg_to_all: bool = False
    lookback: int = Field(default=60, ge=20, le=120)
    risk_aversion: float = Field(default=5, ge=0.1, le=100)
    start_date: date | None = None
    end_date: date | None = None

    @model_validator(mode="after")
    def valid_period(self):
        if self.start_date and self.end_date and self.start_date >= self.end_date:
            raise ValueError("Start close must precede end close")
        return self
