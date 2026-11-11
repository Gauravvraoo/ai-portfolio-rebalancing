# PPO research subsystem

- `data.py`: immutable synthetic fixture loader, dataset manifest, chronological intervals.
- `environment.py`: Gymnasium contract, causal observations, execution accounting, reward terms.
- `constraints.py`: bounded-simplex projection and feasible ESG repair.
- `config.py`: validated experiment configuration and infeasibility rejection.
- `jobs.py`: FastAPI job routes and subprocess launcher; run one API worker.
- `worker.py`: independent CPU PPO training, validation checkpoint selection and held-out evaluation.
- `storage.py`: atomic JSON persistence and configurable experiment directory.

Read the root README for data provenance, reward equations, operational limitations, installation and verification commands. Model zip files are trusted local artifacts only; never load models supplied by untrusted parties.
