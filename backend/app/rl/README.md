# Reinforcement learning integration boundary

Phase 1 deliberately does not train an AI model. A future Gymnasium environment can consume the dated asset-price matrix from `services.portfolio.market` and emit validated long-only allocations. Keep PPO training jobs separate from HTTP request handling; persist job states, seeds, parameters and model artifacts before exposing training controls. Evaluate on held-out time periods with explicit transaction costs, risk and ESG constraints. No Gymnasium or Stable-Baselines3 dependency is needed in Phase 1.
