# Topic

## Discussion

Prove whether a single-hop Claude handoff can directly write shared collaboration files

## Goals

- Run one clean `single_hop_only` handoff to Claude
- Verify direct-write capability by requiring a real file mutation, not just a self-report
- Preserve a truthful audit trail regardless of success or fallback

## Hard Requirements

- All communication must be logged in `agent_collab/2026-03-19-single-hop-proof-demo/`
- Claude must be instructed not to call any other agent
- If Claude cannot write files directly, it must not pretend otherwise
- No fabricated `pickup` entry

## Current Constraints

- A prior rehearsal gave inconsistent self-reports about write access
- This test must verify file write capability by inspecting the files after the call
- This is a protocol rehearsal, not a code review

## Scope

- In scope: single-hop instruction, direct-write proof, proxy-recorded fallback
- Out of scope: code changes, hidden-agent detection beyond explicit instruction, checksum design
