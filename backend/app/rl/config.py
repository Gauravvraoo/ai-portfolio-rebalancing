from pydantic import BaseModel, Field, model_validator
from app.rl.data import ESG
from app.rl.constraints import Constraints


class ExperimentConfig(BaseModel):
    mode: str = Field(default="quick", pattern="^(quick|standard)$")
    seed: int = Field(default=7, ge=0, le=1000000)
    fee_bps: float = Field(default=10, ge=0, le=100, allow_inf_nan=False)
    slippage_bps: float = Field(default=5, ge=0, le=100, allow_inf_nan=False)
    cash_annual_return: float = Field(default=0.02, ge=0, le=0.2, allow_inf_nan=False)
    min_esg: float = Field(default=65, ge=0, le=100, allow_inf_nan=False)
    min_weights: list[float] = Field(
        default_factory=lambda: [0, 0, 0, 0, 0.02], min_length=5, max_length=5
    )
    max_weights: list[float] = Field(
        default_factory=lambda: [0.6, 0.6, 0.6, 0.6, 0.6], min_length=5, max_length=5
    )
    risk_penalty: float = Field(default=0.5, ge=0, le=10, allow_inf_nan=False)
    drawdown_penalty: float = Field(default=0.1, ge=0, le=10, allow_inf_nan=False)
    cost_penalty: float = Field(default=1, ge=0, le=10, allow_inf_nan=False)
    esg_penalty: float = Field(default=0.5, ge=0, le=10, allow_inf_nan=False)

    @model_validator(mode="after")
    def feasible(self):
        Constraints(self.min_weights, self.max_weights, ESG, self.min_esg)
        return self

    @property
    def timesteps(self):
        return 512 if self.mode == "quick" else 8192


PPO_SETTINGS = {
    "n_steps": 128,
    "batch_size": 64,
    "n_epochs": 5,
    "learning_rate": 0.0003,
    "policy_kwargs": {"net_arch": [32, 32]},
}
