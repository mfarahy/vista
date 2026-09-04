## VLM-based floorplan refinement

Since CubiCasa5K has noisy GT annotations, this causes the artifacts to some predicted results. Thus, we demonstrate that we can enforce geometric constraints via a VLM-based vectorization refinement (see figure below), demonstrating that our semantic representation is also useful for post-process refinement schemes.

<img src="../assets/vlm_refinement_diagram.png" width=100% height=80%>

### Installation
[Gemini CLI](https://geminicli.com/docs/get-started/installation/) is required.
```bash
npm install -g @google/gemini-cli
```

### Inference 
Assumes CubiCasa5K predictions have been precomputed and stored as JSON files.
```bash
bash vlm_refinement/tools/run.sh
```